import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TransactionCaisse,
  TypeCaisse as PrismaTypeCaisse,
} from '@prisma/client';
import {
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
  RoleLibelle,
  ROLES_VALIDATION_CAISSE_CENTRALE,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
  SEUIL_VALIDATION_DG_DEFAUT,
} from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { TransactionStateMachineService } from './transaction-state-machine.service';
import { TransactionsGateway } from './transactions.gateway';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { RapprocherTransactionDto } from './dto/rapprocher-transaction.dto';
import { RegulariserTransactionDto } from './dto/regulariser-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

type TxClient = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  bordereau: { include: { reception: true } },
  caisse: { include: { boutique: { select: { id: true, nom: true } } } },
  contreparties: true,
} as const;

// Orchestre le cycle de vie d'une TransactionCaisse (§6.4). Toute évolution
// de statut passe par TransactionStateMachineService (objet de domaine
// unique — pas de logique de transition dupliquée ici) et génère une
// entrée d'audit horodatée (§6.7). Le solde de caisse (Caisse.soldeCourant)
// n'est jamais écrit par ce module : c'est une colonne de cache recalculée
// par le module Caisses à partir du grand livre append-only.
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: TransactionStateMachineService,
    private readonly gateway: TransactionsGateway,
  ) {}

  // INITIEE — SORTIE_FONDS depuis caisse MAGASIN uniquement (§6.4).
  async initier(
    dto: CreateTransactionDto,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    if (dto.clientOperationId) {
      const existante = await this.prisma.transactionCaisse.findUnique({
        where: { clientOperationId: dto.clientOperationId },
      });
      if (existante) {
        return existante;
      }
    }

    const caisse = await this.prisma.caisse.findUnique({
      where: { id: dto.caisseId },
    });

    if (!caisse) {
      throw new NotFoundException('Caisse introuvable.');
    }

    if (caisse.type !== TypeCaisse.MAGASIN) {
      throw new BadRequestException(
        'Une SORTIE_FONDS (§6.4) ne peut être initiée que depuis la caisse MAGASIN.',
      );
    }

    if (dto.type !== TypeTransaction.SORTIE_FONDS) {
      throw new BadRequestException(
        'Seule une SORTIE_FONDS peut être initiée via cet endpoint.',
      );
    }

    if (
      utilisateur.boutiqueId &&
      caisse.boutiqueId !== utilisateur.boutiqueId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez initier une transaction que depuis une caisse de votre propre boutique.',
      );
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const creee = await tx.transactionCaisse.create({
        data: {
          type: TypeTransaction.SORTIE_FONDS,
          montant: dto.montant,
          statut: StatutTransaction.INITIEE,
          caisseId: dto.caisseId,
          initiateurId: utilisateur.userId,
          clientOperationId: dto.clientOperationId,
        },
      });

      await tx.bordereauVersement.create({
        data: {
          transactionId: creee.id,
          montantDeclare: dto.montant,
          pieceJointe: dto.pieceJointe,
        },
      });

      return creee;
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_INITIEE',
      entite: 'TransactionCaisse',
      entiteId: transaction.id,
      details: JSON.stringify({
        type: dto.type,
        montant: dto.montant,
        caisseId: dto.caisseId,
        clientOperationId: dto.clientOperationId,
      }),
    });

    await this.broadcastStatut(transaction);
    return transaction;
  }

  /**
   * Transfert tiroir ↔ magasin (hors §6.4 convoyeur).
   * Source = caisse qui sort les fonds ; destination = caisse qui les reçoit.
   * Si statut VALIDEE : écriture miroir immédiate sur la destination.
   */
  async creerTransfertInterne(params: {
    caisseSourceId: string;
    caisseDestinationId: string;
    montant: Prisma.Decimal | number;
    initiateurId: string;
    statut: typeof StatutTransaction.VALIDEE | typeof StatutTransaction.LITIGE;
    clientOperationId?: string;
  }): Promise<TransactionCaisse> {
    const montant = new Prisma.Decimal(params.montant);
    if (montant.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Le montant du transfert interne doit être strictement positif.',
      );
    }

    const [source, dest] = await Promise.all([
      this.prisma.caisse.findUnique({ where: { id: params.caisseSourceId } }),
      this.prisma.caisse.findUnique({
        where: { id: params.caisseDestinationId },
      }),
    ]);
    if (!source || !dest) {
      throw new NotFoundException('Caisse source ou destination introuvable.');
    }
    if (source.boutiqueId !== dest.boutiqueId || !source.boutiqueId) {
      throw new BadRequestException(
        'Un transfert interne doit rester dans la même boutique.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const txSource = await tx.transactionCaisse.create({
        data: {
          type: TypeTransaction.TRANSFERT_INTERNE,
          montant,
          statut: params.statut,
          caisseId: source.id,
          initiateurId: params.initiateurId,
          clientOperationId: params.clientOperationId,
        },
      });

      if (params.statut === StatutTransaction.VALIDEE) {
        await this.creerContrepartieTransfert(tx, txSource, dest.id, montant);
      }

      return txSource;
    });

    await this.audit.record({
      utilisateurId: params.initiateurId,
      action: 'TRANSFERT_INTERNE_CREE',
      entite: 'TransactionCaisse',
      entiteId: created.id,
      details: JSON.stringify({
        caisseSourceId: source.id,
        caisseDestinationId: dest.id,
        montant: montant.toString(),
        statut: params.statut,
      }),
    });

    await this.broadcastStatut(created);
    return created;
  }

  /** Crédit tiroir : encaissement ESPECES reconnu au grand livre (VALIDEE). */
  async enregistrerEncaissementTiroir(params: {
    caisseTiroirId: string;
    montant: Prisma.Decimal | number;
    initiateurId: string;
  }): Promise<TransactionCaisse | null> {
    const montant = new Prisma.Decimal(params.montant);
    if (montant.lessThanOrEqualTo(0)) {
      return null;
    }
    const caisse = await this.prisma.caisse.findUnique({
      where: { id: params.caisseTiroirId },
    });
    if (!caisse || caisse.type !== TypeCaisse.TIROIR) {
      throw new BadRequestException(
        'Encaissement ledger réservé à une caisse TIROIR.',
      );
    }

    return this.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisse.id,
        initiateurId: params.initiateurId,
      },
    });
  }

  async passerEnTransit(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.trouverOuEchouer(id);
    this.verifierPerimetreBoutique(transaction, utilisateur);

    this.stateMachine.assertTransitionAutorisee(
      transaction.statut,
      StatutTransaction.EN_TRANSIT,
    );

    const misAJour = await this.prisma.transactionCaisse.update({
      where: { id },
      data: { statut: StatutTransaction.EN_TRANSIT },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_EN_TRANSIT',
      entite: 'TransactionCaisse',
      entiteId: id,
    });

    await this.broadcastStatut(misAJour);
    return misAJour;
  }

  async receptionner(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.trouverOuEchouer(id);

    this.stateMachine.assertTransitionAutorisee(
      transaction.statut,
      StatutTransaction.RECEPTIONNEE,
    );

    const misAJour = await this.prisma.transactionCaisse.update({
      where: { id },
      data: { statut: StatutTransaction.RECEPTIONNEE },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_RECEPTIONNEE',
      entite: 'TransactionCaisse',
      entiteId: id,
    });

    await this.broadcastStatut(misAJour);
    return misAJour;
  }

  // VALIDEE ou LITIGE — Caissier Central / DAF (§6.4), Direction Générale
  // uniquement si montant ≥ seuil exceptionnel (§4).
  async rapprocher(
    id: string,
    dto: RapprocherTransactionDto,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.prisma.transactionCaisse.findUnique({
      where: { id },
      include: { bordereau: { include: { reception: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable.');
    }

    if (!transaction.bordereau) {
      throw new BadRequestException(
        'Aucun bordereau de versement associé à cette transaction.',
      );
    }

    if (transaction.bordereau.reception) {
      throw new BadRequestException(
        'Cette transaction a déjà fait l’objet d’un rapprochement.',
      );
    }

    const montantDeclare = new Prisma.Decimal(
      transaction.bordereau.montantDeclare,
    );
    const montantRecu = new Prisma.Decimal(dto.montantRecu);
    const ecart = montantRecu.minus(montantDeclare);
    const statutFinal = ecart.isZero()
      ? StatutTransaction.VALIDEE
      : StatutTransaction.LITIGE;

    this.stateMachine.assertTransitionAutorisee(
      transaction.statut,
      statutFinal,
    );

    await this.assertHabilitationRapprochement(
      utilisateur,
      montantDeclare,
      statutFinal,
    );

    const misAJour = await this.prisma.$transaction(async (tx) => {
      await tx.receptionValidation.create({
        data: {
          bordereauId: transaction.bordereau!.id,
          montantRecu: dto.montantRecu,
          ecart,
          statutFinal,
          validateurId: utilisateur.userId,
        },
      });

      const updated = await tx.transactionCaisse.update({
        where: { id },
        data: { statut: statutFinal },
      });

      if (
        statutFinal === StatutTransaction.VALIDEE &&
        transaction.type === TypeTransaction.SORTIE_FONDS
      ) {
        await this.creerContrepartieCentrale(
          tx,
          updated,
          montantDeclare,
          utilisateur.userId,
        );
      }

      return updated;
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action:
        statutFinal === StatutTransaction.VALIDEE
          ? 'TRANSACTION_VALIDEE'
          : 'TRANSACTION_LITIGE',
      entite: 'TransactionCaisse',
      entiteId: id,
      details: JSON.stringify({
        montantDeclare: montantDeclare.toString(),
        montantRecu: montantRecu.toString(),
        ecart: ecart.toString(),
      }),
    });

    await this.broadcastStatut(misAJour);
    return misAJour;
  }

  // LITIGE → VALIDEE — CI/DAF (§6.4) ou Resp boutique/DAF (transfert interne).
  async regulariser(
    id: string,
    dto: RegulariserTransactionDto,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.prisma.transactionCaisse.findUnique({
      where: { id },
      include: {
        bordereau: { include: { reception: true } },
        caisse: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable.');
    }

    if (transaction.statut !== StatutTransaction.LITIGE) {
      throw new BadRequestException(
        'Seule une transaction en LITIGE peut être régularisée.',
      );
    }

    this.stateMachine.assertTransitionAutorisee(
      StatutTransaction.LITIGE,
      StatutTransaction.VALIDEE,
    );

    const montantRetenu = new Prisma.Decimal(dto.montantRetenu);

    if (transaction.type === TypeTransaction.TRANSFERT_INTERNE) {
      if (!ROLES_REGULARISATION_LITIGE_INTERNE.includes(utilisateur.role)) {
        throw new ForbiddenException(
          'Régularisation d’un litige interne réservée au Responsable boutique / DAF.',
        );
      }
      if (
        utilisateur.role === RoleLibelle.RESPONSABLE_BOUTIQUE &&
        transaction.caisse.boutiqueId !== utilisateur.boutiqueId
      ) {
        throw new ForbiddenException(
          'Vous ne pouvez régulariser que les litiges internes de votre boutique.',
        );
      }

      const magasin = await this.prisma.caisse.findFirst({
        where: {
          boutiqueId: transaction.caisse.boutiqueId!,
          type: PrismaTypeCaisse.MAGASIN,
        },
      });
      if (!magasin) {
        throw new BadRequestException(
          'Caisse MAGASIN introuvable pour cette boutique.',
        );
      }

      const misAJour = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.transactionCaisse.update({
          where: { id },
          data: {
            statut: StatutTransaction.VALIDEE,
            montant: montantRetenu,
          },
        });
        if (montantRetenu.greaterThan(0)) {
          await this.creerContrepartieTransfert(
            tx,
            updated,
            magasin.id,
            montantRetenu,
          );
        }
        return updated;
      });

      await this.audit.record({
        utilisateurId: utilisateur.userId,
        action: 'TRANSFERT_INTERNE_REGULARISE',
        entite: 'TransactionCaisse',
        entiteId: id,
        details: JSON.stringify({
          motif: dto.motif,
          montantRetenu: montantRetenu.toString(),
        }),
      });
      await this.broadcastStatut(misAJour);
      return misAJour;
    }

    // SORTIE_FONDS §6.4
    if (!ROLES_REGULARISATION_LITIGE.includes(utilisateur.role)) {
      throw new ForbiddenException(
        'Régularisation d’un litige CENTRALE réservée au Contrôle interne / DAF.',
      );
    }
    if (!transaction.bordereau?.reception) {
      throw new BadRequestException(
        'Aucun rapprochement associé à cette transaction en litige.',
      );
    }

    const montantDeclare = new Prisma.Decimal(
      transaction.bordereau.montantDeclare,
    );
    const ecart = montantRetenu.minus(montantDeclare);

    const misAJour = await this.prisma.$transaction(async (tx) => {
      await tx.receptionValidation.update({
        where: { id: transaction.bordereau!.reception!.id },
        data: {
          montantRecu: montantRetenu,
          ecart,
          statutFinal: StatutTransaction.VALIDEE,
          validateurId: utilisateur.userId,
        },
      });

      const updated = await tx.transactionCaisse.update({
        where: { id },
        data: {
          statut: StatutTransaction.VALIDEE,
          montant: montantRetenu,
        },
      });

      if (montantRetenu.greaterThan(0)) {
        await this.creerContrepartieCentrale(
          tx,
          updated,
          montantRetenu,
          utilisateur.userId,
        );
      }

      return updated;
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_REGULARISEE',
      entite: 'TransactionCaisse',
      entiteId: id,
      details: JSON.stringify({
        motif: dto.motif,
        montantDeclare: montantDeclare.toString(),
        montantRetenu: montantRetenu.toString(),
        ecart: ecart.toString(),
      }),
    });

    await this.broadcastStatut(misAJour);
    return misAJour;
  }

  async findAll(
    utilisateur: AuthenticatedUser,
    query: ListTransactionsQueryDto,
  ): Promise<TransactionCaisse[]> {
    const where: Prisma.TransactionCaisseWhereInput = {
      ...this.buildFiltres(query),
    };

    if (ROLES_RESEAU_TRESORERIE.includes(utilisateur.role)) {
      return this.prisma.transactionCaisse.findMany({
        where,
        orderBy: { dateHeure: 'desc' },
      });
    }

    if (utilisateur.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        utilisateur,
      );
      return this.prisma.transactionCaisse.findMany({
        where: { ...where, caisse: { boutique: { zoneId } } },
        orderBy: { dateHeure: 'desc' },
      });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)) {
      const boutiqueId = requireOwnBoutiqueId(utilisateur);
      return this.prisma.transactionCaisse.findMany({
        where: { ...where, caisse: { boutiqueId } },
        orderBy: { dateHeure: 'desc' },
      });
    }

    throw new ForbiddenException(
      `Rôle "${utilisateur.role}" non habilité à consulter les transactions.`,
    );
  }

  async findOne(id: string, utilisateur: AuthenticatedUser) {
    const transaction = await this.prisma.transactionCaisse.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable.');
    }

    await this.assertLectureAutorisee(transaction, utilisateur);
    return transaction;
  }

  private buildFiltres(
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionCaisseWhereInput {
    const where: Prisma.TransactionCaisseWhereInput = {};
    if (query.statut) where.statut = query.statut;
    if (query.type) where.type = query.type;
    if (query.caisseId) where.caisseId = query.caisseId;
    if (query.from || query.to) {
      where.dateHeure = {};
      if (query.from) where.dateHeure.gte = query.from;
      if (query.to) where.dateHeure.lte = query.to;
    }
    return where;
  }

  // Écriture miroir append-only sur la caisse CENTRALE unique.
  // Idempotente : une seule contrepartie par transaction source.
  private async creerContrepartieCentrale(
    tx: TxClient,
    source: TransactionCaisse,
    montant: Prisma.Decimal,
    initiateurId: string,
  ): Promise<void> {
    const existante = await tx.transactionCaisse.findFirst({
      where: { transactionSourceId: source.id },
    });
    if (existante) {
      return;
    }

    const centrale = await tx.caisse.findFirst({
      where: { type: PrismaTypeCaisse.CENTRALE },
    });
    if (!centrale) {
      throw new BadRequestException(
        'Aucune caisse CENTRALE configurée pour enregistrer la contrepartie.',
      );
    }

    await tx.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant,
        statut: StatutTransaction.VALIDEE,
        caisseId: centrale.id,
        initiateurId,
        transactionSourceId: source.id,
      },
    });
  }

  private async creerContrepartieTransfert(
    tx: TxClient,
    source: TransactionCaisse,
    caisseDestinationId: string,
    montant: Prisma.Decimal,
  ): Promise<void> {
    const existante = await tx.transactionCaisse.findFirst({
      where: { transactionSourceId: source.id },
    });
    if (existante) {
      return;
    }

    await tx.transactionCaisse.create({
      data: {
        type: TypeTransaction.TRANSFERT_INTERNE,
        montant,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisseDestinationId,
        initiateurId: source.initiateurId,
        transactionSourceId: source.id,
      },
    });
  }

  private async trouverOuEchouer(
    id: string,
  ): Promise<TransactionCaisse & { caisse: { boutiqueId: string | null } }> {
    const transaction = await this.prisma.transactionCaisse.findUnique({
      where: { id },
      include: { caisse: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable.');
    }

    return transaction;
  }

  private async assertLectureAutorisee(
    transaction: TransactionCaisse & {
      caisse: {
        boutiqueId: string | null;
        boutique?: { id: string; nom: string } | null;
      };
    },
    utilisateur: AuthenticatedUser,
  ): Promise<void> {
    if (ROLES_RESEAU_TRESORERIE.includes(utilisateur.role)) {
      return;
    }

    if (utilisateur.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        utilisateur,
      );
      const boutiqueId = transaction.caisse.boutiqueId;
      const boutique = boutiqueId
        ? await this.prisma.boutique.findUnique({ where: { id: boutiqueId } })
        : null;
      if (!boutique || boutique.zoneId !== zoneId) {
        throw new ForbiddenException(
          'Vous ne pouvez consulter que les transactions de votre propre zone.',
        );
      }
      return;
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(utilisateur.role)) {
      this.verifierPerimetreBoutique(transaction, utilisateur);
      return;
    }

    throw new ForbiddenException(
      `Rôle "${utilisateur.role}" non habilité à consulter les transactions.`,
    );
  }

  private verifierPerimetreBoutique(
    transaction: TransactionCaisse & { caisse?: { boutiqueId: string | null } },
    utilisateur: AuthenticatedUser,
  ): void {
    if (
      utilisateur.boutiqueId &&
      transaction.caisse?.boutiqueId !== utilisateur.boutiqueId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez agir que sur une transaction de votre propre boutique.',
      );
    }
  }

  // §4 : au-dessus du seuil, seule la DG valide (VALIDEE). En dessous,
  // Central/DAF uniquement. LITIGE reste accessible à Central/DAF même
  // au-dessus du seuil (constat d'écart).
  private async assertHabilitationRapprochement(
    utilisateur: AuthenticatedUser,
    montantDeclare: Prisma.Decimal,
    statutFinal: string,
  ): Promise<void> {
    const societe = await this.prisma.societe.findFirst();
    const seuil = societe?.seuilValidationDg
      ? new Prisma.Decimal(societe.seuilValidationDg)
      : new Prisma.Decimal(SEUIL_VALIDATION_DG_DEFAUT);
    const auDessusDuSeuil = montantDeclare.greaterThanOrEqualTo(seuil);

    if (statutFinal === StatutTransaction.LITIGE) {
      if (!ROLES_VALIDATION_CAISSE_CENTRALE.includes(utilisateur.role)) {
        throw new ForbiddenException(
          'Seul le Caissier Central ou le DAF peut constater un litige.',
        );
      }
      return;
    }

    // VALIDEE
    if (auDessusDuSeuil) {
      if (utilisateur.role !== RoleLibelle.DIRECTION_GENERALE) {
        throw new ForbiddenException(
          `Montant ≥ seuil DG (${seuil.toFixed(2)} FCFA) : validation réservée à la Direction Générale (§4).`,
        );
      }
      return;
    }

    if (!ROLES_VALIDATION_CAISSE_CENTRALE.includes(utilisateur.role)) {
      throw new ForbiddenException(
        'Sous le seuil exceptionnel, seul le Caissier Central ou le DAF peut valider.',
      );
    }
  }

  private async broadcastStatut(transaction: TransactionCaisse): Promise<void> {
    const caisse = await this.prisma.caisse.findUnique({
      where: { id: transaction.caisseId },
      include: { boutique: { select: { id: true, zoneId: true } } },
    });
    this.gateway.emitStatutChange({
      id: transaction.id,
      statut: transaction.statut,
      type: transaction.type,
      montant: transaction.montant.toString(),
      caisseId: transaction.caisseId,
      boutiqueId: caisse?.boutiqueId ?? null,
      zoneId: caisse?.boutique?.zoneId ?? null,
    });
  }
}
