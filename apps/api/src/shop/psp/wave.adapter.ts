import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  InitPaiementInput,
  InitPaiementResult,
  PspEvenement,
  ShopPspAdapter,
} from './shop-psp.adapter';

const WAVE_API_BASE = 'https://api.wave.com';

@Injectable()
export class WaveAdapter implements ShopPspAdapter {
  readonly provider = 'WAVE' as const;
  private readonly logger = new Logger(WaveAdapter.name);

  constructor(private readonly config: ConfigService) {}

  private apiKey(): string {
    return this.config.get<string>('WAVE_API_KEY')?.trim() ?? '';
  }

  enabled(): boolean {
    return Boolean(this.apiKey());
  }

  async initierPaiement(input: InitPaiementInput): Promise<InitPaiementResult> {
    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Wave n’est pas encore activé. Choisissez un autre moyen — aucun débit n’a été effectué.',
      );
    }
    const res = await fetch(`${WAVE_API_BASE}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(input.montantTotal).toString(),
        currency: 'XOF',
        client_reference: input.clientOperationId,
        success_url: input.callbackUrl,
        error_url: input.callbackUrl,
      }),
    });
    const body = (await res.json()) as {
      id?: string;
      wave_launch_url?: string;
      client_reference?: string;
      message?: string;
    };
    if (!res.ok || !body.wave_launch_url || !body.id) {
      this.logger.error(
        `Wave initialize failed: ${body.message ?? res.status}`,
      );
      throw new ServiceUnavailableException(
        'Le prestataire de paiement n’a pas pu ouvrir la session. Réessayez — aucun débit n’a été effectué.',
      );
    }
    return {
      authorizationUrl: body.wave_launch_url,
      reference: body.client_reference ?? input.clientOperationId,
      providerReference: body.id,
    };
  }

  /** Retour client (success_url) : confirme le paiement même si le webhook n’est pas encore arrivé. */
  async verifierTransaction(reference: string): Promise<PspEvenement | null> {
    const apiKey = this.apiKey();
    if (!apiKey || !reference.trim()) return null;
    const res = await fetch(
      `${WAVE_API_BASE}/v1/checkout/sessions/search?client_reference=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const body = (await res.json()) as {
      result?: Array<{
        id?: string;
        amount?: string;
        currency?: string;
        payment_status?: string;
        client_reference?: string;
      }>;
      message?: string;
    };
    if (!res.ok) {
      this.logger.warn(
        `Wave search ${reference}: ${body.message ?? res.status}`,
      );
      return null;
    }
    const session = body.result?.find((s) => s.payment_status === 'succeeded');
    if (!session?.client_reference || !session.id) return null;
    return {
      type: 'checkout.session.completed',
      reference: session.client_reference,
      providerReference: session.id,
      montant: Number(session.amount ?? 0),
      devise: session.currency ?? 'XOF',
      webhookEventId: `verify:${session.id}`,
      payload: session,
    };
  }

  verifierWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): PspEvenement | null {
    const secret = this.config.get<string>('WAVE_WEBHOOK_SECRET') ?? '';
    const header = headers['wave-signature'];
    if (!secret || typeof header !== 'string') return null;

    const parts = Object.fromEntries(
      header.split(',').map((kv) => {
        const [k, v] = kv.split('=');
        return [k, v];
      }),
    ) as { t?: string; v1?: string };
    const timestamp = parts.t;
    const signatures = header
      .split(',')
      .filter((kv) => kv.startsWith('v1='))
      .map((kv) => kv.slice(3));
    if (!timestamp || signatures.length === 0) return null;

    const now = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || now - ts > 300 || ts - now > 30) return null;

    const expected = createHmac('sha256', secret)
      .update(timestamp + rawBody.toString('utf8'))
      .digest('hex');
    const matches = signatures.some((sig) => {
      try {
        const a = Buffer.from(expected);
        const b = Buffer.from(sig);
        return a.length === b.length && timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });
    if (!matches) return null;

    const event = JSON.parse(rawBody.toString('utf8')) as {
      id?: string;
      type?: string;
      data?: {
        id?: string;
        amount?: string;
        currency?: string;
        payment_status?: string;
        client_reference?: string;
      };
    };
    if (event.type !== 'checkout.session.completed') return null;
    const data = event.data;
    if (
      !data?.client_reference ||
      !data.id ||
      data.payment_status !== 'succeeded'
    ) {
      return null;
    }
    return {
      type: event.type,
      reference: data.client_reference,
      providerReference: data.id,
      montant: Number(data.amount ?? 0),
      devise: data.currency ?? 'XOF',
      webhookEventId: `wave:${event.id ?? data.id}`,
      payload: event,
    };
  }

  async rembourser(input: {
    referenceExterne: string;
    referenceProvider?: string | null;
    montant: number;
  }): Promise<{ referenceProvider?: string }> {
    const apiKey = this.apiKey();
    if (!apiKey || !input.referenceProvider) {
      this.logger.warn(
        'Wave refund local (WAVE_API_KEY ou session id absent).',
      );
      return { referenceProvider: `local-refund-${input.referenceExterne}` };
    }
    const res = await fetch(
      `${WAVE_API_BASE}/v1/checkout/sessions/${encodeURIComponent(input.referenceProvider)}/refund`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    if (!res.ok) {
      this.logger.error(`Wave refund failed: ${res.status}`);
      throw new Error('Échec remboursement Wave.');
    }
    return { referenceProvider: input.referenceProvider };
  }
}
