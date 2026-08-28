import {
  BadRequestException,
  ConflictException,
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
      lignesReceptionAchat: { select: { quantiteRecue: true } },
      cloturesCourtes: { select: { quantiteAnnulee: true } },
    },
  },
} as const;

const INCLUDE_RECEPTION_DETAIL = {
  produit: { select: { id: true, designation: true, reference: true } },
  entrepot: { select: { id: true, nom: true, code: true } },
  utilisateur: { select: { id: true, nom: true, prenom: true } },
  ligneFacture: {
    include: {
      facture: {
        select: { id: true, numero: true, statut: true, montant: true },
      },
    },
  },
} as const;

const INCLUDE_COMMANDE_DETAIL = {
  ...INCLUDE_COMMANDE,
  receptions: {
    include: INCLUDE_RECEPTION_DETAIL,
    orderBy: { dateReception: 'asc' as const },
  },
} as const;

type CommandeChargee = Prisma.CommandeAchatGetPayload<{
  include: typeof INCLUDE_COMMANDE;
}>;

type CommandeDetailChargee = Prisma.CommandeAchatGetPayload<{
  include: typeof INCLUDE_COMMANDE_DETAIL;
}>;

@Injectable()
export class CommandesAchatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly machine: AchatsStateMachineService,
  ) {}

  async creer(dto: CreateCommandeAchatDto, user: AuthenticatedUser) {
    if (dto.clientOperationId) {
      const replay = await this.prisma.commandeAchat.findUnique({
        where: { clientOperationId: dto.clientOperationId },
        include: INCLUDE_COMMANDE,
      });
      if (replay) {
        if (replay.initiateurId !== user.userId) {
          throw new ConflictException(
            'clientOperationId déjà utilisé par une autre opération.',
          );
        }
        return this.serialiser(replay);
      }
    }
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
    if (dto.societeId) {
      const societe = await this.prisma.societe.findUnique({
        where: { id: dto.societeId },
      });
      if (!societe) {
        throw new NotFoundException(`Société ${dto.societeId} introuvable.`);
      }
    }
    let societeId = dto.societeId;
    if (!societeId) {
      const societes = await this.prisma.societe.findMany({
        select: { id: true },
        take: 2,
      });
      if (societes.length === 1) {
        societeId = societes[0].id;
      }
    }
    const devise = (dto.devise ?? fournisseur.devise ?? 'XOF').toUpperCase();
    const tauxChange = dto.tauxChangeSnapshot ?? (devise === 'XOF' ? 1 : null);
    if (devise !== 'XOF' && !tauxChange) {
      throw new BadRequestException(
        'Un taux de change snapshot est obligatoire pour une devise étrangère.',
      );
    }
    this.assertEcheances(dto);

    try {
      const commande = await this.prisma.$transaction(async (tx) => {
        const numero = societeId
          ? await this.prochainNumero(tx, societeId, new Date())
          : this.numero('BC');
        const snapshot = this.snapshotDto(dto, devise, tauxChange);
        const created = await tx.commandeAchat.create({
          data: {
            numero,
            clientOperationId: dto.clientOperationId,
            societeId,
            fournisseurId: dto.fournisseurId,
            devise,
            tauxChangeSnapshot: tauxChange,
            incoterm: dto.incoterm,
            lieuOrigine: dto.lieuOrigine?.trim() || null,
            lieuDestination: dto.lieuDestination?.trim() || null,
            proformaReference: dto.proformaReference?.trim() || null,
            conditionsPaiement: dto.conditionsPaiement?.trim() || null,
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
            echeancesPaiement: dto.echeancesPaiement
              ? {
                  create: dto.echeancesPaiement.map((item) => ({
                    type: item.type,
                    ordre: item.ordre,
                    pourcentage: item.pourcentage,
                    montant: item.montant,
                    datePrevue: item.datePrevue
                      ? new Date(item.datePrevue)
                      : null,
                    conditions: item.conditions?.trim() || null,
                  })),
                }
              : undefined,
            versions: {
              create: {
                version: 1,
                snapshot,
                creeParId: user.userId,
                clientOperationId: dto.clientOperationId
                  ? `${dto.clientOperationId}:v1`
                  : undefined,
              },
            },
          },
          include: INCLUDE_COMMANDE,
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'COMMANDE_ACHAT_CREATED',
            entite: 'CommandeAchat',
            entiteId: created.id,
            details: JSON.stringify({
              numero: created.numero,
              fournisseurId: dto.fournisseurId,
              lignes: dto.lignes.length,
              devise,
              tauxChangeSnapshot: tauxChange,
            }),
          },
        });
        return created;
      });

      void produits;
      return this.serialiser(commande);
    } catch (error) {
      if (
        dto.clientOperationId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.commandeAchat.findUnique({
          where: { clientOperationId: dto.clientOperationId },
          include: INCLUDE_COMMANDE,
        });
        if (concurrent?.initiateurId === user.userId) {
          return this.serialiser(concurrent);
        }
      }
      throw error;
    }
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
    const commande = await this.chargerDetail(id);
    this.assertLecture(commande, user);
    return this.serialiserDetail(commande);
  }

  async getBonCommandePdfData(id: string, user: AuthenticatedUser) {
    const commande = await this.prisma.commandeAchat.findUnique({
      where: { id },
      include: {
        fournisseur: {
          select: {
            nom: true,
            contact: true,
            telephone: true,
            email: true,
            adresse: true,
            identifiantFiscal: true,
          },
        },
        boutique: { select: { id: true, nom: true } },
        lignes: {
          include: {
            produit: {
              select: { designation: true, reference: true },
            },
            receptions: { select: { quantite: true } },
            lignesReceptionAchat: { select: { quantiteRecue: true } },
            cloturesCourtes: { select: { quantiteAnnulee: true } },
          },
        },
      },
    });
    if (!commande) {
      throw new NotFoundException(`Commande ${id} introuvable.`);
    }
    this.assertLecture(commande, user);

    const lignes = commande.lignes.map((l) => {
      const montant = new Prisma.Decimal(l.prixUnitaire).mul(l.quantite);
      return {
        designation: l.produit.designation,
        reference: l.produit.reference,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire.toFixed(2),
        montant: montant.toFixed(2),
      };
    });
    const montantTotal = lignes
      .reduce((s, l) => s.plus(l.montant), new Prisma.Decimal(0))
      .toFixed(2);

    const societe = commande.societeId
      ? await this.prisma.societe.findUnique({
          where: { id: commande.societeId },
          select: {
            raisonSociale: true,
            adresse: true,
            telephone: true,
            email: true,
          },
        })
      : await this.prisma.societe.findFirst({
          select: {
            raisonSociale: true,
            adresse: true,
            telephone: true,
            email: true,
          },
        });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'COMMANDE_ACHAT_PDF',
      entite: 'CommandeAchat',
      entiteId: id,
      details: JSON.stringify({
        numero: commande.numero,
        proforma: Boolean(commande.proformaReference),
      }),
    });

    return {
      numero: commande.numero,
      statut: commande.statut,
      devise: commande.devise,
      proformaReference: commande.proformaReference,
      dateCommande: commande.dateCommande,
      dateConfirmation: commande.dateConfirmation,
      dateSoumission: commande.dateSoumission,
      dateApprobation: commande.dateApprobation,
      notes: commande.notes,
      conditionsPaiement: commande.conditionsPaiement,
      montantTotal,
      fournisseur: commande.fournisseur,
      lignes,
      societe,
      imprimeAt: new Date(),
    };
  }

  async confirmer(id: string, user: AuthenticatedUser) {
    const commande = await this.charger(id);
    this.assertEcriture(commande, user);
    if (
      (commande.societeId || commande.clientOperationId) &&
      commande.statut !== StatutCommandeAchat.APPROUVEE
    ) {
      throw new BadRequestException(
        'Une commande P2P versionnée doit être approuvée avant confirmation.',
      );
    }
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

  private async chargerDetail(id: string): Promise<CommandeDetailChargee> {
    const commande = await this.prisma.commandeAchat.findUnique({
      where: { id },
      include: INCLUDE_COMMANDE_DETAIL,
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

  private assertLecture(
    commande: { boutiqueId: string | null },
    user: AuthenticatedUser,
  ) {
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

  private async prochainNumero(
    tx: Prisma.TransactionClient,
    societeId: string,
    date: Date,
  ) {
    const exercice = date.getUTCFullYear();
    const rows = await tx.$queryRaw<Array<{ valeur: number }>>(Prisma.sql`
      INSERT INTO "sequence_document_achat"
        ("id", "societeId", "exercice", "typeDocument", "prochaineValeur")
      VALUES
        (gen_random_uuid()::text, ${societeId}, ${exercice}, 'BC', 2)
      ON CONFLICT ("societeId", "exercice", "typeDocument")
      DO UPDATE SET "prochaineValeur" = "sequence_document_achat"."prochaineValeur" + 1
      RETURNING "prochaineValeur" - 1 AS "valeur"
    `);
    const valeur = Number(rows[0]?.valeur);
    return `BC-${exercice}-${societeId.slice(0, 6).toUpperCase()}-${String(valeur).padStart(6, '0')}`;
  }

  private assertEcheances(dto: CreateCommandeAchatDto) {
    const echeances = dto.echeancesPaiement ?? [];
    if (!echeances.length) return;
    const ordres = new Set(echeances.map((item) => item.ordre));
    if (ordres.size !== echeances.length) {
      throw new BadRequestException(
        'Les ordres des échéances de paiement doivent être uniques.',
      );
    }
    const totalPourcentage = echeances.reduce(
      (sum, item) => sum + (item.pourcentage ?? 0),
      0,
    );
    if (
      echeances.every((item) => item.pourcentage !== undefined) &&
      Math.abs(totalPourcentage - 100) > 0.0001
    ) {
      throw new BadRequestException(
        'Les pourcentages des échéances doivent totaliser 100.',
      );
    }
  }

  private snapshotDto(
    dto: CreateCommandeAchatDto,
    devise: string,
    tauxChange: number | null,
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify({
        fournisseurId: dto.fournisseurId,
        societeId: dto.societeId ?? null,
        devise,
        tauxChangeSnapshot: tauxChange,
        incoterm: dto.incoterm ?? null,
        lieuOrigine: dto.lieuOrigine ?? null,
        lieuDestination: dto.lieuDestination ?? null,
        proformaReference: dto.proformaReference ?? null,
        conditionsPaiement: dto.conditionsPaiement ?? null,
        notes: dto.notes ?? null,
        lignes: dto.lignes,
        echeancesPaiement: dto.echeancesPaiement ?? [],
      }),
    ) as Prisma.InputJsonValue;
  }

  private serialiser(c: CommandeChargee) {
    const lignes = c.lignes.map((l) => {
      const quantiteRecue =
        l.receptions.reduce((s, r) => s + r.quantite, 0) +
        l.lignesReceptionAchat.reduce((s, r) => s + r.quantiteRecue, 0);
      const quantiteCloturee = l.cloturesCourtes.reduce(
        (s, item) => s + item.quantiteAnnulee,
        0,
      );
      const montant = new Prisma.Decimal(l.prixUnitaire).mul(l.quantite);
      return {
        id: l.id,
        produitId: l.produitId,
        designation: l.produit.designation,
        reference: l.produit.reference,
        quantite: l.quantite,
        quantiteRecue,
        quantiteCloturee,
        quantiteRestante: Math.max(
          0,
          l.quantite - quantiteRecue - quantiteCloturee,
        ),
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
      devise: c.devise,
      tauxChangeSnapshot: c.tauxChangeSnapshot?.toFixed(6) ?? null,
      incoterm: c.incoterm,
      lieuOrigine: c.lieuOrigine,
      lieuDestination: c.lieuDestination,
      proformaReference: c.proformaReference,
      conditionsPaiement: c.conditionsPaiement,
      versionCourante: c.versionCourante,
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

  private serialiserDetail(c: CommandeDetailChargee) {
    const base = this.serialiser(c);
    const receptions = c.receptions.map((r) => ({
      id: r.id,
      produitId: r.produitId,
      quantite: r.quantite,
      prixAchat: r.prixAchat.toFixed(2),
      montant: r.prixAchat.mul(r.quantite).toFixed(2),
      dateReception: r.dateReception.toISOString(),
      reference: r.reference,
      ligneCommandeId: r.ligneCommandeId,
      produit: r.produit,
      entrepot: r.entrepot,
      utilisateur: r.utilisateur,
      facture: r.ligneFacture
        ? {
            id: r.ligneFacture.facture.id,
            numero: r.ligneFacture.facture.numero,
            statut: r.ligneFacture.facture.statut,
            montant: r.ligneFacture.facture.montant.toFixed(2),
          }
        : null,
    }));
    const facturesMap = new Map<
      string,
      { id: string; numero: string; statut: string; montant: string }
    >();
    for (const r of receptions) {
      if (r.facture) facturesMap.set(r.facture.id, r.facture);
    }
    return {
      ...base,
      receptions,
      factures: [...facturesMap.values()],
    };
  }
}
