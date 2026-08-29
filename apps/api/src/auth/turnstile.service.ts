import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
};

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile — anti-bots sur /auth/login (§6.7).
 * Canonical siteverify : success + action + hostname allowlist.
 *
 * Env :
 * - TURNSTILE_SECRET_KEY (ou TURNSTILE_SECRET) : active le contrôle
 * - TURNSTILE_HOSTNAMES : hôtes frontend autorisés (csv), ex.
 *   crm.majorautoparts.shop,pos.majorautoparts.shop
 * - TURNSTILE_EXPECTED_ACTION : défaut `login`
 *
 * Absent = pas de contrôle (local / e2e).
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  secret(): string | undefined {
    return (
      this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim() ||
      this.config.get<string>('TURNSTILE_SECRET')?.trim() ||
      undefined
    );
  }

  isEnabled(): boolean {
    return Boolean(this.secret());
  }

  expectedAction(): string {
    return (
      this.config.get<string>('TURNSTILE_EXPECTED_ACTION')?.trim() || 'login'
    );
  }

  expectedHostnames(): Set<string> {
    const raw = this.config.get<string>('TURNSTILE_HOSTNAMES') ?? '';
    return new Set(
      raw
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async assertValid(token: string | undefined, remoteIp?: string): Promise<void> {
    const secret = this.secret();
    if (!secret) {
      return;
    }

    const expectedAction = this.expectedAction();
    const expectedHostnames = this.expectedHostnames();

    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 2048 ||
      expectedHostnames.size === 0
    ) {
      throw new ForbiddenException(
        'Vérification anti-bot requise. Rechargez la page et réessayez.',
      );
    }

    let result: SiteverifyResponse;
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`siteverify ${res.status}`);
      }
      result = (await res.json()) as SiteverifyResponse;
    } catch (err) {
      this.logger.error(
        `Turnstile siteverify indisponible: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'Vérification anti-bot temporairement indisponible. Réessayez.',
      );
    }

    const hostname = (result.hostname ?? '').toLowerCase();
    if (
      !result.success ||
      result.action !== expectedAction ||
      !expectedHostnames.has(hostname)
    ) {
      this.logger.warn(
        `Turnstile rejeté: success=${String(result.success)} action=${result.action ?? ''} hostname=${hostname} codes=${(result['error-codes'] ?? []).join(',')}`,
      );
      throw new ForbiddenException(
        'Vérification anti-bot échouée. Rechargez la page et réessayez.',
      );
    }
  }
}
