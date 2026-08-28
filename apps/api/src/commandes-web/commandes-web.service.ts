import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ShopOrderLifecycleService } from '../shop/shop-order-lifecycle.service';
import { SalesGlService } from '../accounting-gl/sales-gl.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  transitionCommandeWebAutorisee,
  transitionsCommandeWebAutorisees,
  type ContexteTransitionCommandeWeb,
} from '../shop/commande-web-state-machine';
import {
  ModeFulfillmentCommandeWeb,
  StatutCommandeWeb,
  type ModeFulfillmentCommandeWeb as ModeFulfillmentType,
  type StatutCommandeWeb as StatutType,
} from '@caisse-crm/shared';
import {
  assertCommandeWebAccessible,
  wherePerimetreCommandesWeb,
} from './commandes-web.scope';

const LISTE_INCLUDE = {
  lignes: true,
  boutiqueRetrait: {
    select: { id: true, nom: true, adresse: true, delaiRetraitHeures: true },
  },
  conversionVente: { select: { venteId: true, createdAt: true } },
  client: { select: { id: true, nom: true, prenom: true, contact: true } },
  compteClient: { select: { email: true } },
} as const;

@Injectable()
export class CommandesWebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lifecycle: ShopOrderLifecycleService,
    private readonly salesGl: SalesGlService,
  ) {}

  private enrichir<
    T extends {
      statut: string;
      modeReglement: string;
      modeFulfillment: string;
    },
  >(cmd: T) {
    const ctx: ContexteTransitionCommandeWeb = {
      modeReglement:
        cmd.modeReglement as ContexteTransitionCommandeWeb['modeReglement'],
      modeFulfillment:
        cmd.modeFulfillment as ContexteTransitionCommandeWeb['modeFulfillment'],
    };
    return {
      ...cmd,
      transitions: transitionsCommandeWebAutorisees(
        cmd.statut as StatutType,
        ctx,
      ),
    };
  }

  async lister(
    query: {
      statut?: StatutType;
      boutiqueRetraitId?: string;
      modeFulfillment?: ModeFulfillmentType;
      q?: string;
    },
    user: AuthenticatedUser,
  ) {
    const statut =
      query.statut && query.statut !== StatutCommandeWeb.PANIER
        ? query.statut
        : undefined;
    const mode = query.modeFulfillment;
    if (mode && !Object.values(ModeFulfillmentCommandeWeb).includes(mode)) {
      throw new BadRequestException('modeFulfillment invalide.');
    }

    const q = query.q?.trim();
    const recherche: Prisma.CommandeWebWhereInput | undefined =
      q && q.length >= 2
        ? {
            OR: [
              { emailInvite: { contains: q, mode: 'insensitive' } },
              { telephoneInvite: { contains: q } },
              { id: { startsWith: q.toLowerCase() } },
              { suiviToken: { contains: q } },
              { numeroSuivi: { contains: q, mode: 'insensitive' } },
              {
                compteClient: {
                  email: { contains: q, mode: 'insensitive' },
                },
              },
              { client: { nom: { contains: q, mode: 'insensitive' } } },
              { client: { contact: { contains: q } } },
            ],
          }
        : undefined;

    const rows = await this.prisma.commandeWeb.findMany({
      where: {
        ...(statut
          ? { statut }
          : { statut: { not: StatutCommandeWeb.PANIER } }),
        ...wherePerimetreCommandesWeb(user),
        ...(query.boutiqueRetraitId
          ? { boutiqueRetraitId: query.boutiqueRetraitId }
          : {}),
        ...(mode ? { modeFulfillment: mode } : {}),
        ...recherche,
      },
      include: LISTE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.enrichir(row));
  }

  async detail(id: string, user: AuthenticatedUser) {
    const cmd = await this.prisma.commandeWeb.findUnique({
      where: { id },
      include: {
        lignes: true,
        paiements: true,
        boutiqueRetrait: {
          select: {
            id: true,
            nom: true,
            adresse: true,
            delaiRetraitHeures: true,
          },
        },
        zoneLivraison: { select: { id: true, libelle: true } },
        avis: true,
        conversionVente: { select: { venteId: true, createdAt: true } },
        client: {
          select: { id: true, nom: true, prenom: true, contact: true },
        },
        compteClient: { select: { email: true } },
        entrepot: { select: { id: true, nom: true, code: true } },
      },
    });
    if (!cmd || cmd.statut === 'PANIER') {
      throw new NotFoundException('Commande web introuvable.');
    }
    assertCommandeWebAccessible(cmd, user);
    return this.enrichir(cmd);
  }

  async changerStatut(
    id: string,
    vers: StatutType,
    user: AuthenticatedUser,
    numeroSuivi?: string,
  ) {
    const cmd = await this.prisma.commandeWeb.findUnique({ where: { id } });
    if (!cmd || cmd.statut === 'PANIER') {
      throw new NotFoundException('Commande web introuvable.');
    }
    assertCommandeWebAccessible(cmd, user);
    const ctx = {
      modeReglement: cmd.modeReglement,
      modeFulfillment: cmd.modeFulfillment,
    };
    if (!transitionCommandeWebAutorisee(cmd.statut, vers, ctx)) {
      throw new BadRequestException(
        `Transition "${cmd.statut}" → "${vers}" non autorisée.`,
      );
    }
    const updated = await this.prisma.commandeWeb.update({
      where: { id },
      data: {
        statut: vers,
        ...(vers === StatutCommandeWeb.PAYEE ? { payeeAt: new Date() } : {}),
        ...(vers === StatutCommandeWeb.EXPEDIEE && numeroSuivi?.trim()
          ? { numeroSuivi: numeroSuivi.trim() }
          : {}),
      },
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COMMANDE_WEB_STATUT',
      entite: 'CommandeWeb',
      entiteId: id,
      details: `${cmd.statut} → ${vers}`,
    });
    await this.lifecycle.apresChangementStatut(id, cmd.statut, vers, {
      utilisateurId: user.userId,
    });
    return updated;
  }

  /** Conversion QR click & collect → Vente POS (Lot 9). */
  async convertirVente(
    id: string,
    user: AuthenticatedUser,
    clientOperationId: string,
  ) {
    const cmd = await this.prisma.commandeWeb.findUnique({
      where: { id },
      include: { lignes: true, conversionVente: true },
    });
    if (!cmd) throw new NotFoundException('Commande introuvable.');
    if (cmd.conversionVente) {
      return cmd.conversionVente;
    }
    if (
      cmd.statut !== 'REMISE' &&
      cmd.statut !== 'LIVREE' &&
      cmd.statut !== 'PAYEE'
    ) {
      throw new BadRequestException(
        'Conversion autorisée après REMISE, LIVREE ou PAYEE.',
      );
    }
    if (
      cmd.boutiqueRetraitId &&
      user.boutiqueId &&
      cmd.boutiqueRetraitId !== user.boutiqueId
    ) {
      throw new ForbiddenException("Commande d'une autre boutique.");
    }

    const caisse = await this.prisma.caisse.findFirst({
      where: {
        boutiqueId: user.boutiqueId ?? cmd.boutiqueRetraitId,
        type: 'TIROIR',
      },
    });
    if (!caisse) {
      throw new BadRequestException('Aucun tiroir POS pour cette boutique.');
    }
    const session = await this.prisma.sessionCaisse.findFirst({
      where: { caisseId: caisse.id, statut: 'OUVERTE' },
    });
    if (!session) {
      throw new BadRequestException('Session caisse ouverte requise.');
    }

    const modePaiement =
      cmd.modeReglement === 'PREPAYE_PSP' ? 'CARTE' : 'ESPECES';

    const existingVente = clientOperationId
      ? await this.prisma.vente.findUnique({
          where: { clientOperationId },
        })
      : null;
    if (existingVente) {
      return this.prisma.conversionCommandeVente.findUnique({
        where: { commandeWebId: id },
      });
    }

    const vente = await this.prisma.$transaction(async (tx) => {
      const v = await tx.vente.create({
        data: {
          montantTotal: cmd.montantTotal,
          modePaiement,
          caisseId: caisse.id,
          sessionCaisseId: session.id,
          clientId: cmd.clientId,
          clientOperationId,
          lignes: {
            create: cmd.lignes.map((l) => ({
              produitId: l.produitId,
              quantite: l.quantite,
              prixUnitaire: l.prixUnitaireTtc,
              remise: 0,
            })),
          },
          paiements: {
            create: {
              modePaiement,
              montant: cmd.montantTotal,
            },
          },
        },
      });
      await tx.conversionCommandeVente.create({
        data: { commandeWebId: id, venteId: v.id },
      });
      if (cmd.statut !== 'PAYEE') {
        await tx.commandeWeb.update({
          where: { id },
          data: { statut: 'PAYEE', payeeAt: new Date() },
        });
      }
      return v;
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'CONVERSION_COMMANDE_VENTE',
      entite: 'CommandeWeb',
      entiteId: id,
      details: `Vente ${vente.id}`,
    });

    await this.salesGl.tryPostVente(vente.id, user.userId);

    return { venteId: vente.id, commandeWebId: id };
  }

  /** Scan QR click & collect (suiviToken) → conversion POS. */
  async convertirParSuiviToken(
    suiviToken: string,
    user: AuthenticatedUser,
    clientOperationId: string,
  ) {
    const cmd = await this.prisma.commandeWeb.findFirst({
      where: { suiviToken },
    });
    if (!cmd) throw new NotFoundException('Commande introuvable pour ce QR.');
    return this.convertirVente(cmd.id, user, clientOperationId);
  }

  async detailParSuiviToken(suiviToken: string, user: AuthenticatedUser) {
    const cmd = await this.prisma.commandeWeb.findFirst({
      where: { suiviToken },
      include: {
        lignes: true,
        conversionVente: true,
        boutiqueRetrait: {
          select: { id: true, nom: true, adresse: true },
        },
      },
    });
    if (!cmd) throw new NotFoundException('Commande introuvable pour ce QR.');
    assertCommandeWebAccessible(cmd, user);
    return this.enrichir(cmd);
  }
}
