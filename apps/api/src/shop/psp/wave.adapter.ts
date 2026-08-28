import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  InitPaiementInput,
  InitPaiementResult,
  PspEvenement,
  ShopPspAdapter,
} from './shop-psp.adapter';

@Injectable()
export class WaveAdapter implements ShopPspAdapter {
  readonly provider = 'WAVE' as const;

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return this.config.get<string>('WAVE_ENABLED') === '1';
  }

  initierPaiement(input: InitPaiementInput): Promise<InitPaiementResult> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException(
        'Wave n’est pas encore activé. Choisissez la carte ou le paiement au retrait — aucun débit n’a été effectué.',
      );
    }
    const base =
      this.config.get<string>('SHOP_PUBLIC_URL') ?? 'http://127.0.0.1:5174';
    const url = new URL(`${base.replace(/\/$/, '')}/checkout/confirmation`);
    url.searchParams.set('commandeId', input.commandeWebId);
    url.searchParams.set('ref', input.clientOperationId);
    url.searchParams.set('sandbox', '1');
    return Promise.resolve({
      authorizationUrl: url.toString(),
      reference: input.clientOperationId,
      providerReference: `wave-mock-${input.clientOperationId}`,
      sandbox: true,
    });
  }

  verifierWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): PspEvenement | null {
    const secret =
      this.config.get<string>('WAVE_WEBHOOK_SECRET') ?? 'wave-dev-secret';
    const signature = headers['x-wave-signature'];
    if (typeof signature !== 'string') return null;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      type?: string;
      reference?: string;
      amount?: number;
      id?: string;
    };
    if (event.type !== 'checkout.session.completed' || !event.reference)
      return null;
    return {
      type: event.type,
      reference: event.reference,
      providerReference: event.id ?? event.reference,
      montant: Number(event.amount ?? 0),
      devise: 'XOF',
      webhookEventId: `wave:${event.id ?? event.reference}`,
      payload: event,
    };
  }
}
