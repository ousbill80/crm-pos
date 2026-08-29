import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PaystackAdapter } from './paystack.adapter';
import { OrangeMoneyAdapter } from './orange-money.adapter';
import { WaveAdapter } from './wave.adapter';
import type {
  InitPaiementResult,
  PspEvenement,
  ShopPspAdapter,
} from './shop-psp.adapter';
import { transitionCommandeWebAutorisee } from '../commande-web-state-machine';
import { StatutCommandeWeb } from '@caisse-crm/shared';
import { ConfigService } from '@nestjs/config';
import type { ProviderPspShop } from '@caisse-crm/shared';
import { ShopOrderLifecycleService } from '../shop-order-lifecycle.service';
import {
  messagePspIndisponible,
  pspProviderConfigure,
  pspSandboxAutorise,
  urlConfirmationSandbox,
} from './shop-psp.sandbox';

@Injectable()
export class ShopPspService {
  private readonly logger = new Logger(ShopPspService.name);
  private readonly adapters: Map<ProviderPspShop, ShopPspAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly lifecycle: ShopOrderLifecycleService,
    paystack: PaystackAdapter,
    orangeMoney: OrangeMoneyAdapter,
    wave: WaveAdapter,
  ) {
    this.adapters = new Map<ProviderPspShop, ShopPspAdapter>([
      ['PAYSTACK', paystack],
      ['ORANGE_MONEY', orangeMoney],
      ['WAVE', wave],
    ]);
  }

  sandboxActif(): boolean {
    return pspSandboxAutorise({
      nodeEnv: this.config.get<string>('NODE_ENV'),
      sandboxFlag: this.config.get<string>('SHOP_PSP_SANDBOX'),
    });
  }

  /** True si on peut ouvrir une session sans appel PSP externe. */
  doitUtiliserSandbox(provider: ProviderPspShop): boolean {
    return this.sandboxActif() && !this.providerConfigure(provider);
  }

  private providerConfigure(provider: ProviderPspShop): boolean {
    return pspProviderConfigure(provider, {
      paystackSecret: this.config.get<string>('PAYSTACK_SECRET_KEY'),
      orangeMoneyEnabled: this.config.get<string>('ORANGE_MONEY_ENABLED'),
      waveEnabled: this.config.get<string>('WAVE_ENABLED'),
    });
  }

  private shopPublicUrl(): string {
    return (
      this.config.get<string>('SHOP_PUBLIC_URL') ?? 'http://127.0.0.1:5174'
    );
  }

  private sessionSandbox(
    commande: {
      id: string;
      clientOperationId: string;
      suiviToken: string | null;
    },
    provider: ProviderPspShop,
  ): InitPaiementResult {
    return {
      authorizationUrl: urlConfirmationSandbox({
        shopPublicUrl: this.shopPublicUrl(),
        commandeId: commande.id,
        clientOperationId: commande.clientOperationId,
        suiviToken: commande.suiviToken,
      }),
      reference: commande.clientOperationId,
      providerReference: `sandbox-${provider}-${commande.id}`,
      sandbox: true,
    };
  }

  async initierPaiement(commandeId: string, provider: ProviderPspShop) {
    const commande = await this.prisma.commandeWeb.findUnique({
      where: { id: commandeId },
    });
    if (!commande) throw new NotFoundException('Commande introuvable.');
    if (commande.statut !== 'EN_ATTENTE_PAIEMENT') {
      throw new BadRequestException('Commande non en attente de paiement.');
    }
    if (commande.modeReglement !== 'PREPAYE_PSP') {
      throw new BadRequestException('Commande non prépayée PSP.');
    }

    const adapter = this.adapters.get(provider);
    if (!adapter) throw new BadRequestException('PSP inconnu.');

    const email =
      commande.emailInvite ??
      (commande.compteClientId
        ? (
            await this.prisma.compteClient.findUnique({
              where: { id: commande.compteClientId },
            })
          )?.email
        : null) ??
      'client@shop.local';

    const callbackBase = this.shopPublicUrl();
    const useSandbox = this.sandboxActif() && !this.providerConfigure(provider);

    let result: InitPaiementResult;
    if (useSandbox) {
      result = this.sessionSandbox(commande, provider);
    } else {
      try {
        result = await adapter.initierPaiement({
          commandeWebId: commande.id,
          clientOperationId: commande.clientOperationId,
          montantTotal: Number(commande.montantTotal),
          email,
          callbackUrl: `${callbackBase}/checkout/confirmation?commandeId=${commande.id}&ref=${commande.clientOperationId}&token=${commande.suiviToken ?? ''}`,
          provider,
        });
      } catch (err) {
        if (this.sandboxActif()) {
          this.logger.warn(
            `PSP ${provider} indisponible, bascule sandbox (${err instanceof Error ? err.message : String(err)})`,
          );
          result = this.sessionSandbox(commande, provider);
        } else if (err instanceof HttpException) {
          throw err;
        } else {
          this.logger.error(
            `Init paiement ${provider} échouée`,
            err instanceof Error ? err.stack : String(err),
          );
          throw new ServiceUnavailableException(
            messagePspIndisponible(provider),
          );
        }
      }
    }

    await this.prisma.paiementCommandeWeb.create({
      data: {
        commandeWebId: commande.id,
        provider,
        type: 'INITIE',
        referenceExterne: commande.clientOperationId,
        referenceProvider: result.providerReference,
        montant: commande.montantTotal,
        statut: 'EN_COURS',
      },
    });

    if (commande.providerPsp !== provider) {
      await this.prisma.commandeWeb.update({
        where: { id: commande.id },
        data: { providerPsp: provider },
      });
    }

    return result;
  }

  /** Après redirection Paystack (query `reference` / `trxref`). */
  async confirmerRetourPaystack(
    commandeIdOrRef: string,
    referencePsp?: string,
  ) {
    const commande = await this.prisma.commandeWeb.findFirst({
      where: {
        OR: [{ id: commandeIdOrRef }, { clientOperationId: commandeIdOrRef }],
      },
    });
    if (!commande) throw new NotFoundException('Commande introuvable.');
    const dejaPayee = new Set([
      'PAYEE',
      'PREPARATION',
      'PRETE',
      'EXPEDIEE',
      'LIVREE',
      'REMISE',
    ]);
    if (dejaPayee.has(commande.statut)) {
      return {
        id: commande.id,
        statut: commande.statut,
        suiviToken: commande.suiviToken,
      };
    }
    if (commande.statut !== 'EN_ATTENTE_PAIEMENT') {
      throw new BadRequestException('Commande non en attente de paiement.');
    }
    const reference = (referencePsp ?? commande.clientOperationId).trim();
    if (reference !== commande.clientOperationId) {
      throw new ForbiddenException('Référence de paiement invalide.');
    }
    const adapter = this.adapters.get('PAYSTACK');
    if (!adapter?.verifierTransaction) {
      throw new ServiceUnavailableException(
        'Le paiement par carte est temporairement indisponible. Réessayez — aucun débit n’a été effectué.',
      );
    }
    const evenement = await adapter.verifierTransaction(reference);
    if (!evenement) {
      throw new BadRequestException(
        'Le paiement n’est pas encore confirmé. Attendez quelques secondes puis rechargez — aucun débit n’a été effectué si la session a échoué.',
      );
    }
    await this.capturerPaiement('PAYSTACK', evenement);
    const updated = await this.prisma.commandeWeb.findUnique({
      where: { id: commande.id },
    });
    return {
      id: commande.id,
      statut: updated?.statut ?? commande.statut,
      suiviToken: updated?.suiviToken ?? commande.suiviToken,
    };
  }

  async confirmerSandbox(commandeIdOrRef: string) {
    if (!this.sandboxActif()) {
      throw new ForbiddenException('Confirmation sandbox désactivée.');
    }
    const commande = await this.prisma.commandeWeb.findFirst({
      where: {
        OR: [{ id: commandeIdOrRef }, { clientOperationId: commandeIdOrRef }],
      },
    });
    if (!commande) throw new NotFoundException('Commande introuvable.');

    const dejaPayee = new Set([
      'PAYEE',
      'PREPARATION',
      'PRETE',
      'EXPEDIEE',
      'LIVREE',
      'REMISE',
    ]);
    if (dejaPayee.has(commande.statut)) {
      return {
        id: commande.id,
        statut: commande.statut,
        suiviToken: commande.suiviToken,
        sandbox: true,
      };
    }
    if (commande.statut !== 'EN_ATTENTE_PAIEMENT') {
      throw new BadRequestException('Commande non en attente de paiement.');
    }

    const provider = commande.providerPsp ?? 'PAYSTACK';
    try {
      await this.capturerPaiement(provider, {
        type: 'charge.success',
        reference: commande.clientOperationId,
        providerReference: `sandbox-${commande.id}`,
        montant: Math.round(Number(commande.montantTotal)),
        devise: 'XOF',
        webhookEventId: `sandbox:${commande.id}`,
        payload: { sandbox: true, commandeWebId: commande.id },
      });
    } catch (err) {
      this.logger.warn(
        `Sandbox confirm idempotent ${commande.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const updated = await this.prisma.commandeWeb.findUnique({
      where: { id: commande.id },
    });
    return {
      id: commande.id,
      statut: updated?.statut ?? commande.statut,
      suiviToken: updated?.suiviToken ?? commande.suiviToken,
      sandbox: true,
    };
  }

  async traiterWebhook(
    provider: ProviderPspShop,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ) {
    const adapter = this.adapters.get(provider);
    if (!adapter) return { ok: false };

    const evenement = adapter.verifierWebhook(headers, rawBody);
    if (!evenement) {
      throw new BadRequestException('Signature webhook invalide.');
    }

    try {
      await this.prisma.webhookJournal.create({
        data: {
          provider,
          eventType: evenement.type,
          eventId: evenement.webhookEventId,
          payload: evenement.payload as object,
          traite: false,
        },
      });
    } catch {
      return { ok: true, duplicate: true };
    }

    if (
      evenement.type === 'charge.success' ||
      evenement.type === 'payment.success' ||
      evenement.type === 'checkout.session.completed'
    ) {
      await this.capturerPaiement(provider, evenement);
    } else if (
      evenement.type === 'refund.processed' ||
      evenement.type === 'charge.refunded'
    ) {
      await this.appliquerRemboursementWebhook(provider, evenement);
    }

    await this.prisma.webhookJournal.updateMany({
      where: { provider, eventId: evenement.webhookEventId },
      data: { traite: true },
    });

    return { ok: true };
  }

  private async appliquerRemboursementWebhook(
    provider: ProviderPspShop,
    ev: PspEvenement,
  ) {
    const commande = await this.prisma.commandeWeb.findUnique({
      where: { clientOperationId: ev.reference },
    });
    if (!commande || commande.statut === 'REMBOURSEE') return;
    await this.prisma.$transaction(async (tx) => {
      await tx.paiementCommandeWeb.create({
        data: {
          commandeWebId: commande.id,
          provider,
          type: 'REMBOURSEMENT',
          referenceExterne: ev.reference,
          referenceProvider: ev.providerReference,
          montant: commande.montantTotal,
          statut: 'REMBOURSE',
          webhookEventId: ev.webhookEventId,
          payloadWebhookJson: ev.payload as object,
        },
      });
      await tx.commandeWeb.update({
        where: { id: commande.id },
        data: { statut: 'REMBOURSEE' },
      });
      await tx.reservationWeb.deleteMany({
        where: { commandeWebId: commande.id },
      });
    });
  }

  private async capturerPaiement(provider: ProviderPspShop, ev: PspEvenement) {
    const commande = await this.prisma.commandeWeb.findUnique({
      where: { clientOperationId: ev.reference },
    });
    if (!commande) {
      this.logger.warn(`Webhook sans commande: ${ev.reference}`);
      return;
    }
    if (Math.round(Number(commande.montantTotal)) !== Math.round(ev.montant)) {
      this.logger.error(
        `Montant webhook incorrect commande ${commande.id}: attendu ${commande.montantTotal.toString()}, reçu ${ev.montant}`,
      );
      return;
    }

    const ctx = {
      modeReglement: commande.modeReglement,
      modeFulfillment: commande.modeFulfillment,
    };

    if (commande.statut === 'PAYEE') return;

    if (
      !transitionCommandeWebAutorisee(
        commande.statut,
        StatutCommandeWeb.PAYEE,
        ctx,
      )
    ) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paiementCommandeWeb.create({
        data: {
          commandeWebId: commande.id,
          provider,
          type: 'CAPTURE',
          referenceExterne: ev.reference,
          referenceProvider: ev.providerReference,
          montant: commande.montantTotal,
          statut: 'REUSSI',
          webhookEventId: ev.webhookEventId,
          payloadWebhookJson: ev.payload as object,
        },
      });
      await tx.commandeWeb.update({
        where: { id: commande.id },
        data: {
          statut: 'PAYEE',
          payeeAt: new Date(),
        },
      });
      if (
        transitionCommandeWebAutorisee(
          StatutCommandeWeb.PAYEE,
          StatutCommandeWeb.PREPARATION,
          ctx,
        )
      ) {
        await tx.commandeWeb.update({
          where: { id: commande.id },
          data: { statut: 'PREPARATION' },
        });
      }
    });

    const si = await this.prisma.utilisateur.findFirst({
      where: { role: { libelle: 'RESPONSABLE_SI' } },
    });
    if (si) {
      await this.audit.record({
        utilisateurId: si.id,
        action: 'PAIEMENT_WEB_CAPTURE',
        entite: 'CommandeWeb',
        entiteId: commande.id,
        details: `${provider} ${ev.webhookEventId}`,
      });
    }

    await this.lifecycle.apresPaiementReussi(commande.id);
  }

  async rembourser(commandeId: string, utilisateurId: string) {
    const commande = await this.prisma.commandeWeb.findUnique({
      where: { id: commandeId },
      include: { paiements: true },
    });
    if (!commande) throw new NotFoundException('Commande introuvable.');
    const capture = commande.paiements.find(
      (p) => p.type === 'CAPTURE' && p.statut === 'REUSSI',
    );
    if (!capture) {
      throw new BadRequestException('Aucun paiement capturé à rembourser.');
    }
    if (commande.statut === 'REMBOURSEE') {
      return commande;
    }

    const adapter = this.adapters.get(capture.provider);
    let referenceProvider = capture.referenceProvider ?? undefined;
    if (adapter?.rembourser) {
      const result = await adapter.rembourser({
        referenceExterne: commande.clientOperationId,
        referenceProvider: capture.referenceProvider,
        montant: Number(commande.montantTotal),
      });
      referenceProvider = result.referenceProvider ?? referenceProvider;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paiementCommandeWeb.create({
        data: {
          commandeWebId: commande.id,
          provider: capture.provider,
          type: 'REMBOURSEMENT',
          referenceExterne: commande.clientOperationId,
          referenceProvider,
          montant: commande.montantTotal,
          statut: 'REMBOURSE',
        },
      });
      await tx.commandeWeb.update({
        where: { id: commande.id },
        data: { statut: 'REMBOURSEE' },
      });
      await tx.reservationWeb.deleteMany({
        where: { commandeWebId: commande.id },
      });
    });

    await this.audit.record({
      utilisateurId,
      action: 'PAIEMENT_WEB_REMBOURSE',
      entite: 'CommandeWeb',
      entiteId: commandeId,
      details: capture.provider,
    });

    return this.prisma.commandeWeb.findUnique({ where: { id: commandeId } });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async libererReservationsExpirees() {
    const now = new Date();
    const expirees = await this.prisma.commandeWeb.findMany({
      where: {
        statut: 'EN_ATTENTE_PAIEMENT',
        expireAt: { lt: now },
      },
    });
    for (const cmd of expirees) {
      await this.prisma.$transaction([
        this.prisma.reservationWeb.deleteMany({
          where: { commandeWebId: cmd.id },
        }),
        this.prisma.commandeWeb.update({
          where: { id: cmd.id },
          data: { statut: 'ANNULEE' },
        }),
      ]);
      await this.lifecycle.apresChangementStatut(
        cmd.id,
        'EN_ATTENTE_PAIEMENT',
        'ANNULEE',
      );
    }
  }
}
