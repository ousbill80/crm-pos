import { describe, expect, it } from 'vitest';
import { RoleLibelle } from '@caisse-crm/shared';
import { decodeAccessToken } from './session-jwt';

function tokenWithPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `aaa.${b64}.sig`;
}

describe('decodeAccessToken', () => {
  it('lit rôle et boutique pour masquer les onglets (l’API reste l’autorité)', () => {
    const user = decodeAccessToken(
      tokenWithPayload({
        sub: 'u1',
        login: 'demo-pos-caissier',
        role: RoleLibelle.CAISSIER_BOUTIQUE,
        boutiqueId: 'b1',
      }),
    );
    expect(user).toEqual({
      userId: 'u1',
      login: 'demo-pos-caissier',
      role: RoleLibelle.CAISSIER_BOUTIQUE,
      boutiqueId: 'b1',
    });
  });

  it('rejette un rôle inconnu', () => {
    expect(
      decodeAccessToken(
        tokenWithPayload({
          sub: 'u1',
          login: 'x',
          role: 'HACKER',
        }),
      ),
    ).toBeNull();
  });
});
