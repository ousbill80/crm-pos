import type { ProviderPspShop } from '@caisse-crm/shared';

export interface InitPaiementInput {
  commandeWebId: string;
  clientOperationId: string;
  montantTotal: number;
  email: string;
  callbackUrl: string;
  provider: ProviderPspShop;
}

export interface InitPaiementResult {
  authorizationUrl?: string;
  reference: string;
  providerReference?: string;
  sandbox?: boolean;
}

export interface PspEvenement {
  type: string;
  reference: string;
  providerReference: string;
  montant: number;
  devise: string;
  webhookEventId: string;
  payload: unknown;
}

export interface RemboursementInput {
  referenceExterne: string;
  referenceProvider?: string | null;
  montant: number;
}

export interface ShopPspAdapter {
  readonly provider: ProviderPspShop;
  initierPaiement(input: InitPaiementInput): Promise<InitPaiementResult>;
  verifierWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): PspEvenement | null;
  /** Appel API PSP si secret configuré ; sinon no-op local (sandbox/mock). */
  rembourser?(
    input: RemboursementInput,
  ): Promise<{ referenceProvider?: string }>;
  verifierTransaction?(reference: string): Promise<PspEvenement | null>;
}
