import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RoleLibelle, StatutCommandeAchat } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { AchatsStateMachineService } from './achats-state-machine.service';
import { CreateCommandeAchatDto } from './dto/create-commande-achat.dto';

const INCLUDE_COMMANDE = {
  fournisseur: {
    select: { id: true, nom: true, actif: true },
  },
  boutique: { select: { id: true, nom: true } },
  initiateur: { select: { id: true, nom: true, prenom: true } },
  lignes: {
    include: {
      produit: { select: { id: true, designation: true, reference: true } },
      receptions: { select: { quantite: true } },
    },
  },
} as const;

type CommandeChargee = Prisma.CommandeAchatGetPayload<{
  include: typeof INCLUDE_COMMANDE;
}>;

@Injectable()
export class CommandesAchatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly machine: AchatsStateMachineService,
  ) {}

  async creer(dto: CreateCommandeAchatDto, user: AuthenticatedUser) {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: dto.fournisseurId },
    });
    if (!fournisseur) {
      throw new NotFoundException(
        `Fournisseur ${dto.fournisseurId} introuvable.`,
      );
    }
    if (!fournisseur.actif) {
      throw new BadRequestException(
        'Fournisseur inactif : impossible de commander.',
      );
    }

    const boutiqueId = this.resolveBoutiqueId(dto.boutiqueId, user);
    const produits = await this.chargerProduitsActifs(
      dto.lignes.map((l) => l.produitId),
    );

    const commande = await this.prisma.commandeAchat.create({
      data: {
        numero: this.numero('BC'),
        fournisseurId: dto.fournisseurId,
        notes: dto.notes?.trim() || null,
        initiateurId: user.userId,
        boutiqueId,
        lignes: {
          create: dto.lignes.map((l) => ({
            produitId: l.produitId,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
          })),
        },
      },
      include: INCLUDE_COMMANDE,
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COMMANDE_ACHAT_CREATED',
      entite: 'CommandeAchat',
      entiteId: commande.id,
      details: JSON.stringify({
        numero: commande.numero,
        fournisseurId: dto.fournisseurId,
        lignes: dto.lignes.length,
      }),
    });

    void produits;
    return this.serialiser(commande);
  }

  async lister(user: AuthenticatedUser) {
    const commandes = await this.prisma.commandeAchat.findMany({
      where: this.scopeWhere(user),
      include: INCLUDE_COMMANDE,
      orderBy: { dateCommande: 'desc' },
    });
    return commandes.map((c) => this.serialiser(c));
  }

  async detail(id: string, user: AuthenticatedUser) {
    const commande = await this.charger(id);
    this.assertLecture(commande, user);
    return this.serialiser(commande);
  }

  async confirmer(id: string, user: AuthenticatedUser) {
    const commande = await this.charger(id);
    this.assertEcriture(commande, user);
    this.machine.assertCommande(commande.statut, StatutCommandeAchat.CONFIRMEE);
    if (commande.lignes.length === 0) {
      throw new BadRequestException(
        'Impossible de confirmer une commande sans ligne.',
      );
    }

    const updated = await this.prisma.commandeAchat.update({
      where: { id },
      data: {
        statut: StatutCommandeAchat.CONFIRMEE,
        dateConfirmation: new Date(),
      },
      include: INCLUDE_COMMANDE,
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COMMANDE_ACHAT_CONFIRMEE',
      entite: 'CommandeAchat',
      entiteId: id,
      details: JSON.stringify({ numero: updated.numero }),
    });
    return this.serialiser(updated);
  }

  async annuler(id: string, user: AuthenticatedUser) {
    const commande = await this.charger(id);
    this.assertEcriture(commande, user);
    this.machine.assertCommande(commande.statut, StatutCommandeAchat.ANNULEE);
    const recues = commande.lignes.reduce(
      (s, l) => s + l.receptions.reduce((a, r) => a + r.quantite, 0),
      0,
    );
    if (recues > 0) {
      throw new BadRequestException(
        'Impossible d’annuler : des réceptions sont déjà enregistrées sur cette commande.',
      );
    }

    const updated = await this.prisma.commandeAchat.update({
      where: { id },
      data: { statut: StatutCommandeAchat.ANNULEE },
      include: INCLUDE_COMMANDE,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COMMANDE_ACHAT_ANNULEE',
      entite: 'CommandeAchat',
      entiteId: id,
    });
    return this.serialiser(updated);
  }

  async cloturer(id: string, user: AuthenticatedUser) {
    const commande = await this.charger(id);
    this.assertEcriture(commande, user);
    this.machine.assertCommande(commande.statut, StatutCommandeAchat.CLOTUREE);
    const updated = await this.prisma.commandeAchat.update({
      where: { id },
      data: {
        statut: StatutCommandeAchat.CLOTUREE,
        dateCloture: new Date(),
      },
      include: INCLUDE_COMMANDE,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COMMANDE_ACHAT_CLOTUREE',
      entite: 'CommandeAchat',
      entiteId: id,
    });
    return this.serialiser(updated);
  }

  async appliquerStatutApresReception(
    commandeId: string,
    tx: Prisma.TransactionClient,
  ) {
    const commande = await tx.commandeAchat.findUniqueOrThrow({
      where: { id: commandeId },
      include: {
        lignes: { include: { receptions: { select: { quantite: true } } } },
      },
    });
    if (
      commande.statut === StatutCommandeAchat.ANNULEE ||
      commande.statut === StatutCommandeAchat.BROUILLON ||
      commande.statut === StatutCommandeAchat.CLOTUREE
    ) {
      return commande.statut;
    }

    const lignes = commande.lignes.map((l) => ({
      commandee: l.quantite,
      recue: l.receptions.reduce((s, r) => s + r.quantite, 0),
    }));
    const toutesRecues = lignes.every((l) => l.recue >= l.commandee);
    const aucune = lignes.every((l) => l.recue === 0);
    const cible = toutesRecues
      ? StatutCommandeAchat.RECEPTIONNEE
      : aucune
        ? StatutCommandeAchat.CONFIRMEE
        : StatutCommandeAchat.PARTIELLEMENT_RECEPTIONNEE;

    if (cible === commande.statut) return commande.statut;
    this.machine.assertCommande(commande.statut, cible);
    await tx.commandeAchat.update({
      where: { id: commandeId },
      data: { statut: cible },
    });
    return cible;
  }

  private async charger(id: string): Promise<CommandeChargee> {
    const commande = await this.prisma.commandeAchat.findUnique({
      where: { id },
      include: INCLUDE_COMMANDE,
    });
    if (!commande) {
      throw new NotFoundException(`Commande ${id} introuvable.`);
    }
    return commande;
  }

  private async chargerProduitsActifs(ids: string[]) {
    const uniques = [...new Set(ids)];
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: uniques } },
    });
    if (produits.length !== uniques.length) {
      throw new BadRequestException(
        'Un produit de la commande est introuvable.',
      );
    }
    const inactif = produits.find((p) => !p.actif);
    if (inactif) {
      throw new BadRequestException(
        `Produit inactif « ${inactif.designation} » : hors commande.`,
      );
    }
    if (uniques.length !== ids.length) {
      throw new BadRequestException(
        'Une commande ne peut pas dupliquer le même article.',
      );
    }
    return produits;
  }

  private resolveBoutiqueId(
    boutiqueId: string | undefined,
    user: AuthenticatedUser,
  ): string | null {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (!user.boutiqueId) {
        throw new ForbiddenException(
          'Responsable boutique sans boutique rattachée.',
        );
      }
      if (boutiqueId && boutiqueId !== user.boutiqueId) {
        throw new ForbiddenException(
          'Commande hors du périmètre de votre boutique.',
        );
      }
      return user.boutiqueId;
    }
    return boutiqueId ?? null;
  }

  private scopeWhere(user: AuthenticatedUser): Prisma.CommandeAchatWhereInput {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE && user.boutiqueId) {
      return { boutiqueId: user.boutiqueId };
    }
    return {};
  }

  private assertLecture(commande: CommandeChargee, user: AuthenticatedUser) {
    if (user.role !== RoleLibelle.RESPONSABLE_BOUTIQUE) return;
    if (commande.boutiqueId && commande.boutiqueId !== user.boutiqueId) {
      throw new ForbiddenException(
        'Commande hors du périmètre de votre boutique.',
      );
    }
  }

  private assertEcriture(commande: CommandeChargee, user: AuthenticatedUser) {
    this.assertLecture(commande, user);
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (commande.boutiqueId !== user.boutiqueId) {
        throw new ForbiddenException(
          'Commande hors du périmètre de votre boutique.',
        );
      }
    }
  }

  private numero(prefix: string) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
  }

  private serialiser(c: CommandeChargee) {
    const lignes = c.lignes.map((l) => {
      const quantiteRecue = l.receptions.reduce((s, r) => s + r.quantite, 0);
      const montant = new Prisma.Decimal(l.prixUnitaire).mul(l.quantite);
      return {
        id: l.id,
        produitId: l.produitId,
        designation: l.produit.designation,
        reference: l.produit.reference,
        quantite: l.quantite,
        quantiteRecue,
        quantiteRestante: Math.max(0, l.quantite - quantiteRecue),
        prixUnitaire: l.prixUnitaire.toFixed(2),
        montant: montant.toFixed(2),
      };
    });
    const montant = lignes.reduce((s, l) => s + Number(l.montant), 0);
    const quantite = lignes.reduce((s, l) => s + l.quantite, 0);
    const quantiteRecue = lignes.reduce((s, l) => s + l.quantiteRecue, 0);
    return {
      id: c.id,
      numero: c.numero,
      fournisseurId: c.fournisseurId,
      fournisseur: c.fournisseur,
      statut: c.statut,
      notes: c.notes,
      dateCommande: c.dateCommande.toISOString(),
      dateConfirmation: c.dateConfirmation?.toISOString() ?? null,
      dateCloture: c.dateCloture?.toISOString() ?? null,
      initiateurId: c.initiateurId,
      initiateur: c.initiateur,
      boutiqueId: c.boutiqueId,
      boutique: c.boutique,
      montant: montant.toFixed(2),
      quantite,
      quantiteRecue,
      lignes,
    };
  }
}
