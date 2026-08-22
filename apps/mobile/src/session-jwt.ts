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
