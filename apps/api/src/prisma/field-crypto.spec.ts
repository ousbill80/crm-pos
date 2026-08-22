import {
  chiffrer,
  cleChiffrementConfiguree,
  dechiffrer,
  estFormatChiffre,
} from './field-crypto';

describe('field-crypto (legacy déchiffrement)', () => {
  const cleValide = 'a'.repeat(64);

  beforeEach(() => {
    process.env.CLIENT_DATA_ENCRYPTION_KEY = cleValide;
  });

  afterEach(() => {
    delete process.env.CLIENT_DATA_ENCRYPTION_KEY;
  });

  it('détecte le format chiffré et round-trip chiffrement/déchiffrement', () => {
    const cipher = chiffrer('0700123456');
    expect(estFormatChiffre(cipher)).toBe(true);
    expect(dechiffrer(cipher)).toBe('0700123456');
    expect(estFormatChiffre('0700123456')).toBe(false);
    expect(dechiffrer('0700123456')).toBe('0700123456');
  });

  it('signale une clé absente', () => {
    delete process.env.CLIENT_DATA_ENCRYPTION_KEY;
    expect(cleChiffrementConfiguree()).toBe(false);
    expect(() => chiffrer('x')).toThrow(/CLIENT_DATA_ENCRYPTION_KEY/);
  });
});
