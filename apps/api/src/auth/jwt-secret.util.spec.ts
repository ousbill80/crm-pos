import { resolveJwtSecret } from './jwt-secret.util';

describe('resolveJwtSecret — audit sécurité secrets par défaut', () => {
  it('lève une erreur si aucun secret n’est défini', () => {
    expect(() => resolveJwtSecret(undefined, 'production')).toThrow(
      /doit être défini/,
    );
  });

  it('refuse le placeholder du .env.example en production', () => {
    expect(() =>
      resolveJwtSecret(
        'change-me-generate-with-openssl-rand-hex-32',
        'production',
      ),
    ).toThrow(/placeholder/);
  });

  it('accepte le placeholder en développement (jamais exposé au public)', () => {
    expect(
      resolveJwtSecret(
        'change-me-generate-with-openssl-rand-hex-32',
        'development',
      ),
    ).toBe('change-me-generate-with-openssl-rand-hex-32');
  });

  it('accepte un secret fort en production', () => {
    const secret = 'a'.repeat(64);
    expect(resolveJwtSecret(secret, 'production')).toBe(secret);
  });
});
