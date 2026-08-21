import {
  chiffrer,
  dechiffrer,
  chiffrerNullable,
  dechiffrerNullable,
  hasherContact,
  normaliserContact,
} from './field-crypto';

describe('field-crypto', () => {
  const cleValide = 'a'.repeat(64);

  beforeEach(() => {
    process.env.CLIENT_DATA_ENCRYPTION_KEY = cleValide;
  });

  afterEach(() => {
    delete process.env.CLIENT_DATA_ENCRYPTION_KEY;
  });

  it('chiffre puis déchiffre une valeur (aller-retour fidèle)', () => {
    const ciphertext = chiffrer('+225 07 00 00 00 00');
    expect(ciphertext).not.toBe('+225 07 00 00 00 00');
    expect(dechiffrer(ciphertext)).toBe('+225 07 00 00 00 00');
  });

  it('produit un ciphertext différent à chaque appel (IV aléatoire)', () => {
    const a = chiffrer('Abidjan, Cocody');
    const b = chiffrer('Abidjan, Cocody');
    expect(a).not.toBe(b);
    expect(dechiffrer(a)).toBe('Abidjan, Cocody');
    expect(dechiffrer(b)).toBe('Abidjan, Cocody');
  });

  it('rejette une donnée chiffrée altérée (authTag GCM)', () => {
    const ciphertext = chiffrer('donnée sensible');
    const alteree = ciphertext.slice(0, -4) + 'XXXX';
    expect(() => dechiffrer(alteree)).toThrow();
  });

  it('laisse passer une valeur déjà en clair (legacy, avant activation du chiffrement)', () => {
    expect(dechiffrer('0700000000')).toBe('0700000000');
  });

  it('chiffrerNullable/dechiffrerNullable préservent null et undefined', () => {
    expect(chiffrerNullable(null)).toBeNull();
    expect(chiffrerNullable(undefined)).toBeUndefined();
    expect(dechiffrerNullable(null)).toBeNull();
    expect(dechiffrerNullable(undefined)).toBeUndefined();
  });

  it('lève une erreur explicite si CLIENT_DATA_ENCRYPTION_KEY est absente ou invalide', () => {
    delete process.env.CLIENT_DATA_ENCRYPTION_KEY;
    expect(() => chiffrer('x')).toThrow(/CLIENT_DATA_ENCRYPTION_KEY/);

    process.env.CLIENT_DATA_ENCRYPTION_KEY = 'trop-court';
    expect(() => chiffrer('x')).toThrow(/CLIENT_DATA_ENCRYPTION_KEY/);
  });

  it('normalise un téléphone sur les chiffres et produit un HMAC stable', () => {
    expect(normaliserContact('+225 07 00 00 00 01')).toBe('2250700000001');
    expect(hasherContact('0700000001')).toBe(hasherContact('07 00 00 00 01'));
    expect(hasherContact('0700000001')).not.toBe('0700000001');
  });
});
