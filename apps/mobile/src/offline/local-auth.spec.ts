import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleLibelle } from '@caisse-crm/shared';

// expo-crypto / expo-secure-store sont des modules natifs indisponibles sous
// Node — on les remplace par des équivalents purs JS pour tester la logique
// de local-auth.ts en isolation (§6.7, zéro mock du métier, uniquement des
// bindings natifs hors de portée de l'environnement de test).
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algo: string, data: string) =>
    createHash('sha256').update(data).digest('hex'),
  getRandomBytesAsync: async (byteCount: number) =>
    new Uint8Array(randomBytes(byteCount)),
}));

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    store.delete(key);
  },
}));

import {
  cacherIdentifiants,
  FENETRE_AUTONOMIE_MS,
  purgerIdentifiantsCaches,
  verifierIdentifiantsLocal,
} from './local-auth';

const INFOS_CACHE = {
  role: RoleLibelle.CAISSIER_BOUTIQUE,
  accessToken: 'aaa.bbb.ccc',
  mustChangePassword: false,
};

describe('local-auth — vérification hors ligne des identifiants (§6.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T08:00:00.000Z'));
  });

  afterEach(async () => {
    await purgerIdentifiantsCaches();
    vi.useRealTimers();
  });

  it('refuse un login jamais mis en cache sur cet appareil', async () => {
    const resultat = await verifierIdentifiantsLocal('inconnu', 'x');
    expect(resultat).toEqual({ ok: false });
  });

  it('met en cache puis vérifie un mot de passe correct, avec le JWT réutilisable', async () => {
    await cacherIdentifiants('caissier-b1', 'MotDePasse!123', INFOS_CACHE);

    const ok = await verifierIdentifiantsLocal('caissier-b1', 'MotDePasse!123');
    expect(ok).toEqual({
      ok: true,
      role: RoleLibelle.CAISSIER_BOUTIQUE,
      accessToken: INFOS_CACHE.accessToken,
      mustChangePassword: false,
    });

    const echec = await verifierIdentifiantsLocal('caissier-b1', 'mauvais');
    expect(echec.ok).toBe(false);
  }, 20_000);

  it('verrouille localement après 5 échecs consécutifs, 15 minutes', async () => {
    await cacherIdentifiants('caissier-b1', 'MotDePasse!123', INFOS_CACHE);

    for (let i = 0; i < 4; i += 1) {
      const r = await verifierIdentifiantsLocal('caissier-b1', 'mauvais');
      expect(r.verrouille).toBeFalsy();
    }

    const cinquieme = await verifierIdentifiantsLocal('caissier-b1', 'mauvais');
    expect(cinquieme.verrouille).toBe(true);
    expect(cinquieme.verrouJusqua).toBeDefined();

    // Verrouillé même avec le bon mot de passe pendant la fenêtre.
    const pendantVerrou = await verifierIdentifiantsLocal(
      'caissier-b1',
      'MotDePasse!123',
    );
    expect(pendantVerrou).toEqual({
      ok: false,
      verrouille: true,
      verrouJusqua: cinquieme.verrouJusqua,
    });

    vi.setSystemTime(new Date(Date.now() + 15 * 60 * 1000 + 1000));

    const apresVerrou = await verifierIdentifiantsLocal(
      'caissier-b1',
      'MotDePasse!123',
    );
    expect(apresVerrou).toEqual({
      ok: true,
      role: RoleLibelle.CAISSIER_BOUTIQUE,
      accessToken: INFOS_CACHE.accessToken,
      mustChangePassword: false,
    });
  }, 60_000);

  it('refuse un identifiant caché au-delà de la fenêtre d’autonomie de 24h', async () => {
    await cacherIdentifiants('caissier-b1', 'MotDePasse!123', INFOS_CACHE);

    vi.setSystemTime(new Date(Date.now() + FENETRE_AUTONOMIE_MS + 1000));

    const perime = await verifierIdentifiantsLocal(
      'caissier-b1',
      'MotDePasse!123',
    );
    expect(perime).toEqual({ ok: false, perime: true });
  }, 20_000);
});
