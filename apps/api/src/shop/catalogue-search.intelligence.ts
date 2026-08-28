/**
 * Intelligence de recherche catalogue shop —
 * aliases marques, tokens, synonymes rayon (sans dépendance LLM).
 */

export type CatalogueTri = 'prix_asc' | 'prix_desc' | 'designation';

/** Canonique (libellé UI) → variantes recherchées en base. */
export const MARQUE_ALIASES: Record<string, string[]> = {
  MERCEDES: ['mercedes', 'mercedes-benz', 'mercedes benz', 'mb', 'amg', 'benz'],
  TOYOTA: ['toyota'],
  BMW: ['bmw'],
  AUDI: ['audi'],
  'LAND ROVER': ['land rover', 'landrover', 'range rover', 'rangerover', 'lr'],
  HYUNDAI: ['hyundai'],
  HONDA: ['honda'],
  FORD: ['ford'],
  GEELY: ['geely'],
  HAVAL: ['haval'],
  CHANGAN: ['changan'],
  RENAULT: ['renault', 'dacia'],
  CITROËN: ['citroën', 'citroen', 'ds'],
  CHEVROLET: ['chevrolet', 'chevy', 'gm'],
  SUZUKI: ['suzuki'],
  VOLKSWAGEN: ['volkswagen', 'vw', 'volkwagen'],
};

/** Synonymes → libellé catégorie catalogue (si présent en base). */
export const CATEGORIE_SYNONYMES: Record<string, string[]> = {
  'Jantes & Pneus': [
    'jante',
    'jantes',
    'pneu',
    'pneus',
    'roue',
    'roues',
    'alliage',
  ],
  Phares: ['phare', 'phares', 'optique', 'optiques', 'xénon', 'xenon'],
  Éclairage: [
    'éclairage',
    'eclairage',
    'led',
    'ampoule',
    'ampoules',
    'barre led',
  ],
  Housses: ['housse', 'housses', 'siège', 'siege', 'cuir'],
  Électronique: [
    'électronique',
    'electronique',
    'caméra',
    'camera',
    'multimédia',
    'multimedia',
    'autoradio',
  ],
  Mécanique: [
    'mécanique',
    'mecanique',
    'frein',
    'freins',
    'filtre',
    'filtres',
    'moteur',
    'amortisseur',
    'plaquette',
  ],
  'Tuning Performance': [
    'tuning',
    'sport',
    'échappement',
    'echappement',
    'admission',
  ],
  'Accessoires Premium': ['accessoire', 'accessoires', 'finition', 'style'],
};

export type InterpretedCatalogueQuery = {
  /** Marque canonique détectée ou demandée. */
  marque: string | null;
  /** Termes OR pour filtre marque (aliases). */
  marqueTerms: string[];
  /** Tokens de recherche libre (AND entre tokens). */
  tokens: string[];
  /** Catégorie déduite des synonymes si aucune catégorie explicite. */
  categorieImplied: string | null;
  /** Phrase originale nettoyée. */
  raw: string;
};

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function canonicalizeMarque(input: string): string | null {
  const f = fold(input).replace(/\s+/g, ' ');
  for (const [canon, aliases] of Object.entries(MARQUE_ALIASES)) {
    if (fold(canon) === f) return canon;
    if (aliases.some((a) => fold(a) === f)) return canon;
  }
  return null;
}

/** Détecte une marque connue au début / en entier dans la requête. */
export function detectMarqueInText(text: string): string | null {
  const f = fold(text);
  if (!f) return null;
  // Correspondance exacte d’abord
  const exact = canonicalizeMarque(f);
  if (exact) return exact;
  // Plus long alias d’abord (land rover avant rover)
  const candidates: Array<{ canon: string; alias: string }> = [];
  for (const [canon, aliases] of Object.entries(MARQUE_ALIASES)) {
    for (const alias of [fold(canon), ...aliases.map(fold)]) {
      candidates.push({ canon, alias });
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  for (const { canon, alias } of candidates) {
    if (alias.length < 2) continue;
    const re = new RegExp(
      `(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`,
      'i',
    );
    if (re.test(f)) return canon;
  }
  return null;
}

export function marqueSearchTerms(canon: string): string[] {
  const aliases = MARQUE_ALIASES[canon] ?? [fold(canon)];
  const set = new Set<string>([canon, ...aliases]);
  return [...set];
}

function implyCategorie(tokens: string[]): string | null {
  const joined = tokens.map(fold);
  for (const [label, syns] of Object.entries(CATEGORIE_SYNONYMES)) {
    for (const syn of syns) {
      const s = fold(syn);
      if (joined.some((t) => t === s || t.includes(s) || s.includes(t))) {
        return label;
      }
    }
  }
  return null;
}

/**
 * Interprète recherche libre + filtre marque explicite.
 * - `marque` query gagne s’il est valide
 * - sinon détection dans le texte, puis retrait du token marque des tokens libres
 */
export function interpretCatalogueQuery(input: {
  recherche?: string | null;
  marque?: string | null;
  categorie?: string | null;
}): InterpretedCatalogueQuery {
  const raw = (input.recherche ?? '').trim();
  const marque =
    (input.marque ? canonicalizeMarque(input.marque) : null) ??
    (raw ? detectMarqueInText(raw) : null);

  let tokens = raw
    ? raw
        .split(/[\s,;|/]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    : [];

  if (marque) {
    const terms = marqueSearchTerms(marque).map(fold);
    tokens = tokens.filter((t) => {
      const ft = fold(t);
      return !terms.some(
        (alias) => ft === alias || alias.includes(ft) || ft.includes(alias),
      );
    });
  }

  const categorieImplied =
    input.categorie && input.categorie.trim()
      ? null
      : implyCategorie(tokens.length ? tokens : raw ? [raw] : []);

  return {
    marque,
    marqueTerms: marque ? marqueSearchTerms(marque) : [],
    tokens,
    categorieImplied,
    raw,
  };
}

/** Champs texte scrapés pour un token (OR). */
export function tokenFieldOr(token: string) {
  return [
    { designation: { contains: token, mode: 'insensitive' as const } },
    { reference: { contains: token, mode: 'insensitive' as const } },
    { description: { contains: token, mode: 'insensitive' as const } },
    { attributs: { contains: token, mode: 'insensitive' as const } },
    { slug: { contains: token, mode: 'insensitive' as const } },
    { categorie: { contains: token, mode: 'insensitive' as const } },
  ];
}

export function marqueFieldOr(terms: string[]) {
  return terms.flatMap((term) => [
    { designation: { contains: term, mode: 'insensitive' as const } },
    { description: { contains: term, mode: 'insensitive' as const } },
    { attributs: { contains: term, mode: 'insensitive' as const } },
    { reference: { contains: term, mode: 'insensitive' as const } },
  ]);
}
