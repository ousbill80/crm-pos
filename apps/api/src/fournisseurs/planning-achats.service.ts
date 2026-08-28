import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StatutDemandeAchat as PrismaStatutDemandeAchat,
  TypeMouvementBudgetAchat,
} from '@prisma/client';
import { RoleLibelle, StatutDemandeAchat } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import { resolveZoneScopeForSuperviseur } from '../boutiques/boutique-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { AchatsStateMachineService } from './achats-state-machine.service';
import {
  CreateDemandeAchatDto,
  DecisionDemandeAchatDto,
  UpdateDemandeAchatDto,
} from './dto/planning-achat.dto';
import {
  ActiveBudgetListQueryDto,
  CostCentreListQueryDto,
} from './dto/p2p-list.dto';

const INCLUDE_DEMANDE = {
  initiateur: { select: { id: true, nom: true, prenom: true } },
  approbateur: { select: { id: true, nom: true, prenom: true } },
  boutique: { select: { id: true, nom: true, zoneId: true } },
  centreCout: {
    select: { id: true, code: true, libelle: true, societeId: true },
  },
  budget: {
    select: {
      id: true,
      libelle: true,
      devise: true,
      montantAlloue: true,
      dateDebut: true,
      dateFin: true,
      actif: true,
    },
  },
  lignes: {
    include: {
      produit: { select: { id: true, designation: true, reference: true } },
    },
  },
  consultations: {
    select: { id: true, numero: true, statut: true, dateCreation: true },
  },
} as const;

type DemandeChargee = Prisma.DemandeAchatGetPayload<{
  include: typeof INCLUDE_DEMANDE;
}>;

@Injectable()
export class PlanningAchatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: AchatsStateMachineService,
  ) {}

  async creer(dto: CreateDemandeAchatDto, user: AuthenticatedUser) {
    const replay = await this.prisma.demandeAchat.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: INCLUDE_DEMANDE,
    });
    if (replay) {
      if (replay.initiateurId !== user.userId) {
        throw new ConflictException(
          'clientOperationId déjà utilisé par une autre opération.',
        );
      }
      return this.serialiser(replay);
    }

    const boutiqueId = this.resolveBoutiqueCreation(dto.boutiqueId, user);
    await this.validerReferences(
      dto.centreCoutId,
      dto.budgetId,
      boutiqueId,
      dto.devise,
      dto.lignes.map((ligne) => ligne.produitId).filter(Boolean) as string[],
    );
    const montantEstime = this.calculerMontant(dto.lignes);

    try {
      const demande = await this.prisma.$transaction(async (tx) => {
        const created = await tx.demandeAchat.create({
          data: {
            numero: this.numero('DA'),
            clientOperationId: dto.clientOperationId,
            objet: dto.objet.trim(),
            justification: dto.justification?.trim() || null,
            montantEstime,
            devise: dto.devise.toUpperCase(),
            initiateurId: user.userId,
            boutiqueId,
            centreCoutId: dto.centreCoutId,
            budgetId: dto.budgetId,
            lignes: {
              create: dto.lignes.map((ligne) => ({
                produitId: ligne.produitId,
                designation: ligne.designation.trim(),
                quantite: ligne.quantite,
                prixEstime: ligne.prixEstime,
                dateBesoin: ligne.dateBesoin
                  ? new Date(ligne.dateBesoin)
                  : null,
              })),
            },
          },
          include: INCLUDE_DEMANDE,
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'DEMANDE_ACHAT_CREATED',
            entite: 'DemandeAchat',
            entiteId: created.id,
            details: JSON.stringify({
              numero: created.numero,
              clientOperationId: dto.clientOperationId,
            }),
          },
        });
        return created;
      });
      return this.serialiser(demande);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.demandeAchat.findUnique({
          where: { clientOperationId: dto.clientOperationId },
          include: INCLUDE_DEMANDE,
        });
        if (concurrent?.initiateurId === user.userId) {
          return this.serialiser(concurrent);
        }
      }
      throw error;
    }
  }

  async lister(user: AuthenticatedUser) {
    const where = await this.scopeWhere(user);
    const demandes = await this.prisma.demandeAchat.findMany({
      where,
      include: INCLUDE_DEMANDE,
      orderBy: { dateCreation: 'desc' },
    });
    return demandes.map((demande) => this.serialiser(demande));
  }

  async listerCentresCout(
    query: CostCentreListQueryDto,
    user: AuthenticatedUser,
  ) {
    const scope = await this.centreCoutScope(user);
    return this.prisma.centreCout.findMany({
      where: {
        ...scope,
        ...(query.societeId ? { societeId: query.societeId } : {}),
        actif: query.actif ?? true,
      },
      select: {
        id: true,
        societeId: true,
        code: true,
        libelle: true,
        actif: true,
        boutiqueId: true,
        boutique: { select: { id: true, nom: true, zoneId: true } },
      },
      orderBy: [{ societeId: 'asc' }, { code: 'asc' }],
    });
  }

  async listerBudgetsActifs(
    query: ActiveBudgetListQueryDto,
    user: AuthenticatedUser,
  ) {
    const scope = await this.centreCoutScope(user);
    const activeAt = new Date(query.activeAt ?? Date.now());
    const budgets = await this.prisma.budgetAchat.findMany({
      where: {
        actif: true,
        dateDebut: { lte: activeAt },
        dateFin: { gte: activeAt },
        ...(query.centreCoutId ? { centreCoutId: query.centreCoutId } : {}),
        ...(query.devise ? { devise: query.devise.toUpperCase() } : {}),
        centreCout: {
          ...scope,
          ...(query.societeId ? { societeId: query.societeId } : {}),
        },
      },
      include: {
        centreCout: {
          select: {
            id: true,
            code: true,
            libelle: true,
            societeId: true,
            boutiqueId: true,
          },
        },
        mouvements: { select: { type: true, montant: true } },
      },
      orderBy: [{ dateFin: 'asc' }, { libelle: 'asc' }],
    });
    return budgets.map((budget) => {
      const engage = budget.mouvements.reduce(
        (sum, mouvement) =>
          mouvement.type === TypeMouvementBudgetAchat.ENGAGEMENT
            ? sum.plus(mouvement.montant)
            : sum.minus(mouvement.montant),
        new Prisma.Decimal(0),
      );
      return {
        id: budget.id,
        centreCoutId: budget.centreCoutId,
        centreCout: budget.centreCout,
        libelle: budget.libelle,
        devise: budget.devise,
        montantAlloue: budget.montantAlloue.toFixed(2),
        montantEngage: engage.toFixed(2),
        montantDisponible: budget.montantAlloue.minus(engage).toFixed(2),
        dateDebut: budget.dateDebut.toISOString(),
        dateFin: budget.dateFin.toISOString(),
        actif: budget.actif,
      };
    });
  }

  async detail(id: string, user: AuthenticatedUser) {
    return this.serialiser(await this.chargerDansPerimetre(id, user));
  }

  async modifier(
    id: string,
    dto: UpdateDemandeAchatDto,
    user: AuthenticatedUser,
  ) {
    const demande = await this.chargerDansPerimetre(id, user);
    this.assertProprietaireOuAchats(demande, user);
    if (demande.statut !== PrismaStatutDemandeAchat.BROUILLON) {
      throw new BadRequestException(
        'Seule une demande BROUILLON peut être modifiée.',
      );
    }

    const boutiqueId = this.resolveBoutiqueCreation(
      dto.boutiqueId ?? demande.boutiqueId ?? undefined,
      user,
    );
    const centreCoutId = dto.centreCoutId ?? demande.centreCoutId;
    const budgetId = dto.budgetId ?? demande.budgetId;
    if (!centreCoutId || !budgetId) {
      throw new BadRequestException(
        'Centre de coût et enveloppe budgétaire obligatoires.',
      );
    }
    const devise = (dto.devise ?? demande.devise).toUpperCase();
    const lignes = dto.lignes ?? demande.lignes;
    await this.validerReferences(
      centreCoutId,
      budgetId,
      boutiqueId,
      devise,
      lignes
        .map((ligne: { produitId?: string | null }) => ligne.produitId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    const montantEstime = this.calculerMontant(lignes);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.lignes) {
        await tx.ligneDemandeAchat.deleteMany({ where: { demandeId: id } });
      }
      const result = await tx.demandeAchat.update({
        where: { id },
        data: {
          objet: dto.objet?.trim(),
          justification:
            dto.justification === undefined
              ? undefined
              : dto.justification.trim() || null,
          boutiqueId,
          centreCoutId,
          budgetId,
          devise,
          montantEstime,
          ...(dto.lignes
            ? {
                lignes: {
                  create: dto.lignes.map((ligne) => ({
                    produitId: ligne.produitId,
                    designation: ligne.designation.trim(),
                    quantite: ligne.quantite,
                    prixEstime: ligne.prixEstime,
                    dateBesoin: ligne.dateBesoin
                      ? new Date(ligne.dateBesoin)
                      : null,
                  })),
                },
              }
            : {}),
        },
        include: INCLUDE_DEMANDE,
      });
      await tx.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action: 'DEMANDE_ACHAT_UPDATED',
          entite: 'DemandeAchat',
          entiteId: id,
        },
      });
      return result;
    });
    return this.serialiser(updated);
  }

  async soumettre(id: string, user: AuthenticatedUser) {
    const demande = await this.chargerDansPerimetre(id, user);
    this.assertProprietaireOuAchats(demande, user);
    this.machine.assertDemande(demande.statut, StatutDemandeAchat.SOUMISE);
    const montant = this.exigerMontant(demande);
    await this.assertBudgetDisponible(demande, montant);
    const updated = await this.transitionSimple(
      demande,
      PrismaStatutDemandeAchat.SOUMISE,
      user,
      'DEMANDE_ACHAT_SOUMISE',
      { dateSoumission: new Date() },
    );
    return this.serialiser(updated);
  }

  async approuver(id: string, user: AuthenticatedUser) {
    const demande = await this.chargerDansPerimetre(id, user);
    this.machine.assertDemande(demande.statut, StatutDemandeAchat.APPROUVEE);
    if (demande.initiateurId === user.userId) {
      throw new ForbiddenException(
        'Séparation des tâches : approbation de sa propre demande interdite.',
      );
    }
    const montant = this.exigerMontant(demande);
    await this.assertRegleApprobation(demande, montant, user);
    if (!demande.budgetId || !demande.budget) {
      throw new BadRequestException('Enveloppe budgétaire absente.');
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const mouvements = await tx.mouvementBudgetAchat.findMany({
          where: { budgetId: demande.budgetId! },
          select: { type: true, montant: true },
        });
        const disponible = this.disponibleBudget(
          demande.budget!.montantAlloue,
          mouvements,
        );
        if (disponible.lessThan(montant)) {
          throw new BadRequestException(
            `Budget insuffisant : disponible ${disponible.toFixed(2)} ${demande.devise}, demandé ${montant.toFixed(2)} ${demande.devise}.`,
          );
        }
        await tx.mouvementBudgetAchat.create({
          data: {
            budgetId: demande.budgetId!,
            demandeId: demande.id,
            type: TypeMouvementBudgetAchat.ENGAGEMENT,
            montant,
            utilisateurId: user.userId,
          },
        });
        const result = await tx.demandeAchat.update({
          where: { id: demande.id },
          data: {
            statut: PrismaStatutDemandeAchat.APPROUVEE,
            approbateurId: user.userId,
            dateDecision: new Date(),
            motifDecision: null,
          },
          include: INCLUDE_DEMANDE,
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'DEMANDE_ACHAT_APPROUVEE',
            entite: 'DemandeAchat',
            entiteId: demande.id,
            details: JSON.stringify({
              montant: montant.toFixed(2),
              budgetId: demande.budgetId,
            }),
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.serialiser(updated);
  }

  async rejeter(
    id: string,
    dto: DecisionDemandeAchatDto,
    user: AuthenticatedUser,
  ) {
    const demande = await this.chargerDansPerimetre(id, user);
    this.machine.assertDemande(demande.statut, StatutDemandeAchat.REJETEE);
    const motif = dto.motif?.trim();
    if (!motif) {
      throw new BadRequestException('Le motif de rejet est obligatoire.');
    }
    await this.assertRegleApprobation(
      demande,
      this.exigerMontant(demande),
      user,
    );
    const updated = await this.transitionSimple(
      demande,
      PrismaStatutDemandeAchat.REJETEE,
      user,
      'DEMANDE_ACHAT_REJETEE',
      {
        approbateur: { connect: { id: user.userId } },
        dateDecision: new Date(),
        motifDecision: motif,
      },
    );
    return this.serialiser(updated);
  }

  async annuler(
    id: string,
    dto: DecisionDemandeAchatDto,
    user: AuthenticatedUser,
  ) {
    const demande = await this.chargerDansPerimetre(id, user);
    this.assertProprietaireOuAchats(demande, user);
    this.machine.assertDemande(demande.statut, StatutDemandeAchat.ANNULEE);
    const montant = demande.montantEstime;
    const updated = await this.prisma.$transaction(
      async (tx) => {
        if (
          demande.statut === PrismaStatutDemandeAchat.APPROUVEE &&
          demande.budgetId &&
          montant
        ) {
          await tx.mouvementBudgetAchat.create({
            data: {
              budgetId: demande.budgetId,
              demandeId: demande.id,
              type: TypeMouvementBudgetAchat.LIBERATION,
              montant,
              utilisateurId: user.userId,
              motif: dto.motif?.trim() || 'Annulation de la demande',
            },
          });
        }
        const result = await tx.demandeAchat.update({
          where: { id },
          data: {
            statut: PrismaStatutDemandeAchat.ANNULEE,
            motifDecision: dto.motif?.trim() || null,
          },
          include: INCLUDE_DEMANDE,
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'DEMANDE_ACHAT_ANNULEE',
            entite: 'DemandeAchat',
            entiteId: id,
            details: dto.motif?.trim() || undefined,
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.serialiser(updated);
  }

  private async transitionSimple(
    demande: DemandeChargee,
    statut: PrismaStatutDemandeAchat,
    user: AuthenticatedUser,
    action: string,
    data: Prisma.DemandeAchatUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.demandeAchat.update({
        where: { id: demande.id },
        data: { ...data, statut },
        include: INCLUDE_DEMANDE,
      });
      await tx.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action,
          entite: 'DemandeAchat',
          entiteId: demande.id,
        },
      });
      return updated;
    });
  }

  private async chargerDansPerimetre(id: string, user: AuthenticatedUser) {
    const demande = await this.prisma.demandeAchat.findUnique({
      where: { id },
      include: INCLUDE_DEMANDE,
    });
    if (!demande) {
      throw new NotFoundException(`Demande ${id} introuvable.`);
    }
    const scope = await this.scopeWhere(user);
    if (
      scope.boutiqueId &&
      demande.boutiqueId !== (scope.boutiqueId as { equals?: string } | string)
    ) {
      throw new ForbiddenException('Demande hors de votre périmètre.');
    }
    if (
      scope.boutique &&
      demande.boutique?.zoneId !== (scope.boutique as { zoneId: string }).zoneId
    ) {
      throw new ForbiddenException('Demande hors de votre zone.');
    }
    return demande;
  }

  private async scopeWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.DemandeAchatWhereInput> {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (!user.boutiqueId) {
        throw new ForbiddenException('Responsable sans boutique rattachée.');
      }
      return { boutiqueId: user.boutiqueId };
    }
    if (user.role === RoleLibelle.SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return { boutique: { zoneId } };
    }
    return {};
  }

  private async centreCoutScope(
    user: AuthenticatedUser,
  ): Promise<Prisma.CentreCoutWhereInput> {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (!user.boutiqueId) {
        throw new ForbiddenException('Responsable sans boutique rattachée.');
      }
      return { boutiqueId: user.boutiqueId };
    }
    if (user.role === RoleLibelle.SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return { boutique: { zoneId } };
    }
    return {};
  }

  private resolveBoutiqueCreation(
    boutiqueId: string | undefined,
    user: AuthenticatedUser,
  ) {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (!user.boutiqueId || (boutiqueId && boutiqueId !== user.boutiqueId)) {
        throw new ForbiddenException(
          'Création hors du périmètre de votre boutique.',
        );
      }
      return user.boutiqueId;
    }
    return boutiqueId ?? null;
  }

  private assertProprietaireOuAchats(
    demande: DemandeChargee,
    user: AuthenticatedUser,
  ) {
    if (
      user.role === RoleLibelle.RESPONSABLE_BOUTIQUE &&
      demande.initiateurId !== user.userId
    ) {
      throw new ForbiddenException(
        'Seul l’initiateur peut modifier cette demande boutique.',
      );
    }
  }

  private async validerReferences(
    centreCoutId: string,
    budgetId: string,
    boutiqueId: string | null,
    devise: string,
    produitIds: string[],
  ) {
    const [centre, budget, produits] = await Promise.all([
      this.prisma.centreCout.findUnique({ where: { id: centreCoutId } }),
      this.prisma.budgetAchat.findUnique({ where: { id: budgetId } }),
      this.prisma.produit.findMany({
        where: { id: { in: [...new Set(produitIds)] }, actif: true },
        select: { id: true },
      }),
    ]);
    if (!centre?.actif) {
      throw new BadRequestException('Centre de coût absent ou inactif.');
    }
    if (
      !budget?.actif ||
      budget.centreCoutId !== centreCoutId ||
      budget.devise !== devise.toUpperCase()
    ) {
      throw new BadRequestException(
        'Enveloppe budgétaire inactive ou incohérente avec le centre et la devise.',
      );
    }
    if (centre.boutiqueId && centre.boutiqueId !== boutiqueId) {
      throw new ForbiddenException(
        'Centre de coût hors du périmètre de la boutique.',
      );
    }
    if (produits.length !== new Set(produitIds).size) {
      throw new BadRequestException('Produit absent ou inactif.');
    }
  }

  private calculerMontant(
    lignes: Array<{
      quantite: number;
      prixEstime?: number | Prisma.Decimal | null;
    }>,
  ): Prisma.Decimal | null {
    if (lignes.some((ligne) => ligne.prixEstime == null)) return null;
    return lignes.reduce(
      (total, ligne) =>
        total.plus(new Prisma.Decimal(ligne.prixEstime!).mul(ligne.quantite)),
      new Prisma.Decimal(0),
    );
  }

  private exigerMontant(demande: DemandeChargee) {
    if (!demande.montantEstime || demande.lignes.some((l) => !l.prixEstime)) {
      throw new BadRequestException(
        'Toutes les lignes doivent avoir un prix estimé avant soumission.',
      );
    }
    return demande.montantEstime;
  }

  private async assertBudgetDisponible(
    demande: DemandeChargee,
    montant: Prisma.Decimal,
  ) {
    if (!demande.budgetId || !demande.budget) {
      throw new BadRequestException('Enveloppe budgétaire absente.');
    }
    const now = new Date();
    if (
      !demande.budget.actif ||
      demande.budget.devise !== demande.devise ||
      demande.budget.dateDebut > now ||
      demande.budget.dateFin < now
    ) {
      throw new BadRequestException(
        'Enveloppe budgétaire inactive, expirée ou de devise incompatible.',
      );
    }
    const mouvements = await this.prisma.mouvementBudgetAchat.findMany({
      where: { budgetId: demande.budgetId },
      select: { type: true, montant: true },
    });
    const disponible = this.disponibleBudget(
      demande.budget.montantAlloue,
      mouvements,
    );
    if (disponible.lessThan(montant)) {
      throw new BadRequestException(
        `Budget insuffisant : disponible ${disponible.toFixed(2)} ${demande.devise}, demandé ${montant.toFixed(2)} ${demande.devise}.`,
      );
    }
  }

  private disponibleBudget(
    alloue: Prisma.Decimal,
    mouvements: Array<{
      type: TypeMouvementBudgetAchat;
      montant: Prisma.Decimal;
    }>,
  ) {
    return mouvements.reduce(
      (disponible, mouvement) =>
        mouvement.type === TypeMouvementBudgetAchat.ENGAGEMENT
          ? disponible.minus(mouvement.montant)
          : disponible.plus(mouvement.montant),
      new Prisma.Decimal(alloue),
    );
  }

  private async assertRegleApprobation(
    demande: DemandeChargee,
    montant: Prisma.Decimal,
    user: AuthenticatedUser,
  ) {
    if (!demande.centreCout) {
      throw new BadRequestException('Centre de coût absent.');
    }
    const now = new Date();
    const regles = await this.prisma.regleApprobationAchat.findMany({
      where: {
        societeId: demande.centreCout.societeId,
        devise: demande.devise,
        actif: true,
        valideDu: { lte: now },
        OR: [{ valideAu: null }, { valideAu: { gte: now } }],
        montantMin: { lte: montant },
        AND: [
          {
            OR: [{ montantMax: null }, { montantMax: { gte: montant } }],
          },
        ],
      },
      include: { role: { select: { libelle: true } } },
      orderBy: { niveau: 'asc' },
    });
    if (regles.length === 0) {
      throw new BadRequestException(
        'Aucune règle d’approbation configurée pour ce montant et cette devise.',
      );
    }
    if (!regles.some((regle) => regle.role.libelle === user.role)) {
      throw new ForbiddenException(
        `Le rôle ${user.role} ne correspond pas à la règle d’approbation applicable.`,
      );
    }
  }

  private serialiser(demande: DemandeChargee) {
    return {
      ...demande,
      montantEstime: demande.montantEstime?.toFixed(2) ?? null,
      dateCreation: demande.dateCreation.toISOString(),
      dateSoumission: demande.dateSoumission?.toISOString() ?? null,
      dateDecision: demande.dateDecision?.toISOString() ?? null,
      budget: demande.budget
        ? {
            ...demande.budget,
            montantAlloue: demande.budget.montantAlloue.toFixed(2),
          }
        : null,
      lignes: demande.lignes.map((ligne) => ({
        ...ligne,
        prixEstime: ligne.prixEstime?.toFixed(2) ?? null,
      })),
    };
  }

  private numero(prefix: string) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
