/** Slug URL boutique à partir d'une désignation (sans garantie d'unicité). */
export function slugifyProduitDesignation(designation: string): string {
  return designation
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
