import { readShopSession } from './shopAuth';

const SESSION_KEY = 'shop_session_id';
const ATTR_KEY = 'shop_attribution';

export type ShopAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  codeParrain?: string;
};

function randomSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `s${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function getShopSessionId(): string {
  if (typeof localStorage === 'undefined') return randomSessionId();
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const next = randomSessionId();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

export function captureShopAttribution(search = window.location.search): ShopAttribution {
  const params = new URLSearchParams(search);
  const current = readShopAttribution();
  const next: ShopAttribution = {
    utmSource: params.get('utm_source')?.slice(0, 80) || current.utmSource,
    utmMedium: params.get('utm_medium')?.slice(0, 80) || current.utmMedium,
    utmCampaign: params.get('utm_campaign')?.slice(0, 120) || current.utmCampaign,
    codeParrain:
      (params.get('ref') ?? params.get('parrain'))?.trim().toUpperCase().slice(0, 16) ||
      current.codeParrain,
  };
  sessionStorage.setItem(ATTR_KEY, JSON.stringify(next));
  return next;
}

export function readShopAttribution(): ShopAttribution {
  try {
    const raw = sessionStorage.getItem(ATTR_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ShopAttribution;
  } catch {
    return {};
  }
}

export function trackShopEvent(
  action:
    | 'VIEW_HOME'
    | 'VIEW_PDP'
    | 'SEARCH'
    | 'LANDING'
    | 'SHARE'
    | 'ADD_CART',
  extra?: { produitId?: string; requete?: string },
) {
  if (typeof window === 'undefined') return;
  const attr = readShopAttribution();
  const payload = {
    sessionId: getShopSessionId(),
    action,
    produitId: extra?.produitId,
    requete: extra?.requete?.slice(0, 80),
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
    codeParrain: attr.codeParrain,
  };
  const base = import.meta.env.VITE_API_URL ?? '';
  const body = JSON.stringify(payload);
  const url = `${base}/shop/evenements`;
  const token = readShopSession().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shop-Session': payload.sessionId,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // sendBeacon ne peut pas porter Authorization — fetch si compte connecté.
  if (!token && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) return;
  }
  void fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body,
    keepalive: true,
  }).catch(() => undefined);
}
