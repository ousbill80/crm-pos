import { colors } from '../ui';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * URL image produit fiable sur web/mobile.
 * - data: / http(s) / chemin API tels quels
 * - sinon pastille SVG locale (pas de dépendance picsum / CORS)
 */
export function resolveProduitImageUrl(
  imageUrl: string | null | undefined,
  label = 'Article',
): string {
  const u = imageUrl?.trim();
  if (u) {
    if (
      u.startsWith('data:') ||
      u.startsWith('http://') ||
      u.startsWith('https://')
    ) {
      // picsum redirige souvent → échec Image RN-web ; on force un rendu local
      if (u.includes('picsum.photos')) {
        return svgPlaceholder(label);
      }
      return u;
    }
    if (u.startsWith('/')) return `${API_BASE}${u}`;
    return u;
  }
  return svgPlaceholder(label);
}

const PALETTE = [
  '#0F766E',
  '#0E7490',
  '#0369A1',
  '#4338CA',
  '#A16207',
  '#B45309',
  '#BE123C',
  '#047857',
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pastille SVG encodée — toujours affichable hors-ligne. */
export function svgPlaceholder(label: string): string {
  const bg = colorFor(label || 'x');
  const text = escapeXml(initials(label));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${colors.accentText}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" rx="36" fill="url(#g)"/>
  <circle cx="190" cy="50" r="40" fill="rgba(255,255,255,0.12)"/>
  <text x="120" y="132" text-anchor="middle" font-family="system-ui,sans-serif" font-size="64" font-weight="800" fill="#fff">${text}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
