import type { RoleLibelle } from '@caisse-crm/shared';

// Décodage client du JWT émis par POST /auth/login (§6.2). Sert uniquement
// à adapter l'UI (masquer des actions non permises) — l'application réelle
// du RBAC reste toujours faite côté serveur sur chaque endpoint.
export interface JwtPayload {
  sub: string;
  login: string;
  role: RoleLibelle;
  boutiqueId: string | null;
  exp: number;
  iat: number;
}

export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: JwtPayload): boolean {
  return payload.exp * 1000 <= Date.now();
}
