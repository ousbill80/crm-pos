import { RoleLibelle } from '@caisse-crm/shared';
import type { SessionUser } from './session-types';

export type { SessionUser } from './session-types';

function isRole(value: unknown): value is RoleLibelle {
  return (
    typeof value === 'string' &&
    (Object.values(RoleLibelle) as string[]).includes(value)
  );
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return globalThis.atob(padded + pad);
}

export function decodeAccessToken(token: string): SessionUser | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as {
      sub?: unknown;
      login?: unknown;
      role?: unknown;
      boutiqueId?: unknown;
    };
    if (typeof payload.sub !== 'string' || typeof payload.login !== 'string') {
      return null;
    }
    if (!isRole(payload.role)) return null;
    return {
      userId: payload.sub,
      login: payload.login,
      role: payload.role,
      boutiqueId:
        typeof payload.boutiqueId === 'string' ? payload.boutiqueId : null,
    };
  } catch {
    return null;
  }
}

/** Instant d'expiration (ms epoch) du JWT, lu localement — null si absent/illisible. */
export function decodeAccessTokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** §6.7 : un JWT dont l'expiration serveur est dépassée ne doit plus être
 * considéré comme une session valide, même relu hors ligne depuis le stockage local. */
export function isAccessTokenExpired(token: string): boolean {
  const expMs = decodeAccessTokenExpiryMs(token);
  return expMs !== null && expMs <= Date.now();
}
