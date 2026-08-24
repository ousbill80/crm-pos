import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  purgerSecretOp,
  purgerTousLesSecretsOp,
  rehydraterSecretOp,
  stasherSecretOp,
} from './op-secrets';

describe('op-secrets — mots de passe témoin de la file hors-ligne (§6.7)', () => {
  beforeEach(() => {
    store.clear();
  });

  afterEach(async () => {
    await purgerTousLesSecretsOp();
  });

  it('rehydrate le corps sans toucher aux autres champs si aucun secret stashé', async () => {
    const body = await rehydraterSecretOp('op-inconnue', { caisseId: 'c1' });
    expect(body).toEqual({ caisseId: 'c1' });
  });

  it('stashe puis rehydrate le mot de passe témoin dans le corps envoyé', async () => {
    await stasherSecretOp('op-1', { temoinPassword: 'MotDePasse!123' });
    const body = await rehydraterSecretOp('op-1', {
      caisseId: 'c1',
      temoinLogin: 'chef-boutique',
    });
    expect(body).toEqual({
      caisseId: 'c1',
      temoinLogin: 'chef-boutique',
      temoinPassword: 'MotDePasse!123',
    });
  });

  it('rehydrate un secret imbriqué sans le persister dans le corps SQLite', async () => {
    await stasherSecretOp('vente-1', {
      'derogation.password': 'SecretResponsable!',
    });
    const bodyPersistable = {
      lignes: [{ produitId: 'p1', quantite: 1 }],
      derogation: {
        motifs: ['STOCK_INSUFFISANT'],
        login: 'responsable',
      },
    };

    const body = await rehydraterSecretOp('vente-1', bodyPersistable);
    expect(bodyPersistable).not.toHaveProperty('derogation.password');
    expect(body).toMatchObject({
      derogation: {
        motifs: ['STOCK_INSUFFISANT'],
        login: 'responsable',
        password: 'SecretResponsable!',
      },
    });
  });

  it('purge un secret après envoi réussi, sans affecter les autres ops en file', async () => {
    await stasherSecretOp('op-1', { temoinPassword: 'a' });
    await stasherSecretOp('op-2', { temoinPassword: 'b' });

    await purgerSecretOp('op-1');

    expect(await rehydraterSecretOp('op-1', {})).toEqual({});
    expect(await rehydraterSecretOp('op-2', {})).toEqual({ temoinPassword: 'b' });
  });

  it('purgerTousLesSecretsOp efface tout (déconnexion)', async () => {
    await stasherSecretOp('op-1', { temoinPassword: 'a' });
    await purgerTousLesSecretsOp();
    expect(await rehydraterSecretOp('op-1', {})).toEqual({});
  });
});
