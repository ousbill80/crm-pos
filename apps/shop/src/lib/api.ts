import { refreshShopSession } from './shopAuth';

const base = import.meta.env.VITE_API_URL ?? '';

function shopErrorMessage(
  err: { message?: string | string[] },
  status: number,
  path: string,
) {
  const raw = Array.isArray(err.message) ? err.message.join(', ') : err.message;
  if (status >= 500 || !raw || /^internal server error$/i.test(raw)) {
    const isPaiement =
      path.includes('/payer') ||
      path.includes('/checkout') ||
      path.includes('/webhooks/') ||
      path.includes('/sandbox-confirmer');
    return isPaiement
      ? 'Le paiement n’a pas pu aboutir. Aucun débit n’a été effectué. Réessayez dans un instant.'
      : 'Le service est temporairement indisponible. Réessayez dans un instant.';
  }
  return raw;
}

export async function shopFetch<T>(
  path: string,
  init?: RequestInit,
  alreadyRetried = false,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (typeof localStorage !== 'undefined' && !headers.has('Authorization')) {
    const token = localStorage.getItem('shop_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (
    res.status === 401 &&
    !alreadyRetried &&
    typeof localStorage !== 'undefined' &&
    !path.startsWith('/shop/compte/login') &&
    !path.startsWith('/shop/compte/inscription') &&
    !path.startsWith('/shop/compte/refresh')
  ) {
    const next = await refreshShopSession(base);
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      return shopFetch<T>(path, { ...init, headers }, true);
    }
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    throw new Error(shopErrorMessage(err, res.status, path));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function formatFcfa(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

export interface CatalogueItem {
  id: string;
  slug: string | null;
  designation: string;
  reference?: string | null;
  prixAffiche: number;
  categorie: string | null;
  imageUrl?: string | null;
  stockDisponible?: number | null;
  description?: string | null;
}

export interface CatalogueResponse {
  items: CatalogueItem[];
  categories: string[];
  parametres: { modeAffichage: string };
}

export interface PanierLigne {
  produitId: string;
  quantite: number;
  designation: string;
  reference?: string | null;
  prixUnitaireHt: number;
  prixUnitaireTtc: number;
}

export interface PanierDto {
  id: string;
  lignes: PanierLigne[];
  montantArticlesHt: number;
  montantTva: number;
  montantArticlesTtc: number;
  montantTotal: number;
  modeAffichage: string;
  ttlMinutes: number;
}
