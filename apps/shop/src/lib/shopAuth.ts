/** Session compte client shop (localStorage + event pour le header). */

export const SHOP_AUTH_EVENT = 'shop-auth-changed';

const KEYS = {
  token: 'shop_token',
  refresh: 'shop_refresh',
  email: 'shop_email',
  displayName: 'shop_display_name',
  prenom: 'shop_prenom',
  nom: 'shop_nom',
} as const;

export type ShopSession = {
  accessToken: string;
  refreshToken?: string;
  email: string;
  displayName: string;
  prenom?: string;
  nom?: string;
};

function notify() {
  window.dispatchEvent(new Event(SHOP_AUTH_EVENT));
}

export function readShopSession(): {
  token: string | null;
  email: string | null;
  displayName: string | null;
} {
  return {
    token: localStorage.getItem(KEYS.token),
    email: localStorage.getItem(KEYS.email),
    displayName: localStorage.getItem(KEYS.displayName),
  };
}

export function persistShopSession(session: ShopSession) {
  localStorage.setItem(KEYS.token, session.accessToken);
  localStorage.setItem(KEYS.email, session.email);
  localStorage.setItem(KEYS.displayName, session.displayName);
  if (session.refreshToken) {
    localStorage.setItem(KEYS.refresh, session.refreshToken);
  }
  if (session.prenom) localStorage.setItem(KEYS.prenom, session.prenom);
  if (session.nom) localStorage.setItem(KEYS.nom, session.nom);
  notify();
}

export function clearShopSession() {
  for (const k of Object.values(KEYS)) {
    localStorage.removeItem(k);
  }
  notify();
}

/** Renouvelle l’access token (JWT 15 min). Retourne null si la session est invalide. */
export async function refreshShopSession(
  apiBase: string,
): Promise<string | null> {
  const refreshToken = localStorage.getItem(KEYS.refresh);
  if (!refreshToken) return null;
  const res = await fetch(`${apiBase}/shop/compte/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearShopSession();
    return null;
  }
  const body = (await res.json()) as ShopSession & { email: string };
  persistShopSession({
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    email: body.email,
    displayName:
      body.displayName ||
      localStorage.getItem(KEYS.displayName) ||
      body.email,
    prenom: body.prenom,
    nom: body.nom,
  });
  return body.accessToken;
}

/** Prénom court pour le header (ex. « Ousmane »). */
export function headerAccountLabel(
  displayName: string | null,
  email: string | null,
): string {
  if (displayName?.trim()) {
    return displayName.trim().split(/\s+/)[0] ?? displayName.trim();
  }
  if (email?.includes('@')) {
    const local = email.split('@')[0] ?? '';
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return 'Compte';
}
