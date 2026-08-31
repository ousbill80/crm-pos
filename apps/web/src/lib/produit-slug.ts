/** Aperçu slug boutique (unicité garantie côté API à la création). */
export function slugifyProduitDesignation(designation: string): string {
  return designation
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
