// Import catalogue POS (§6.3.2) — mapping dynamique des colonnes CSV/Excel.
// Le stock n'est jamais PATCHé : colonne stock = stock initial à la création
// seulement (écriture AJUSTEMENT), ignorée sur une fiche déjà existante.

export const CHAMPS_IMPORT = [
  'designation',
  'reference',
  'codeBarres',
  'categorie',
  'description',
  'prixUnitaire',
  'seuilReappro',
  'actif',
  'stock',
  'uniteMesure',
  'methodeCout',
  'strategieSortie',
  'attributs',
] as const;

export type ChampImport = (typeof CHAMPS_IMPORT)[number];

export type MappingImport = Partial<Record<ChampImport, string | null>>;

const ALIAS: Record<ChampImport, string[]> = {
  designation: [
    'designation',
    'désignation',
    'nom',
    'name',
    'libelle',
    'libellé',
    'produit',
    'article',
    'item',
    'intitule',
    'intitulé',
  ],
  reference: [
    'reference',
    'référence',
    'ref',
    'sku',
    'code',
    'codearticle',
    'codeproduit',
    'coderef',
  ],
  codeBarres: [
    'codebarres',
    'codebarre',
    'ean',
    'ean13',
    'gtin',
    'barcode',
    'codebar',
  ],
  categorie: [
    'categorie',
    'catégorie',
    'category',
    'famille',
    'rayon',
    'groupe',
  ],
  description: ['description', 'desc', 'details', 'détails', 'commentaire'],
  prixUnitaire: [
    'prixunitaire',
    'prix',
    'prixvente',
    'prixdevente',
    'pv',
    'pvp',
    'tarif',
    'price',
    'sellingprice',
    'montant',
  ],
  seuilReappro: [
    'seuilreappro',
    'seuil',
    'stockmin',
    'min',
    'reorder',
    'seuilalerte',
  ],
  actif: ['actif', 'active', 'enabled', 'statutcatalogue', 'envente'],
  stock: [
    'stock',
    'qte',
    'quantite',
    'quantité',
    'qty',
    'stockinitial',
    'stockreseau',
    'stockréseau',
  ],
  uniteMesure: ['unitemesure', 'unite', 'unité', 'uom', 'udm'],
  methodeCout: ['methodecout', 'méthodecout', 'cout', 'costing'],
  strategieSortie: [
    'strategiesortie',
    'stratégiesortie',
    'sortie',
    'fifo',
    'fefo',
  ],
  attributs: ['attributs', 'variante', 'variant', 'attrs'],
};

const IGNORES = new Set([
  'id',
  'uuid',
  'cmp',
  'coutmoyenpondere',
  'coûtmoyenpondéré',
  'margeunitaire',
  'marge',
  'tauxdemarge',
  'tauxdemargepct',
  'statutstock',
  'valeurstock',
  'valeurstockcmp',
]);

export function normaliserEntete(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function proposerMapping(enTetes: string[]): MappingImport {
  const mapping: MappingImport = {};
  const pris = new Set<string>();

  const meilleur = (champ: ChampImport): { header: string; score: number } | null => {
    let best: { header: string; score: number } | null = null;
    for (const h of enTetes) {
      if (pris.has(h)) continue;
      const n = normaliserEntete(h);
      if (!n || IGNORES.has(n)) continue;
      let score = 0;
      for (const alias of ALIAS[champ]) {
        score = Math.max(score, scoreAlias(n, alias));
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { header: h, score };
      }
    }
    return best;
  };

  for (const champ of CHAMPS_IMPORT) {
    const hit = meilleur(champ);
    if (hit && hit.score >= 60) {
      mapping[champ] = hit.header;
      pris.add(hit.header);
    }
  }
  return mapping;
}

/** 100 = égalité, 80 = préfixe long, 60 = alias contenu dans l’en-tête. */
export function scoreAlias(enteteNorm: string, alias: string): number {
  if (enteteNorm === alias) return 100;
  if (alias.length < 5) return 0;
  if (enteteNorm.startsWith(alias) || (enteteNorm.length >= 5 && alias.startsWith(enteteNorm))) {
    return 80;
  }
  if (enteteNorm.includes(alias)) return 60;
  return 0;
}

export function parseNombre(valeur: string): number | null {
  const raw = valeur.trim();
  if (!raw) return null;
  let s = raw.replace(/\s/g, '').replace(/[€$]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseEntier(valeur: string): number | null {
  const n = parseNombre(valeur);
  if (n === null) return null;
  const i = Math.round(n);
  return i >= 0 ? i : null;
}

export function parseBooleen(valeur: string): boolean | null {
  const n = normaliserEntete(valeur);
  if (['oui', 'yes', 'true', '1', 'actif', 'active', 'vrai'].includes(n))
    return true;
  if (['non', 'no', 'false', '0', 'inactif', 'inactive', 'faux'].includes(n))
    return false;
  return null;
}

export interface LigneImportParse {
  index: number;
  designation?: string;
  reference?: string;
  codeBarres?: string;
  categorie?: string;
  description?: string;
  prixUnitaire?: number;
  seuilReappro?: number | null;
  actif?: boolean;
  stock?: number;
  uniteMesure?: string;
  methodeCout?: 'CMP' | 'FIFO' | 'STANDARD';
  strategieSortie?: 'FIFO' | 'FEFO';
  attributs?: string;
  erreurs: string[];
  avertissements: string[];
}

export function cellOf(
  enTetes: string[],
  ligne: string[],
  mapping: MappingImport,
  champ: ChampImport,
): string {
  const header = mapping[champ];
  if (!header) return '';
  const idx = enTetes.findIndex((h) => h === header);
  if (idx < 0) return '';
  return ligne[idx] ?? '';
}

export function parserLigneCatalogue(
  enTetes: string[],
  ligne: string[],
  mapping: MappingImport,
  index: number,
): LigneImportParse {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const get = (c: ChampImport) => cellOf(enTetes, ligne, mapping, c).trim();

  const designation = get('designation');
  const reference = get('reference');
  const codeBarres = get('codeBarres');
  const categorie = get('categorie');
  const description = get('description');
  const prixRaw = get('prixUnitaire');
  const seuilRaw = get('seuilReappro');
  const actifRaw = get('actif');
  const stockRaw = get('stock');
  const uniteMesure = get('uniteMesure');
  const methodeRaw = get('methodeCout').toUpperCase();
  const strategieRaw = get('strategieSortie').toUpperCase();
  const attributs = get('attributs');

  const parsed: LigneImportParse = { index, erreurs, avertissements };

  if (designation) parsed.designation = designation.slice(0, 160);
  if (reference) parsed.reference = reference.slice(0, 40);
  if (codeBarres) parsed.codeBarres = codeBarres.slice(0, 64);
  if (categorie) parsed.categorie = categorie.slice(0, 64);
  if (description) parsed.description = description.slice(0, 500);
  if (attributs) parsed.attributs = attributs.slice(0, 160);
  if (uniteMesure) parsed.uniteMesure = uniteMesure.slice(0, 16);

  if (prixRaw) {
    const prix = parseNombre(prixRaw);
    if (prix === null || prix <= 0) {
      erreurs.push(`Prix invalide (« ${prixRaw} »).`);
    } else {
      parsed.prixUnitaire = prix;
    }
  }

  if (seuilRaw) {
    const seuil = parseEntier(seuilRaw);
    if (seuil === null)
      erreurs.push(`Seuil réappro invalide (« ${seuilRaw} »).`);
    else parsed.seuilReappro = seuil;
  }

  if (actifRaw) {
    const actif = parseBooleen(actifRaw);
    if (actif === null)
      avertissements.push(`Statut actif ignoré (« ${actifRaw} »).`);
    else parsed.actif = actif;
  }

  if (stockRaw) {
    const stock = parseEntier(stockRaw);
    if (stock === null) {
      avertissements.push(
        `Stock ignoré (« ${stockRaw} ») — grand livre append-only.`,
      );
    } else {
      parsed.stock = stock;
    }
  }

  if (methodeRaw) {
    if (
      methodeRaw === 'CMP' ||
      methodeRaw === 'FIFO' ||
      methodeRaw === 'STANDARD'
    ) {
      parsed.methodeCout = methodeRaw;
    } else {
      avertissements.push(`Méthode de coût ignorée (« ${methodeRaw} »).`);
    }
  }

  if (strategieRaw) {
    if (strategieRaw === 'FIFO' || strategieRaw === 'FEFO') {
      parsed.strategieSortie = strategieRaw;
    } else {
      avertissements.push(`Stratégie de sortie ignorée (« ${strategieRaw} »).`);
    }
  }

  if (!parsed.designation && !parsed.reference && !parsed.codeBarres && parsed.prixUnitaire === undefined) {
    return parsed;
  }

  return parsed;
}

export function estLigneImportVide(ligne: LigneImportParse): boolean {
  return (
    !ligne.designation &&
    !ligne.reference &&
    !ligne.codeBarres &&
    ligne.prixUnitaire === undefined &&
    ligne.erreurs.length === 0
  );
}

export const MAX_LIGNES_IMPORT = 2000;
