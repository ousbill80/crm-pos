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

@Injectable()
export class PaystackAdapter implements ShopPspAdapter {
  readonly provider = 'PAYSTACK' as const;
  private readonly logger = new Logger(PaystackAdapter.name);

  constructor(private readonly config: ConfigService) {}

  private secretKey(): string {
    return this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

  async initierPaiement(input: InitPaiementInput): Promise<InitPaiementResult> {
    const secret = this.secretKey();
    if (!secret) {
      throw new ServiceUnavailableException(
        'Le paiement par carte est temporairement indisponible. Réessayez ou choisissez un autre moyen — aucun débit n’a été effectué.',
      );
    }
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(input.montantTotal),
        email: input.email,
        currency: 'XOF',
        reference: input.clientOperationId,
        callback_url: input.callbackUrl,
        channels: ['card', 'mobile_money'],
        metadata: {
          commandeWebId: input.commandeWebId,
          clientOperationId: input.clientOperationId,
        },
      }),
    });
    const body = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url?: string;
        reference?: string;
        access_code?: string;
      };
    };
    if (!res.ok || !body.status || !body.data?.authorization_url) {
      this.logger.error(
        `Paystack initialize failed: ${body.message ?? res.status}`,
      );
      throw new ServiceUnavailableException(
        'Le prestataire de paiement n’a pas pu ouvrir la session. Réessayez — aucun débit n’a été effectué.',
      );
    }
    return {
      authorizationUrl: body.data.authorization_url,
      reference: body.data.reference ?? input.clientOperationId,
      providerReference: body.data.access_code,
    };
  }

  /** Retour client (callback_url) : confirme le paiement même si le webhook n’est pas encore arrivé. */
  async verifierTransaction(reference: string): Promise<PspEvenement | null> {
    const secret = this.secretKey();
    if (!secret || !reference.trim()) return null;
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const body = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        id?: number;
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
      };
    };
    if (!res.ok || !body.status || body.data?.status !== 'success') {
      this.logger.warn(
        `Paystack verify ${reference}: ${body.message ?? body.data?.status ?? res.status}`,
      );
      return null;
    }
    const data = body.data;
    if (!data.reference) return null;
    return {
      type: 'charge.success',
      reference: data.reference,
      providerReference: String(data.id ?? data.reference),
      montant: Number(data.amount ?? 0),
      devise: data.currency ?? 'XOF',
      webhookEventId: `verify:${data.id ?? data.reference}`,
      payload: body,
    };
  }

  verifierWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): PspEvenement | null {
    const secret = this.secretKey();
    const signature = headers['x-paystack-signature'];
    if (!secret || typeof signature !== 'string') return null;
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: {
        id?: number;
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
      };
    };
    if (!event.event || !event.data?.reference) return null;
    if (event.event === 'charge.success' && event.data.status !== 'success') {
      return null;
    }
    return {
      type: event.event,
      reference: event.data.reference,
      providerReference: String(event.data.id ?? event.data.reference),
      montant: Number(event.data.amount ?? 0),
      devise: event.data.currency ?? 'XOF',
      webhookEventId: `${event.event}:${event.data.id ?? event.data.reference}`,
      payload: event,
    };
  }

  async rembourser(input: {
    referenceExterne: string;
    referenceProvider?: string | null;
    montant: number;
  }): Promise<{ referenceProvider?: string }> {
    const secret = this.secretKey();
    if (!secret) {
      this.logger.warn('Paystack refund local (PAYSTACK_SECRET_KEY absent).');
      return { referenceProvider: `local-refund-${input.referenceExterne}` };
    }
    const res = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.referenceExterne,
        amount: Math.round(input.montant),
        currency: 'XOF',
      }),
    });
    const body = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { id?: number; transaction?: { reference?: string } };
    };
    if (!res.ok || !body.status) {
      this.logger.error(
        `Paystack refund failed: ${body.message ?? res.status}`,
      );
      throw new Error(body.message ?? 'Échec remboursement Paystack.');
    }
    return {
      referenceProvider: String(
        body.data?.id ??
          body.data?.transaction?.reference ??
          input.referenceExterne,
      ),
    };
  }
}
