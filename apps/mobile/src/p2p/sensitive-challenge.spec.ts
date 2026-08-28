import { describe, expect, it } from 'vitest';
import {
  buildChallengeRequest,
  requireChallengeId,
} from './sensitive-challenge';

describe('challenge sensible P2P', () => {
  it('lie la preuve de ré-authentification au purpose serveur exact', () => {
    expect(
      buildChallengeRequest('secret', 'P2P_PAYMENT_EXECUTE'),
    ).toEqual({
      password: 'secret',
      purpose: 'P2P_PAYMENT_EXECUTE',
    });
  });

  it('refuse un mot de passe vide et un challenge absent', () => {
    expect(() =>
      buildChallengeRequest('', 'P2P_INVOICE_POST'),
    ).toThrow(/Mot de passe/);
    expect(() => requireChallengeId()).toThrow(/Challenge/);
  });

  it('transmet uniquement le challenge opaque reçu', () => {
    expect(requireChallengeId('challenge-uuid')).toBe('challenge-uuid');
  });
});
