import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function service(env: Record<string, string | undefined>) {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    return new TurnstileService(config);
  }

  it('ne bloque pas si la clé secrète est absente', async () => {
    const svc = service({});
    await expect(svc.assertValid(undefined)).resolves.toBeUndefined();
    expect(svc.isEnabled()).toBe(false);
  });

  it('exige token + hostnames quand Turnstile est activé', async () => {
    const svc = service({
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_HOSTNAMES: 'crm.example.com',
    });
    await expect(svc.assertValid('')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepte un token validé (success + action + hostname)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        action: 'login',
        hostname: 'crm.majorautoparts.shop',
      }),
    }) as unknown as typeof fetch;

    const svc = service({
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_HOSTNAMES: 'crm.majorautoparts.shop,pos.majorautoparts.shop',
    });
    await expect(svc.assertValid('tok', '1.2.3.4')).resolves.toBeUndefined();
  });

  it('rejette si action ou hostname ne matchent pas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        action: 'signup',
        hostname: 'crm.majorautoparts.shop',
      }),
    }) as unknown as typeof fetch;

    const svc = service({
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_HOSTNAMES: 'crm.majorautoparts.shop',
    });
    await expect(svc.assertValid('tok')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
