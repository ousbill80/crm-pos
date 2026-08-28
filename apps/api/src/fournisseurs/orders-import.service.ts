import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StatutCommandeAchat as PrismaStatutCommandeAchat,
  TypeCoutImport,
  TypeJalonCommandeAchat,
} from '@prisma/client';
import { StatutCommandeAchat } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { AchatsStateMachineService } from './achats-state-machine.service';
import {
  AmendCommandeAchatDto,
  CompareScenariosDto,
  CreateCoutImportDto,
  CreateDocumentImportDto,
  CreateExpeditionDto,
  DecisionCommandeDto,
  JalonCommandeDto,
  UpdateDossierDouaneDto,
} from './dto/orders-import.dto';
import { LandedCostCalculator } from './landed-cost.calculator';

const IMPORT_INCLUDE = {
  versions: { orderBy: { version: 'asc' as const } },
  decisionsApprobation: { orderBy: { dateDecision: 'asc' as const } },
  echeancesPaiement: { orderBy: { ordre: 'asc' as const } },
  jalons: { orderBy: { dateCreation: 'asc' as const } },
  expeditions: {
    include: {
      conteneurs: true,
      dossier: { include: { documents: true, couts: true } },
    },
    orderBy: { dateCreation: 'asc' as const },
  },
  lignes: true,
} as const;

@Injectable()
export class OrdersImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: AchatsStateMachineService,
    private readonly calculator: LandedCostCalculator,
  ) {}

  async detail(id: string) {
    return this.charger(id);
  }

  async amender(
    id: string,
    dto: AmendCommandeAchatDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.commandeAchatVersion.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    if (replay) {
      if (replay.commandeId !== id) this.idempotencyConflict();
      return replay;
    }
    const commande = await this.charger(id);
    if (
      commande.statut !== PrismaStatutCommandeAchat.BROUILLON &&
      commande.statut !== PrismaStatutCommandeAchat.REJETEE
    ) {
      throw new BadRequestException(
        'Un avenant ne peut être créé que sur une commande BROUILLON ou REJETEE.',
      );
    }
    const version = commande.versionCourante + 1;
    const snapshot = this.snapshot(commande, {
      notes: dto.notes ?? commande.notes,
      proformaReference: dto.proformaReference ?? commande.proformaReference,
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.commandeAchatVersion.create({
        data: {
          commandeId: id,
          version,
          motif: dto.motif.trim(),
          snapshot,
          creeParId: user.userId,
          clientOperationId: dto.clientOperationId,
        },
      });
      await tx.commandeAchat.update({
        where: { id },
        data: {
          versionCourante: version,
          notes: dto.notes,
          proformaReference: dto.proformaReference,
          statut: PrismaStatutCommandeAchat.BROUILLON,
        },
      });
      await this.audit(tx, user, 'COMMANDE_ACHAT_AMENDED', id, {
        version,
        motif: dto.motif,
      });
      return created;
    });
  }

  async soumettre(id: string, user: AuthenticatedUser) {
    const commande = await this.charger(id);
    await this.assertTransition(
      commande,
      user,
      commande.statut,
      StatutCommandeAchat.SOUMISE_APPROBATION,
    );
    return this.transition(
      id,
      PrismaStatutCommandeAchat.SOUMISE_APPROBATION,
      user,
      'COMMANDE_ACHAT_SOUMISE',
      { dateSoumission: new Date() },
    );
  }

  async approuver(
    id: string,
    dto: DecisionCommandeDto,
    user: AuthenticatedUser,
  ) {
    const commande = await this.charger(id);
    if (commande.initiateurId === user.userId) {
      throw new ConflictException(
        'Séparation des tâches : l’initiateur ne peut pas approuver sa commande.',
      );
    }
    await this.assertTransition(
      commande,
      user,
      commande.statut,
      StatutCommandeAchat.APPROUVEE,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.decisionApprobationCommande.create({
        data: {
          commandeId: id,
          decision: 'APPROUVEE',
          motif: dto.motif?.trim() || null,
          approbateurId: user.userId,
          roleSnapshot: user.role,
          clientOperationId: dto.clientOperationId,
        },
      });
      const updated = await tx.commandeAchat.update({
        where: { id },
        data: {
          statut: PrismaStatutCommandeAchat.APPROUVEE,
          approbateurId: user.userId,
          dateApprobation: new Date(),
        },
        include: IMPORT_INCLUDE,
      });
      await this.audit(tx, user, 'COMMANDE_ACHAT_APPROUVEE', id, {
        role: user.role,
      });
      return updated;
    });
  }

  async rejeter(id: string, dto: DecisionCommandeDto, user: AuthenticatedUser) {
    const motif = dto.motif?.trim();
    if (!motif) {
      throw new BadRequestException('Le motif de rejet est obligatoire.');
    }
    const commande = await this.charger(id);
    await this.assertTransition(
      commande,
      user,
      commande.statut,
      StatutCommandeAchat.REJETEE,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.decisionApprobationCommande.create({
        data: {
          commandeId: id,
          decision: 'REJETEE',
          motif,
          approbateurId: user.userId,
          roleSnapshot: user.role,
          clientOperationId: dto.clientOperationId,
        },
      });
      const updated = await tx.commandeAchat.update({
        where: { id },
        data: { statut: PrismaStatutCommandeAchat.REJETEE },
        include: IMPORT_INCLUDE,
      });
      await this.audit(tx, user, 'COMMANDE_ACHAT_REJETEE', id, {
        motif,
      });
      return updated;
    });
  }

  async production(id: string, dto: JalonCommandeDto, user: AuthenticatedUser) {
    const replay = await this.prisma.jalonCommandeAchat.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    if (replay) {
      if (replay.commandeId !== id) this.idempotencyConflict();
      return replay;
    }
    const commande = await this.charger(id);
    await this.assertTransition(
      commande,
      user,
      commande.statut,
      StatutCommandeAchat.EN_PRODUCTION,
    );
    return this.prisma.$transaction(async (tx) => {
      const jalon = await tx.jalonCommandeAchat.create({
        data: {
          commandeId: id,
          type: TypeJalonCommandeAchat.PRODUCTION_DEBUT,
          dateReelle: new Date(dto.date),
          notes: dto.notes?.trim() || null,
          creeParId: user.userId,
          clientOperationId: dto.clientOperationId,
        },
      });
      await tx.commandeAchat.update({
        where: { id },
        data: { statut: PrismaStatutCommandeAchat.EN_PRODUCTION },
      });
      await this.audit(tx, user, 'COMMANDE_ACHAT_EN_PRODUCTION', id);
      return jalon;
    });
  }

  async creerExpedition(
    id: string,
    dto: CreateExpeditionDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.expeditionInternationale.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { conteneurs: true, dossier: true },
    });
    if (replay) {
      if (replay.commandeId !== id) this.idempotencyConflict();
      return replay;
    }
    const commande = await this.charger(id);
    await this.assertTransition(
      commande,
      user,
      commande.statut,
      StatutCommandeAchat.EXPEDIEE,
    );
    return this.prisma.$transaction(async (tx) => {
      const expedition = await tx.expeditionInternationale.create({
        data: {
          commandeId: id,
          mode: dto.mode,
          referenceTransport: dto.referenceTransport.trim(),
          transporteur: dto.transporteur?.trim() || null,
          portAeroportDepart: dto.portAeroportDepart?.trim() || null,
          portAeroportArrivee: dto.portAeroportArrivee?.trim() || null,
          dateChargement: dto.dateChargement
            ? new Date(dto.dateChargement)
            : null,
          eta: dto.eta ? new Date(dto.eta) : null,
          clientOperationId: dto.clientOperationId,
          conteneurs: dto.conteneurs?.length
            ? { create: dto.conteneurs }
            : undefined,
          dossier: { create: {} },
        },
        include: { conteneurs: true, dossier: true },
      });
      await tx.commandeAchat.update({
        where: { id },
        data: { statut: PrismaStatutCommandeAchat.EXPEDIEE },
      });
      if (dto.dateChargement) {
        await tx.jalonCommandeAchat.create({
          data: {
            commandeId: id,
            type: TypeJalonCommandeAchat.CHARGEMENT,
            dateReelle: new Date(dto.dateChargement),
            creeParId: user.userId,
          },
        });
      }
      if (dto.eta) {
        await tx.jalonCommandeAchat.create({
          data: {
            commandeId: id,
            type: TypeJalonCommandeAchat.ETA,
            datePrevue: new Date(dto.eta),
            creeParId: user.userId,
          },
        });
      }
      await this.audit(tx, user, 'EXPEDITION_INTERNATIONALE_CREATED', id, {
        expeditionId: expedition.id,
        mode: dto.mode,
      });
      return expedition;
    });
  }

  async mettreAJourDossier(
    id: string,
    expeditionId: string,
    dto: UpdateDossierDouaneDto,
    user: AuthenticatedUser,
  ) {
    const dossier = await this.dossier(id, expeditionId);
    const updated = await this.prisma.dossierDouane.update({
      where: { id: dossier.id },
      data: {
        numeroDeclaration: dto.numeroDeclaration,
        regimeDouanier: dto.regimeDouanier,
        bureauDouane: dto.bureauDouane,
        dateDeclaration: dto.dateDeclaration
          ? new Date(dto.dateDeclaration)
          : undefined,
        declarant: dto.declarant,
      },
    });
    await this.prisma.journalAudit.create({
      data: {
        utilisateurId: user.userId,
        action: 'DOSSIER_DOUANE_UPDATED',
        entite: 'DossierDouane',
        entiteId: dossier.id,
        details: JSON.stringify({ commandeId: id, expeditionId }),
      },
    });
    return updated;
  }

  async ajouterDocument(
    id: string,
    expeditionId: string,
    dto: CreateDocumentImportDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.documentImport.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    const dossier = await this.dossier(id, expeditionId);
    if (replay) {
      if (replay.dossierId !== dossier.id) this.idempotencyConflict();
      return replay;
    }
    const created = await this.prisma.documentImport.create({
      data: {
        dossierId: dossier.id,
        type: dto.type,
        reference: dto.reference.trim(),
        dateDocument: dto.dateDocument ? new Date(dto.dateDocument) : null,
        emetteur: dto.emetteur?.trim() || null,
        nomFichier: dto.nomFichier?.trim() || null,
        mimeType: dto.mimeType?.trim() || null,
        tailleOctets: dto.tailleOctets,
        empreinteSha256: dto.empreinteSha256?.trim() || null,
        uri: dto.uri?.trim() || null,
        clientOperationId: dto.clientOperationId,
      },
    });
    await this.prisma.journalAudit.create({
      data: {
        utilisateurId: user.userId,
        action: 'DOCUMENT_IMPORT_METADATA_CREATED',
        entite: 'DocumentImport',
        entiteId: created.id,
        details: JSON.stringify({ commandeId: id, type: dto.type }),
      },
    });
    return created;
  }

  async ajouterCout(
    id: string,
    expeditionId: string,
    dto: CreateCoutImportDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.ligneCoutImport.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    const dossier = await this.dossier(id, expeditionId);
    if (replay) {
      if (replay.dossierId !== dossier.id) this.idempotencyConflict();
      return replay;
    }
    const created = await this.prisma.ligneCoutImport.create({
      data: {
        dossierId: dossier.id,
        type: this.normaliserTypeCout(dto.type),
        libelle: dto.libelle.trim(),
        montant: dto.montant,
        devise: dto.devise.toUpperCase(),
        tauxChangeSnapshot: dto.tauxChangeSnapshot,
        clientOperationId: dto.clientOperationId,
      },
    });
    await this.prisma.journalAudit.create({
      data: {
        utilisateurId: user.userId,
        action: 'COUT_IMPORT_CREATED',
        entite: 'LigneCoutImport',
        entiteId: created.id,
        details: JSON.stringify({
          commandeId: id,
          type: dto.type,
          tauxChangeSnapshot: dto.tauxChangeSnapshot,
        }),
      },
    });
    return created;
  }

  async coutRendu(id: string) {
    const commande = await this.charger(id);
    const goodsAmount = commande.lignes.reduce(
      (sum, ligne) => sum.add(ligne.prixUnitaire.mul(ligne.quantite)),
      new Prisma.Decimal(0),
    );
    if (!commande.tauxChangeSnapshot) {
      throw new BadRequestException(
        'La commande ne possède pas de taux de change snapshot.',
      );
    }
    const costs = commande.expeditions.flatMap(
      (expedition) => expedition.dossier?.couts ?? [],
    );
    return this.calculator.calculate({
      goodsAmount,
      exchangeRate: commande.tauxChangeSnapshot,
      costs: costs.map((cost) => ({
        type: cost.type,
        label: cost.libelle,
        amount: cost.montant,
        currency: cost.devise,
        exchangeRate: cost.tauxChangeSnapshot,
      })),
    });
  }

  async comparer(id: string, dto: CompareScenariosDto) {
    const commande = await this.charger(id);
    const goodsAmount = commande.lignes.reduce(
      (sum, ligne) => sum.add(ligne.prixUnitaire.mul(ligne.quantite)),
      new Prisma.Decimal(0),
    );
    if (!commande.tauxChangeSnapshot) {
      throw new BadRequestException('Taux snapshot absent.');
    }
    return this.calculator.compare(
      dto.scenarios.map((scenario) => ({
        name: scenario.name,
        goodsAmount,
        exchangeRate: commande.tauxChangeSnapshot!,
        transitDays: scenario.transitDays,
        costs: [
          {
            type: 'FRET',
            label: `Fret ${scenario.name}`,
            amount: scenario.freight,
            currency: scenario.currency,
            exchangeRate: scenario.exchangeRate,
          },
        ],
      })),
    );
  }

  private async transition(
    id: string,
    statut: PrismaStatutCommandeAchat,
    user: AuthenticatedUser,
    action: string,
    data: Prisma.CommandeAchatUpdateInput = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commandeAchat.update({
        where: { id },
        data: { ...data, statut },
        include: IMPORT_INCLUDE,
      });
      await this.audit(tx, user, action, id);
      return updated;
    });
  }

  private async charger(id: string) {
    const commande = await this.prisma.commandeAchat.findUnique({
      where: { id },
      include: IMPORT_INCLUDE,
    });
    if (!commande) throw new NotFoundException(`Commande ${id} introuvable.`);
    return commande;
  }

  private async dossier(id: string, expeditionId: string) {
    const expedition = await this.prisma.expeditionInternationale.findFirst({
      where: { id: expeditionId, commandeId: id },
      include: { dossier: true },
    });
    if (!expedition) {
      throw new NotFoundException(`Expédition ${expeditionId} introuvable.`);
    }
    if (!expedition.dossier) {
      throw new NotFoundException('Dossier douanier introuvable.');
    }
    return expedition.dossier;
  }

  private snapshot(
    commande: Awaited<ReturnType<OrdersImportService['charger']>>,
    override: { notes: string | null; proformaReference: string | null },
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify({
        fournisseurId: commande.fournisseurId,
        societeId: commande.societeId,
        devise: commande.devise,
        tauxChangeSnapshot: commande.tauxChangeSnapshot?.toString() ?? null,
        incoterm: commande.incoterm,
        lieuOrigine: commande.lieuOrigine,
        lieuDestination: commande.lieuDestination,
        ...override,
        conditionsPaiement: commande.conditionsPaiement,
        lignes: commande.lignes.map((ligne) => ({
          produitId: ligne.produitId,
          quantite: ligne.quantite,
          prixUnitaire: ligne.prixUnitaire.toString(),
        })),
        echeancesPaiement: commande.echeancesPaiement,
      }),
    ) as Prisma.InputJsonValue;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    action: string,
    entiteId: string,
    details?: Record<string, unknown>,
  ) {
    await tx.journalAudit.create({
      data: {
        utilisateurId: user.userId,
        action,
        entite: 'CommandeAchat',
        entiteId,
        details: details ? JSON.stringify(details) : undefined,
      },
    });
  }

  private async assertTransition(
    commande: { id: string },
    user: AuthenticatedUser,
    depuis: StatutCommandeAchat,
    vers: StatutCommandeAchat,
  ) {
    try {
      this.machine.assertCommande(depuis, vers);
    } catch (error) {
      await this.prisma.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action: 'COMMANDE_ACHAT_TRANSITION_REFUSEE',
          entite: 'CommandeAchat',
          entiteId: commande.id,
          details: JSON.stringify({ depuis, vers }),
        },
      });
      throw error;
    }
  }

  private idempotencyConflict(): never {
    throw new ConflictException(
      'clientOperationId déjà utilisé par une autre opération.',
    );
  }

  private normaliserTypeCout(
    type: CreateCoutImportDto['type'],
  ): TypeCoutImport {
    const aliases: Partial<
      Record<CreateCoutImportDto['type'], TypeCoutImport>
    > = {
      DUTY: TypeCoutImport.DROIT_DOUANE,
      TAX: TypeCoutImport.TAXE,
      FREIGHT: TypeCoutImport.FRET,
      INSURANCE: TypeCoutImport.ASSURANCE,
      DEMURRAGE: TypeCoutImport.SURESTARIE,
    };
    return aliases[type] ?? (type as TypeCoutImport);
  }
}
