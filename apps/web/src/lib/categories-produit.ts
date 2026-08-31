/** Catégories catalogue MAJOR AUTO PARTS (alignées boutique web). */
export const CATEGORIES_PRODUIT_CANON = [
  'Tuning Performance',
  'Jantes & Pneus',
  'Phares',
  'Éclairage',
  'Housses',
  'Électronique',
  'Mécanique',
  'Accessoires Premium',
] as const;

/** Anciennes catégories GSM — compatibilité données historiques. */
export const CATEGORIES_PRODUIT_LEGACY = [
  'Protection',
  'Charge',
  'Audio',
  'Câbles',
  'Accessoires',
  'Café-Market',
  'Autre',
] as const;

export const CATEGORIE_AUTRE = '__autre__';

/** Fusionne API + référentiel + valeur courante (sans doublons, tri FR). */
export function fusionnerCategoriesProduit(
  fromApi: readonly string[],
  valeurCourante?: string | null,
): string[] {
  const set = new Set<string>([
    ...CATEGORIES_PRODUIT_CANON,
    ...CATEGORIES_PRODUIT_LEGACY,
    ...fromApi,
  ]);
  const courante = valeurCourante?.trim();
  if (courante) set.add(courante);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}
