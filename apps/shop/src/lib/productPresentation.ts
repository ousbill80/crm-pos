/** Intelligence présentation variantes / specs selon type & catégorie (esprit Temu). */

export type AttributsMap = Record<string, string>;

export type ProduitVariante = {
  id: string;
  slug: string | null;
  designation: string;
  reference?: string | null;
  prixAffiche: number;
  stockDisponible?: number | null;
  imageUrl?: string | null;
  imagesUrls?: string | null;
  attributs?: string | null;
  attributsMap?: AttributsMap;
};

export type StockRetraitBoutique = {
  boutiqueId: string;
  nom: string;
  disponible: number;
};

export type ProduitDetail = {
  id: string;
  slug: string | null;
  designation: string;
  reference?: string | null;
  prixAffiche: number;
  categorie: string | null;
  imageUrl?: string | null;
  imagesUrls?: string | null;
  stockDisponible?: number | null;
  stocksRetrait?: StockRetraitBoutique[];
  description?: string | null;
  prixUnitaireHt?: number;
  prixUnitaireTtc?: number;
  modeAffichage?: string;
  typeProduit?: string;
  attributs?: string | null;
  attributsMap?: AttributsMap;
  parentId?: string | null;
  variantes?: ProduitVariante[];
};

export type VariantAxis = {
  key: string;
  label: string;
  kind: 'swatch' | 'pill' | 'chip';
  options: Array<{
    value: string;
    slug: string | null;
    produitId: string;
    available: boolean;
    selected: boolean;
  }>;
};

const AXIS_ORDER: Record<string, string[]> = {
  phares: ['Culot', 'Couleur', 'Température', 'Puissance', 'Variante'],
  eclairage: ['Couleur', 'Longueur', 'Puissance', 'Variante'],
  jantes: ['Taille', 'Entraxe', 'Finition', 'Couleur', 'Variante'],
  housses: ['Couleur', 'Matière', 'Places', 'Variante'],
  electronique: ['Capacité', 'Couleur', 'Compatibilité', 'Variante'],
  tuning: ['Finition', 'Couleur', 'Modèle', 'Variante'],
  mecanique: ['Référence', 'Viscosité', 'Dimension', 'Variante'],
  accessoires: ['Couleur', 'Taille', 'Variante'],
  default: ['Couleur', 'Taille', 'Modèle', 'Culot', 'Variante'],
};

const AXIS_KIND: Record<string, 'swatch' | 'pill' | 'chip'> = {
  Couleur: 'swatch',
  Finition: 'swatch',
  Culot: 'pill',
  Taille: 'pill',
  Capacité: 'pill',
  Puissance: 'pill',
  Température: 'pill',
  Viscosité: 'pill',
  Dimension: 'pill',
  Entraxe: 'chip',
  Matière: 'chip',
  Places: 'chip',
  Compatibilité: 'chip',
  Modèle: 'chip',
  Référence: 'chip',
  Variante: 'chip',
};

const COLOR_HEX: Record<string, string> = {
  noir: '#1a1c22',
  black: '#1a1c22',
  blanc: '#f5f5f5',
  white: '#f5f5f5',
  rouge: '#c0392b',
  red: '#c0392b',
  bleu: '#2f6fed',
  blue: '#2f6fed',
  gris: '#8b939e',
  grey: '#8b939e',
  gray: '#8b939e',
  argent: '#c0c4cc',
  silver: '#c0c4cc',
  or: '#c9a227',
  gold: '#c9a227',
  jaune: '#e0b84a',
  yellow: '#e0b84a',
  carbone: '#2a2d33',
  chrome: '#d8dde6',
};

export function categoryFamily(categorie: string | null | undefined): string {
  const c = (categorie ?? '').toLowerCase();
  if (/phare/.test(c)) return 'phares';
  if (/éclair|eclair|led|lum/.test(c)) return 'eclairage';
  if (/jante|pneu/.test(c)) return 'jantes';
  if (/housse|siège|siege/.test(c)) return 'housses';
  if (/électron|electron|audio|caméra|camera/.test(c)) return 'electronique';
  if (/tuning|sport|perf/.test(c)) return 'tuning';
  if (/mécan|mecan|filtre|frein|huile/.test(c)) return 'mecanique';
  if (/access/.test(c)) return 'accessoires';
  return 'default';
}

/** Enrichit attributsMap depuis la désignation (ex. H7, 18", 64 Go). */
export function enrichAttributsFromDesignation(
  designation: string,
  map: AttributsMap,
  family: string,
): AttributsMap {
  const out = { ...map };
  const d = designation;

  if (!out.Culot) {
    const culot = d.match(/\b(H[1-9]|H1[0-5]|HB[3-5]|D[1-4]S?|900[5-8]|T10|W5W)\b/i);
    if (culot) out.Culot = culot[1].toUpperCase();
  }
  if (!out.Taille) {
    const pouce = d.match(/\b(1[4-9]|2[0-2])\s*["”']|\b(1[4-9]|2[0-2])\s*pouces?\b/i);
    if (pouce) out.Taille = `${pouce[1] ?? pouce[2]}"`;
  }
  if (!out.Capacité) {
    const cap = d.match(/\b(\d+)\s*(Go|GB|To|TB)\b/i);
    if (cap) out.Capacité = `${cap[1]} ${cap[2]}`;
  }
  if (!out['Température'] && family === 'phares') {
    const k = d.match(/\b(\d{3,4})\s*K\b/i);
    if (k) out['Température'] = `${k[1]}K`;
  }
  if (!out.Couleur) {
    for (const name of Object.keys(COLOR_HEX)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(d)) {
        out.Couleur = name.charAt(0).toUpperCase() + name.slice(1);
        break;
      }
    }
  }
  return out;
}

export function colorSwatch(value: string): string | null {
  const key = value.trim().toLowerCase();
  return COLOR_HEX[key] ?? null;
}

export function buildVariantAxes(
  current: ProduitDetail,
  variantes: ProduitVariante[],
): VariantAxis[] {
  const family = categoryFamily(current.categorie);
  const order = AXIS_ORDER[family] ?? AXIS_ORDER.default;
  const all = [current, ...variantes].map((p) => {
    const base = { ...(p.attributsMap ?? {}) };
    const enriched = enrichAttributsFromDesignation(
      p.designation,
      base,
      family,
    );
    return { ...p, attributsMap: enriched };
  });

  const keys = new Set<string>();
  for (const p of all) {
    Object.keys(p.attributsMap ?? {}).forEach((k) => keys.add(k));
  }
  if (keys.size === 0) return [];

  const sortedKeys = [
    ...order.filter((k) => keys.has(k)),
    ...[...keys].filter((k) => !order.includes(k)).sort(),
  ];

  const currentMap =
    all.find((p) => p.id === current.id)?.attributsMap ?? {};

  return sortedKeys
    .map((key) => {
      const values = new Map<string, VariantAxis['options'][number]>();
      for (const p of all) {
        const value = p.attributsMap?.[key];
        if (!value) continue;
        const available =
          p.stockDisponible == null || p.stockDisponible > 0;
        const existing = values.get(value);
        if (!existing) {
          values.set(value, {
            value,
            slug: p.slug,
            produitId: p.id,
            available,
            selected: p.id === current.id,
          });
        } else if (p.id === current.id) {
          existing.selected = true;
          existing.slug = p.slug;
          existing.produitId = p.id;
        }
      }
      if (values.size < 2 && !currentMap[key]) return null;
      if (values.size === 0) return null;
      // Afficher l'axe même avec 1 valeur si c'est une info utile (Temu montre aussi)
      return {
        key,
        label: key,
        kind: AXIS_KIND[key] ?? 'chip',
        options: [...values.values()],
      } satisfies VariantAxis;
    })
    .filter((x): x is VariantAxis => x != null)
    .filter((axis) => axis.options.length >= 1);
}

export function typeSpecificHighlights(
  current: ProduitDetail,
): Array<{ label: string; value: string }> {
  const family = categoryFamily(current.categorie);
  const map = enrichAttributsFromDesignation(
    current.designation,
    { ...(current.attributsMap ?? {}) },
    family,
  );
  const rows: Array<{ label: string; value: string }> = [];

  if (current.typeProduit === 'PRESTATION') {
    rows.push({ label: 'Type', value: 'Prestation / service' });
  } else {
    rows.push({ label: 'Type', value: 'Article physique' });
  }

  for (const [k, v] of Object.entries(map)) {
    rows.push({ label: k, value: v });
  }

  if (current.reference) {
    rows.push({ label: 'Référence', value: current.reference });
  }
  if (current.categorie) {
    rows.push({ label: 'Rayon', value: current.categorie });
  }

  // Guides type produit (Temu-like detail blocks)
  if (family === 'phares') {
    rows.push({
      label: 'Conseil montage',
      value: 'Vérifier le culot (H7/H4/…) et le faisceau avant installation',
    });
  } else if (family === 'jantes') {
    rows.push({
      label: 'Conseil montage',
      value: 'Contrôler entraxe, déport (ET) et diamètre de moyeu',
    });
  } else if (family === 'housses') {
    rows.push({
      label: 'Conseil montage',
      value: 'Indiquer la marque / modèle / année du véhicule au showroom',
    });
  } else if (family === 'mecanique') {
    rows.push({
      label: 'Conseil montage',
      value: 'Référence constructeur recommandée — atelier disponible',
    });
  }

  // dédupliquer labels
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });
}

export function findVariantForSelection(
  current: ProduitDetail,
  variantes: ProduitVariante[],
  axisKey: string,
  value: string,
): ProduitVariante | ProduitDetail | null {
  const family = categoryFamily(current.categorie);
  const all = [current, ...variantes].map((p) => ({
    ...p,
    attributsMap: enrichAttributsFromDesignation(
      p.designation,
      { ...(p.attributsMap ?? {}) },
      family,
    ),
  }));
  const currentMap =
    all.find((p) => p.id === current.id)?.attributsMap ?? {};

  const target = { ...currentMap, [axisKey]: value };
  const exact = all.find((p) => {
    const m = p.attributsMap ?? {};
    return Object.entries(target).every(([k, v]) => m[k] === v);
  });
  if (exact) return exact;

  return (
    all.find((p) => (p.attributsMap ?? {})[axisKey] === value) ?? null
  );
}
