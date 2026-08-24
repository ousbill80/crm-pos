import { describe, expect, it } from 'vitest';
import { estErreurHorsLigne } from './erreurs';

const apiError = (status: number, message: string) => ({ status, message });

describe('estErreurHorsLigne — gate avant enqueue financier', () => {
  it('accepte les erreurs réseau et serveur temporaires', () => {
    expect(estErreurHorsLigne(new TypeError('Network request failed'))).toBe(true);
    expect(estErreurHorsLigne(apiError(0, 'Réseau indisponible'))).toBe(true);
    expect(estErreurHorsLigne(apiError(503, 'Maintenance'))).toBe(true);
  });

  it('refuse les erreurs métier et RBAC 4xx', () => {
    expect(estErreurHorsLigne(apiError(400, 'Montant invalide'))).toBe(false);
    expect(estErreurHorsLigne(apiError(403, 'Rôle interdit'))).toBe(false);
    expect(estErreurHorsLigne(apiError(422, 'Fonds insuffisants'))).toBe(false);
  });
});
