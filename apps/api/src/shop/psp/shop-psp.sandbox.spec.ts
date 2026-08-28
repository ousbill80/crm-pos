import {
  messagePspIndisponible,
  pspProviderConfigure,
  pspSandboxAutorise,
  urlConfirmationSandbox,
} from './shop-psp.sandbox';

describe('shop-psp sandbox', () => {
  it('autorise le sandbox hors production', () => {
    expect(pspSandboxAutorise({ nodeEnv: 'development' })).toBe(true);
    expect(pspSandboxAutorise({ nodeEnv: 'test' })).toBe(true);
    expect(pspSandboxAutorise({ nodeEnv: undefined })).toBe(true);
  });

  it('interdit le sandbox en production sauf flag explicite', () => {
    expect(pspSandboxAutorise({ nodeEnv: 'production' })).toBe(false);
    expect(
      pspSandboxAutorise({ nodeEnv: 'production', sandboxFlag: '1' }),
    ).toBe(true);
    expect(
      pspSandboxAutorise({ nodeEnv: 'development', sandboxFlag: '0' }),
    ).toBe(false);
  });

  it('détecte un PSP réellement configuré', () => {
    expect(
      pspProviderConfigure('PAYSTACK', { paystackSecret: ' sk_test ' }),
    ).toBe(true);
    expect(pspProviderConfigure('PAYSTACK', { paystackSecret: '' })).toBe(
      false,
    );
    expect(
      pspProviderConfigure('ORANGE_MONEY', { orangeMoneyEnabled: '1' }),
    ).toBe(true);
    expect(pspProviderConfigure('WAVE', { waveEnabled: '0' })).toBe(false);
  });

  it('construit l’URL de confirmation sandbox', () => {
    const url = urlConfirmationSandbox({
      shopPublicUrl: 'http://127.0.0.1:5174/',
      commandeId: 'cmd-1',
      clientOperationId: 'op-1',
      suiviToken: 'tok',
    });
    expect(url).toContain('commandeId=cmd-1');
    expect(url).toContain('sandbox=1');
    expect(url).toContain('token=tok');
  });

  it('messages client sans jargon technique', () => {
    expect(messagePspIndisponible('PAYSTACK')).not.toMatch(/SECRET_KEY/i);
    expect(messagePspIndisponible('ORANGE_MONEY')).toMatch(/Orange Money/);
  });
});
