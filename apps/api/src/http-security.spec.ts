import { resolveCorsMode } from './http-security';

describe('CORS production (§6.7)', () => {
  it('ferme CORS en production si aucune origine n’est listée', () => {
    expect(resolveCorsMode(undefined, 'production')).toEqual({ kind: 'closed' });
    expect(resolveCorsMode('  ', 'production')).toEqual({ kind: 'closed' });
  });

  it('n’autorise que les origines explicites', () => {
    expect(
      resolveCorsMode(
        'https://crm.majorautoparts.shop, https://pos.majorautoparts.shop',
        'production',
      ),
    ).toEqual({
      kind: 'origins',
      origins: [
        'https://crm.majorautoparts.shop',
        'https://pos.majorautoparts.shop',
      ],
    });
  });

  it('reste ouvert en développement local', () => {
    expect(resolveCorsMode(undefined, 'development')).toEqual({ kind: 'dev-open' });
  });
});
