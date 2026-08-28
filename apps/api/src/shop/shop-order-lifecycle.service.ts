import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FideliteService } from '../crm/fidelite/fidelite.service';
import { ShopEmailService } from './shop-email.service';
import { SalesGlService } from '../accounting-gl/sales-gl.service';
import { StatutCommandeWeb } from '@caisse-crm/shared';

/**
 * Orchestrateur intelligent du cycle de vie commande web :
 * e-mails client + admin à chaque étape, fidélité + avis après remise/livraison.
 */
@Injectable()
export class ShopOrderLifecycleService {
  private readonly logger = new Logger(ShopOrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: ShopEmailService,
    private readonly fidelite: FideliteService,
    private readonly config: ConfigService,
    private readonly salesGl: SalesGlService,
  ) {}

  private shopPublicUrl() {
    return (
      this.config.get<string>('SHOP_PUBLIC_URL') ?? 'http://127.0.0.1:5174'
    );
  }

  private async loadCommande(id: string) {
    return this.prisma.commandeWeb.findUnique({
      where: { id },
      include: {
        lignes: true,
        compteClient: true,
        boutiqueRetrait: { select: { nom: true, adresse: true } },
        avis: true,
      },
    });
  }

  private destinataireClient(
    cmd: NonNullable<Awaited<ReturnType<typeof this.loadCommande>>>,
  ): string | null {
    return cmd.emailInvite ?? cmd.compteClient?.email ?? null;
  }

  private ctxBase(
    cmd: NonNullable<Awaited<ReturnType<typeof this.loadCommande>>>,
  ): Record<string, string> {
    const ref = cmd.id.slice(0, 8).toUpperCase();
    return {
      commandeId: cmd.id,
      reference: ref,
      montant: Number(cmd.montantTotal).toFixed(0),
      statut: cmd.statut,
      modeFulfillment: cmd.modeFulfillment,
      modeReglement: cmd.modeReglement,
      suiviUrl: cmd.suiviToken
        ? `${this.shopPublicUrl()}/suivi/${cmd.suiviToken}`
        : `${this.shopPublicUrl()}/compte`,
      articles: cmd.lignes
        .map((l) => `${l.designationSnapshot} × ${l.quantite}`)
        .join(', '),
    };
  }

  /** Nouvelle commande (checkout) — admin + client selon statut. */
  async apresCheckout(commandeId: string): Promise<void> {
    const cmd = await this.loadCommande(commandeId);
    if (!cmd || cmd.statut === 'PANIER') return;

    const base = this.ctxBase(cmd);
    const client = this.destinataireClient(cmd);
    const admin = this.email.adminInbox();

    if (admin) {
      await this.email.envoyer(admin, 'admin_nouvelle_commande', {
        ...base,
        emailClient: client ?? '',
      });
    }

    if (client) {
      if (cmd.statut === StatutCommandeWeb.EN_ATTENTE_PAIEMENT) {
        await this.email.envoyer(
          client,
          'commande_recue_attente_paiement',
          base,
        );
      } else if (cmd.statut === StatutCommandeWeb.PREPARATION) {
        await this.email.envoyer(client, 'confirmation_commande', {
          ...base,
          message:
            'Votre commande est confirmée. Merci pour votre confiance. Elle est en préparation.',
        });
        await this.email.envoyer(client, 'commande_en_preparation', base);
      }
    }
  }

  /** Paiement PSP réussi (webhook). */
  async apresPaiementReussi(commandeId: string): Promise<void> {
    const cmd = await this.loadCommande(commandeId);
    if (!cmd) return;

    const base = this.ctxBase(cmd);
    const client = this.destinataireClient(cmd);
    const admin = this.email.adminInbox();

    if (client) {
      await this.email.envoyer(client, 'confirmation_commande', {
        ...base,
        message:
          'Votre paiement est confirmé. Merci pour votre confiance ! Votre commande passe en préparation.',
      });
      if (cmd.statut === StatutCommandeWeb.PREPARATION) {
        await this.email.envoyer(client, 'commande_en_preparation', base);
      }
    }
    if (admin) {
      await this.email.envoyer(admin, 'admin_statut_commande', {
        ...base,
        evenement: 'PAIEMENT_REUSSI',
        emailClient: client ?? '',
      });
    }

    await this.salesGl.tryPostCommandeWeb(commandeId);
  }

  /** Transition staff (ou système) — e-mails client + admin. */
  async apresChangementStatut(
    commandeId: string,
    depuis: string,
    vers: string,
    opts?: { utilisateurId?: string },
  ): Promise<void> {
    const cmd = await this.loadCommande(commandeId);
    if (!cmd) return;

    const base = this.ctxBase(cmd);
    const client = this.destinataireClient(cmd);
    const admin = this.email.adminInbox();

    if (admin) {
      await this.email.envoyer(admin, 'admin_statut_commande', {
        ...base,
        evenement: `${depuis}→${vers}`,
        emailClient: client ?? '',
      });
    }

    if (!client) return;

    switch (vers) {
      case StatutCommandeWeb.PREPARATION:
        await this.email.envoyer(client, 'commande_en_preparation', base);
        break;
      case StatutCommandeWeb.PRETE:
        await this.email.envoyer(client, 'commande_prete', {
          ...base,
          boutique: cmd.boutiqueRetrait?.nom ?? '',
          adresseBoutique: cmd.boutiqueRetrait?.adresse ?? '',
        });
        break;
      case StatutCommandeWeb.EXPEDIEE:
        await this.email.envoyer(client, 'expedition', {
          ...base,
          numeroSuivi: cmd.numeroSuivi ?? '',
        });
        break;
      case StatutCommandeWeb.LIVREE:
        await this.email.envoyer(client, 'livraison_effectuee', base);
        await this.finaliserReception(cmd.id, opts?.utilisateurId);
        break;
      case StatutCommandeWeb.REMISE:
        await this.email.envoyer(client, 'remise_boutique', base);
        await this.finaliserReception(cmd.id, opts?.utilisateurId);
        break;
      case StatutCommandeWeb.ANNULEE:
        await this.email.envoyer(client, 'paiement_echec', {
          ...base,
          motif: 'Commande annulée',
        });
        break;
      default:
        break;
    }
  }

  /** Après livraison / remise : fidélité + e-mail avis. */
  private async finaliserReception(
    commandeId: string,
    utilisateurId?: string,
  ): Promise<void> {
    const cmd = await this.loadCommande(commandeId);
    if (!cmd) return;

    const clientId = cmd.clientId ?? cmd.compteClient?.clientId ?? null;
    let pointsCredites = '0';

    if (clientId) {
      const si =
        utilisateurId ??
        (
          await this.prisma.utilisateur.findFirst({
            where: { role: { libelle: 'RESPONSABLE_SI' }, actif: true },
            select: { id: true },
          })
        )?.id;
      if (si) {
        const fid = await this.fidelite.crediterDepuisVente({
          clientId,
          montantTotal: cmd.montantTotal,
          venteId: `shop-${cmd.id}`,
          utilisateurId: si,
        });
        if (fid) {
          pointsCredites = String(Math.floor(Number(cmd.montantTotal) / 1000));
        }
      }
    }

    let avis = cmd.avis;
    if (!avis) {
      avis = await this.prisma.avisCommandeWeb.create({
        data: {
          commandeWebId: cmd.id,
          token: randomBytes(24).toString('hex'),
        },
      });
    }

    const client = this.destinataireClient(cmd);
    if (!client) return;

    const avisUrl = `${this.shopPublicUrl()}/avis/${avis.token}`;
    await this.email.envoyer(client, 'fidelite_et_avis', {
      ...this.ctxBase(cmd),
      points: pointsCredites,
      avisUrl,
      message:
        pointsCredites !== '0'
          ? `Nous avons crédité environ ${pointsCredites} point(s) fidélité. Merci de noter notre service.`
          : 'Merci pour votre confiance. Donnez-nous votre avis sur le service.',
    });
  }
}
