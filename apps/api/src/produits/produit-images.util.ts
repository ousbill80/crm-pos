/** Parse le champ JSON `imagesUrls` (array de strings). */
export function parseImagesUrls(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
      .map((u) => u.trim());
  } catch {
    return [];
  }
}

/** Sérialise une galerie (sans la photo de couverture). */
export function serializeImagesUrls(urls: string[]): string | null {
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  if (!clean.length) return null;
  return JSON.stringify(clean);
}

/** Galerie complète pour le shop : couverture + extras dédupliqués. */
export function buildGalerieProduit(
  imageUrl: string | null | undefined,
  imagesUrls: string | null | undefined,
): string[] {
  const imgs: string[] = [];
  const push = (url: string | null | undefined) => {
    if (!url?.trim()) return;
    if (url.startsWith('data:image/svg')) return;
    if (!imgs.includes(url)) imgs.push(url);
  };
  push(imageUrl);
  for (const u of parseImagesUrls(imagesUrls)) push(u);
  return imgs;
}
