import { CATEGORIES } from './brand';

const CAT_TONES = [
  'tone-a',
  'tone-b',
  'tone-c',
  'tone-d',
  'tone-e',
  'tone-f',
  'tone-g',
  'tone-h',
] as const;

const SLUG_BY_LABEL = new Map(CATEGORIES.map((c) => [c.label, c.slug]));

export function slugifyCategorie(label: string): string {
  const known = SLUG_BY_LABEL.get(label);
  if (known) return known;
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, 'et')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

export function toneCategorie(slug: string): string {
  const known: Record<string, string> = {
    tuning: 'tone-a',
    jantes: 'tone-b',
    phares: 'tone-c',
    eclairage: 'tone-d',
    housses: 'tone-e',
    electronique: 'tone-f',
    mecanique: 'tone-g',
    accessoires: 'tone-h',
  };
  if (known[slug]) return known[slug];
  let h = 0;
  for (const c of slug) h = (h + c.charCodeAt(0)) % CAT_TONES.length;
  return CAT_TONES[h] ?? 'tone-a';
}

export type CategorieRayon = {
  slug: string;
  label: string;
  hint: string;
};

/** Rayons catalogue : référentiel boutique + catégories API (sans doublon). */
export function fusionnerRayonsCatalogue(apiCategories: readonly string[]): CategorieRayon[] {
  const byLabel = new Map<string, CategorieRayon>();
  for (const c of CATEGORIES) {
    byLabel.set(c.label, { slug: c.slug, label: c.label, hint: c.hint });
  }
  for (const label of apiCategories) {
    const trimmed = label.trim();
    if (!trimmed || byLabel.has(trimmed)) continue;
    byLabel.set(trimmed, {
      slug: slugifyCategorie(trimmed),
      label: trimmed,
      hint: trimmed,
    });
  }
  return Array.from(byLabel.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  );
}
