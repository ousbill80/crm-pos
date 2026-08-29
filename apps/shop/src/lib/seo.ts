import { CATEGORIES } from './brand';

export const SHOP_ORIGIN =
  (import.meta.env.VITE_SHOP_PUBLIC_URL as string | undefined)?.replace(
    /\/$/,
    '',
  ) || 'https://www.majorautoparts.shop';

export const DEFAULT_OG_IMAGE = `${SHOP_ORIGIN}/hero-major.jpg`;

const TITLE_SUFFIX = 'MAJOR AUTO PARTS';

export type SeoPayload = {
  title: string;
  description: string;
  path: string;
  image?: string;
  robots?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
};

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SHOP_ORIGIN}${p}`;
}

export function clipMeta(text: string, max = 158): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function withBrand(title: string): string {
  if (title.includes(TITLE_SUFFIX)) return title;
  return `${title} | ${TITLE_SUFFIX}`;
}

export const DEFAULT_DESCRIPTION = clipMeta(
  'Pièces auto à Abidjan : phares LED, jantes, freins, huile, électronique. Livraison Côte d’Ivoire, retrait showroom, Wave et Orange Money.',
);

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': ['AutoPartsStore', 'AutomotiveBusiness'],
    name: 'MAJOR AUTO PARTS',
    url: SHOP_ORIGIN,
    image: DEFAULT_OG_IMAGE,
    logo: `${SHOP_ORIGIN}/icons/icon-512.png`,
    description: DEFAULT_DESCRIPTION,
    areaServed: [
      { '@type': 'City', name: 'Abidjan' },
      { '@type': 'Country', name: 'Côte d’Ivoire' },
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Abidjan',
      addressCountry: 'CI',
    },
    currenciesAccepted: 'XOF',
    paymentAccepted: 'Carte bancaire, Orange Money, Wave, paiement au retrait',
    priceRange: '$$',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Catalogue pièces automobiles',
      itemListElement: CATEGORIES.map((c) => ({
        '@type': 'OfferCatalog',
        name: c.label,
        url: absoluteUrl(`/catalogue/${encodeURIComponent(c.label)}`),
      })),
    },
  };
}

export function seoForPath(
  pathname: string,
  search = '',
): SeoPayload | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const q = params.get('q')?.trim();
  const marque = params.get('marque')?.trim();

  if (
    path.startsWith('/panier') ||
    path.startsWith('/checkout') ||
    path.startsWith('/compte') ||
    path.startsWith('/suivi') ||
    path.startsWith('/avis')
  ) {
    return {
      title: withBrand('Espace client'),
      description: DEFAULT_DESCRIPTION,
      path,
      robots: 'noindex, nofollow',
    };
  }

  if (path.startsWith('/produit/')) {
    return null;
  }

  if (path === '/') {
    return {
      title: withBrand('Pièces auto Abidjan, Côte d’Ivoire'),
      description: DEFAULT_DESCRIPTION,
      path: '/',
      jsonLd: organizationJsonLd(),
    };
  }

  if (path === '/catalogue') {
    const bits = [
      q ? `Recherche « ${q} »` : 'Catalogue pièces automobiles',
      marque ? `compatible ${marque}` : 'toutes marques',
      'Abidjan et Côte d’Ivoire',
    ];
    return {
      title: withBrand(
        q
          ? `Pièces auto « ${q} »${marque ? ` ${marque}` : ''} Abidjan`
          : 'Catalogue pièces auto Abidjan',
      ),
      description: clipMeta(
        `${bits.join(' — ')}. Phares, jantes, mécanique, électronique. Livraison CIV, retrait showroom.`,
      ),
      path: q || marque ? `${path}${search}` : path,
    };
  }

  if (path.startsWith('/catalogue/')) {
    const raw = decodeURIComponent(path.replace('/catalogue/', ''));
    const cat = CATEGORIES.find((c) => c.label === raw);
    const label = cat?.label ?? raw;
    const hint = cat?.hint ?? 'pièces et accessoires';
    return {
      title: withBrand(`${label} — pièces auto Abidjan`),
      description: clipMeta(
        `${label} (${hint}) chez MAJOR AUTO PARTS à Abidjan. Pièces automobiles en Côte d’Ivoire, stock showroom, livraison CIV, Wave et Orange Money.`,
      ),
      path,
    };
  }

  if (path === '/cgv') {
    return {
      title: withBrand('Conditions générales de vente'),
      description:
        'CGV MAJOR AUTO PARTS : commandes de pièces auto en Côte d’Ivoire, paiement, livraison Abidjan et retrait showroom.',
      path,
    };
  }
  if (path === '/confidentialite') {
    return {
      title: withBrand('Politique de confidentialité'),
      description:
        'Protection des données clients de la boutique pièces automobiles MAJOR AUTO PARTS (Abidjan, Côte d’Ivoire).',
      path,
    };
  }
  if (path === '/retours') {
    return {
      title: withBrand('Retours et garanties'),
      description:
        'Retours, échanges et garanties pièces auto MAJOR AUTO PARTS — showroom Abidjan et livraisons en Côte d’Ivoire.',
      path,
    };
  }

  return {
    title: withBrand('Pièces auto Abidjan'),
    description: DEFAULT_DESCRIPTION,
    path,
  };
}

export function seoForProduit(opts: {
  designation: string;
  description?: string | null;
  categorie?: string | null;
  slug: string;
  prixAffiche?: number;
  imageUrl?: string | null;
  stockDisponible?: number | null;
}): SeoPayload {
  const cat = opts.categorie ? `${opts.categorie} · ` : '';
  const desc =
    opts.description?.trim() ||
    `${opts.designation} — pièce auto ${cat}MAJOR AUTO PARTS Abidjan. Livraison Côte d’Ivoire, retrait showroom.`;
  const image = opts.imageUrl?.startsWith('http')
    ? opts.imageUrl
    : opts.imageUrl?.startsWith('/')
      ? absoluteUrl(opts.imageUrl)
      : DEFAULT_OG_IMAGE;
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: opts.designation,
    description: clipMeta(desc, 300),
    image,
    brand: { '@type': 'Brand', name: 'MAJOR AUTO PARTS' },
    category: opts.categorie ?? 'Pièces automobiles',
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/produit/${opts.slug}`),
      priceCurrency: 'XOF',
      ...(opts.prixAffiche != null
        ? { price: String(Math.round(opts.prixAffiche)) }
        : {}),
      availability:
        opts.stockDisponible == null || opts.stockDisponible > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      seller: { '@type': 'AutoPartsStore', name: 'MAJOR AUTO PARTS' },
      areaServed: 'CI',
    },
  };
  return {
    title: withBrand(`${opts.designation} — pièces auto Abidjan`),
    description: clipMeta(
      `${opts.designation}. ${cat}Pièce automobile à Abidjan, Côte d’Ivoire. Stock showroom, livraison CIV, Wave / Orange Money.`,
    ),
    path: `/produit/${opts.slug}`,
    image,
    jsonLd,
  };
}
