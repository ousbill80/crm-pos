import type { ProduitDto } from './types';

const SHOP_FALLBACK = 'https://www.majorautoparts.shop';

/** URL publique boutique (build VITE_SHOP_PUBLIC_URL ou déduction depuis le CRM). */
export function shopPublicBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SHOP_PUBLIC_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'crm.majorautoparts.shop') return SHOP_FALLBACK;
    if (host.endsWith('.majorautoparts.shop')) {
      return host.startsWith('crm.') ? SHOP_FALLBACK : `https://${host}`;
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:5174';
    }
  }
  return SHOP_FALLBACK;
}

export function urlProduitShop(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  return `${shopPublicBaseUrl()}/produit/${encodeURIComponent(slug.trim())}`;
}

export type PublicationWebProduit = {
  visibleSurSite: boolean;
  publiableRapide: boolean;
  manques: string[];
  url: string | null;
};

export function evaluerPublicationWeb(produit: ProduitDto): PublicationWebProduit {
  const manques: string[] = [];
  if (!produit.actif) manques.push('réactiver le produit');
  if (!produit.visibleWeb) manques.push('cocher « Visible sur le site »');
  if (!produit.slug?.trim()) manques.push('définir un slug URL');
  if (!produit.imageUrl?.trim()) manques.push('ajouter une photo de couverture');
  const prixMag = Number(produit.prixUnitaire);
  const prixWeb = produit.prixWeb != null ? Number(produit.prixWeb) : null;
  if (!(prixWeb != null && prixWeb > 0) && !(Number.isFinite(prixMag) && prixMag > 0)) {
    manques.push('renseigner un prix web ou magasin');
  }

  const visibleSurSite =
    produit.actif === true &&
    produit.visibleWeb === true &&
    Boolean(produit.slug?.trim()) &&
    Boolean(produit.imageUrl?.trim()) &&
    ((prixWeb != null && prixWeb > 0) || prixMag > 0);

  const publiableRapide =
    produit.actif &&
    Boolean(produit.imageUrl?.trim()) &&
    (prixMag > 0 || (prixWeb != null && prixWeb > 0));

  return {
    visibleSurSite,
    publiableRapide,
    manques,
    url: urlProduitShop(produit.slug),
  };
}
