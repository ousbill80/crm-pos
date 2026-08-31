/** Référence / SKU auto depuis désignation + catégorie (40 car. max). */
export function genererReferenceProduit(
  designation: string,
  categorie?: string,
): string {
  const cat =
    categorie
      ?.trim()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4) || 'ART';
  const base = designation
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 22);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${cat}-${base || 'SKU'}-${suffix}`.slice(0, 40);
}
