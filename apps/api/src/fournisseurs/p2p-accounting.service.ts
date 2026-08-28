import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ModePaiementFournisseur,
  Prisma,
  TypeSourceComptable,
} from '@prisma/client';
import { RoleLibelle } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { GlLedgerWriter } from '../accounting-gl/gl-ledger.writer';
import { SalesGlService } from '../accounting-gl/sales-gl.service';
import {
  AccountingOperationDto,
  AccountingRangeQueryDto,
  AccountingReportQueryDto,
  CreateCompteComptableDto,
  CreateNatureDepenseDto,
  CreatePostingTemplateDto,
  CreatePaymentScheduleDto,
  CreateTreasuryAccountDto,
  ExecuteSupplierPaymentDto,
  ImportBankStatementDto,
  PrepareSupplierPaymentDto,
  ReconcileBankLineDto,
  CreateJournalComptableDto,
  UpdateCompteComptableDto,
  UpdateJournalComptableDto,
  UpdateNatureDepenseDto,
  ManualJournalDto,
  CloseExerciceDto,
  OpenExerciceDto,
  LetteringQueryDto,
  LetterLinesDto,
  StornoEntryDto,
} from './dto/p2p-accounting.dto';
import {
  JOURNAUX_EXERCICE_DEFAUT,
  periodesMensuellesExercice,
} from '../accounting-gl/exercice-scaffold';
import { PaymentProposalListQueryDto } from './dto/p2p-list.dto';
import { libelleOdAvecPiece } from './od-piece';
import { suggestBankMatches } from './bank-match.suggest';
import {
  P2pAccountingCalculator,
  type CalculatedPostingLine,
} from './p2p-accounting.calculator';
import {
  buildSyscohadaStatements,
  buildVatReturn,
  classeCompte,
  netSolde,
  type TrialBalanceRow,
} from '../accounting-gl/syscohada-statements';
import {
  buildPerimetre,
  buildSyscohadaLiasse,
  mergeTrialBalances,
  previousWindow,
  type LiasseNotes,
  type LiassePack,
} from '../accounting-gl/syscohada-liasse';

@Injectable()
export class P2pAccountingService {
  private readonly logger = new Logger(P2pAccountingService.name);

  private readonly ledger: GlLedgerWriter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: P2pAccountingCalculator,
    @Optional() private readonly salesGl?: SalesGlService,
  ) {
    this.ledger = new GlLedgerWriter(calculator);
  }

  createTreasuryAccount(
    dto: CreateTreasuryAccountDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const gl = await tx.compteComptable.findFirst({
        where: {
          id: dto.compteComptableId,
          societeId: dto.societeId,
          actif: true,
        },
      });
      if (!gl) {
        throw new BadRequestException(
          'Le compte comptable doit appartenir à la société et être actif.',
        );
      }
      const account = await tx.compteTresorerie.create({
        data: {
          societeId: dto.societeId,
          code: dto.code.trim().toUpperCase(),
          libelle: dto.libelle.trim(),
          type: dto.type,
          devise: dto.devise.toUpperCase(),
          compteComptableId: dto.compteComptableId,
        },
      });
      await this.audit(
        tx,
        user.userId,
        'COMPTE_TRESORERIE_CREATED',
        account.id,
        {
          code: account.code,
          type: account.type,
        },
      );
      return account;
    });
  }

  createTemplate(dto: CreatePostingTemplateDto, user: AuthenticatedUser) {
    const roles = dto.lignes.map((line) => line.role);
    if (new Set(roles).size !== roles.length) {
      throw new BadRequestException(
        'Un rôle comptable ne peut apparaître qu’une fois par modèle.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.modeleComptabilisation.create({
        data: {
          societeId: dto.societeId,
          journalId: dto.journalId,
          code: dto.code.trim().toUpperCase(),
          version: dto.version,
          sourceType: dto.sourceType,
          valideDu: new Date(dto.valideDu),
          valideAu: dto.valideAu ? new Date(dto.valideAu) : null,
          lignes: {
            create: dto.lignes.map((line) => ({
              role: line.role,
              compteId: line.compteId,
              ordre: line.ordre,
            })),
          },
        },
        include: { lignes: true },
      });
      await this.audit(
        tx,
        user.userId,
        'MODELE_COMPTABLE_CREATED',
        template.id,
        {
          code: template.code,
          version: template.version,
          sourceType: template.sourceType,
        },
      );
      return template;
    });
  }

  async createPaymentSchedule(
    factureId: string,
    dto: CreatePaymentScheduleDto,
    user: AuthenticatedUser,
  ) {
    const invoice = await this.prisma.factureFournisseur.findUnique({
      where: { id: factureId },
      include: { echeancesPaiement: true },
    });
    if (!invoice)
      throw new NotFoundException('Facture fournisseur introuvable.');
    if (invoice.echeancesPaiement.length) {
      throw new ConflictException(
        'Un échéancier existe déjà pour cette facture.',
      );
    }
    if (invoice.devise !== dto.devise.toUpperCase()) {
      throw new BadRequestException(
        'La devise de l’échéancier est incohérente.',
      );
    }
    const total = dto.echeances.reduce(
      (sum, item) => sum.plus(item.montant),
      new Prisma.Decimal(0),
    );
    if (!total.eq(invoice.netAPayer ?? invoice.montant)) {
      throw new BadRequestException(
        'La somme de l’échéancier doit égaler le net à payer.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.echeancePaiementFournisseur.createManyAndReturn(
        {
          data: dto.echeances.map((item, index) => ({
            factureId,
            dateEcheance: new Date(item.dateEcheance),
            montant: item.montant,
            devise: dto.devise.toUpperCase(),
            sequence: index + 1,
          })),
        },
      );
      await this.audit(
        tx,
        user.userId,
        'ECHEANCIER_FOURNISSEUR_CREATED',
        factureId,
        {
          nombreEcheances: schedule.length,
          montant: total.toFixed(2),
        },
      );
      return schedule;
    });
  }

  async postInvoice(
    factureId: string,
    dto: AccountingOperationDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.ecritureComptable.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) {
      if (replay.factureId !== factureId) {
        throw new ConflictException(
          'clientOperationId déjà utilisé pour une autre écriture.',
        );
      }
      return replay;
    }
    const invoice = await this.prisma.factureFournisseur.findUnique({
      where: { id: factureId },
      include: {
        exceptions: true,
        lignes: {
          include: {
            natureDepense: true,
            ligneCommande: {
              include: { commande: { select: { societeId: true } } },
            },
          },
        },
      },
    });
    if (!invoice)
      throw new NotFoundException('Facture fournisseur introuvable.');
    if (!['RAPPROCHEE', 'EXCEPTEE'].includes(invoice.statutRapprochement)) {
      throw new BadRequestException(
        'La facture doit être rapprochée ou couverte par une exception.',
      );
    }
    if (
      invoice.statutRapprochement === 'EXCEPTEE' &&
      invoice.exceptions.length === 0
    ) {
      throw new BadRequestException('Exception comptable non documentée.');
    }
    const societeId = this.resolveInvoiceSociete(invoice);
    const date = dto.dateComptable
      ? new Date(dto.dateComptable)
      : (invoice.dateDocument ?? invoice.dateFacture);
    const charge = invoice.nature === 'CHARGE';
    const sourceType: TypeSourceComptable = charge
      ? 'FACTURE_CHARGE'
      : invoice.typeDocument === 'FACTURE'
        ? 'FACTURE_FOURNISSEUR'
        : 'AVOIR_FOURNISSEUR';
    const calculated = charge
      ? this.calculator.chargeInvoice({
          charges: invoice.lignes.map((line) => {
            if (!line.natureDepense) {
              throw new BadRequestException(
                'Chaque ligne de charge doit avoir une nature de dépense (compte 6xx).',
              );
            }
            return {
              compteId: line.natureDepense.compteId,
              ht: line.montantHt ?? line.prixUnitaire.mul(line.quantite),
            };
          }),
          tax: invoice.totalTaxes ?? 0,
          withholding: invoice.totalRetenues ?? 0,
          payable: invoice.netAPayer ?? invoice.montant,
        })
      : this.calculator.supplierInvoice({
          netHt: invoice.totalHt ?? invoice.montant,
          tax: invoice.totalTaxes ?? 0,
          withholding: invoice.totalRetenues ?? 0,
          payable: invoice.netAPayer ?? invoice.montant,
        });
    const lines =
      sourceType === 'AVOIR_FOURNISSEUR'
        ? this.calculator.creditNote(calculated)
        : calculated;
    const entry = await this.prisma.$transaction(
      async (tx) => {
        const context = await this.ledger.context(
          tx,
          societeId,
          sourceType,
          date,
        );
        const created = await this.ledger.createEntry(tx, {
          context,
          sourceType,
          sourceId: invoice.id,
          factureId: invoice.id,
          label: `${charge ? 'Charge' : sourceType === 'AVOIR_FOURNISSEUR' ? 'Avoir' : 'Facture'} ${invoice.numero}`,
          date,
          currency: invoice.devise,
          rate: invoice.tauxChangeSnapshot,
          operationId: dto.clientOperationId,
          authorId: user.userId,
          supplierId: invoice.fournisseurId,
          lines,
        });
        await tx.factureFournisseur.update({
          where: { id: factureId },
          data: {
            statut: 'COMPTABILISEE',
            operationComptabilisationId: dto.clientOperationId,
          },
        });
        await this.audit(
          tx,
          user.userId,
          'FACTURE_P2P_COMPTABILISEE_GL',
          factureId,
          {
            ecritureId: created.id,
            operation: dto.clientOperationId,
          },
        );
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return entry;
  }

  async preparePayment(
    dto: PrepareSupplierPaymentDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.propositionPaiementFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { allocations: true },
    });
    if (replay) return replay;
    const account = await this.prisma.compteTresorerie.findUnique({
      where: { id: dto.compteTresorerieId },
    });
    if (!account || !account.actif || account.societeId !== dto.societeId) {
      throw new BadRequestException('Compte de trésorerie actif introuvable.');
    }
    this.assertModeAccount(dto.mode, account.type);
    const invoiceIds = dto.allocations.map((item) => item.factureId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new BadRequestException('Facture dupliquée dans les allocations.');
    }
    const invoices = await this.prisma.factureFournisseur.findMany({
      where: { id: { in: invoiceIds } },
      include: {
        allocationsPaiement: {
          include: { proposition: { include: { paiement: true } } },
        },
      },
    });
    if (invoices.length !== invoiceIds.length) {
      throw new BadRequestException('Une facture allouée est introuvable.');
    }
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    if (
      new Set(invoices.map((invoice) => invoice.fournisseurId)).size !== 1 ||
      invoices.some((invoice) => invoice.devise !== dto.devise.toUpperCase())
    ) {
      throw new BadRequestException(
        'Une proposition regroupe un seul fournisseur et une seule devise.',
      );
    }
    const checks = dto.allocations.map((allocation) => {
      const invoice = byId.get(allocation.factureId)!;
      if (!['COMPTABILISEE', 'PARTIELLEMENT_PAYEE'].includes(invoice.statut)) {
        throw new BadRequestException(
          `La facture ${invoice.numero} n’est pas payable.`,
        );
      }
      const paid = invoice.allocationsPaiement.reduce(
        (sum, row) => (row.proposition.paiement ? sum.plus(row.montant) : sum),
        new Prisma.Decimal(0),
      );
      return {
        amount: allocation.montant,
        outstanding: new Prisma.Decimal(
          invoice.netAPayer ?? invoice.montant,
        ).minus(paid),
      };
    });
    const total = dto.allocations.reduce(
      (sum, item) => sum.plus(item.montant),
      new Prisma.Decimal(0),
    );
    this.calculator.assertAllocations(total, checks);
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.propositionPaiementFournisseur.create({
        data: {
          numero: this.number('PP', dto.clientOperationId),
          societeId: dto.societeId,
          montant: total,
          devise: dto.devise.toUpperCase(),
          mode: dto.mode,
          compteTresorerieId: dto.compteTresorerieId,
          dateExecutionPrevue: new Date(dto.dateExecutionPrevue),
          referenceInstruction: dto.referenceInstruction?.trim() || null,
          clientOperationId: dto.clientOperationId,
          preparateurId: user.userId,
          allocations: {
            create: dto.allocations.map((item) => ({
              factureId: item.factureId,
              montant: item.montant,
              montantDevise: item.montantDevise,
            })),
          },
        },
        include: { allocations: true },
      });
      await this.audit(
        tx,
        user.userId,
        'PAIEMENT_FOURNISSEUR_PREPARE',
        proposal.id,
        {
          montant: total.toFixed(2),
          compteTresorerieId: account.id,
        },
      );
      return proposal;
    });
  }

  async listPaymentProposals(
    query: PaymentProposalListQueryDto,
    user: AuthenticatedUser,
  ) {
    const where = this.paymentProposalWhere(query, user);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.propositionPaiementFournisseur.findMany({
        where,
        include: {
          compteTresorerie: {
            select: { id: true, code: true, libelle: true, type: true },
          },
          preparateur: { select: { id: true, nom: true, prenom: true } },
          approbateur: { select: { id: true, nom: true, prenom: true } },
          allocations: {
            include: {
              facture: {
                select: {
                  id: true,
                  numero: true,
                  fournisseurId: true,
                  fournisseur: { select: { id: true, nom: true } },
                },
              },
            },
          },
          paiement: {
            select: { id: true, datePaiement: true, reference: true },
          },
        },
        orderBy: [{ dateExecutionPrevue: 'asc' }, { numero: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.propositionPaiementFournisseur.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async paymentProposalDetail(id: string, user: AuthenticatedUser) {
    const proposal = await this.prisma.propositionPaiementFournisseur.findFirst(
      {
        where: {
          id,
          ...this.paymentProposalScope(user),
        },
        include: {
          societe: true,
          compteTresorerie: true,
          preparateur: { select: { id: true, nom: true, prenom: true } },
          approbateur: { select: { id: true, nom: true, prenom: true } },
          approbateurException: {
            select: { id: true, nom: true, prenom: true },
          },
          executeur: { select: { id: true, nom: true, prenom: true } },
          allocations: {
            include: {
              facture: { include: { fournisseur: true } },
            },
          },
          paiement: { include: { ecritureComptable: true } },
        },
      },
    );
    if (!proposal) {
      throw new NotFoundException('Proposition de paiement introuvable.');
    }
    return proposal;
  }

  async approvePayment(
    id: string,
    dto: AccountingOperationDto,
    user: AuthenticatedUser,
  ) {
    const proposal = await this.loadProposal(id);
    if (
      proposal.statut === 'APPROUVEE' ||
      proposal.statut === 'APPROUVEE_EXCEPTION'
    ) {
      return proposal;
    }
    if (proposal.statut !== 'PREPAREE') {
      throw new ConflictException('Proposition non approuvable.');
    }
    if (proposal.preparateurId === user.userId) {
      throw new ForbiddenException(
        'Le préparateur ne peut pas approuver son propre paiement.',
      );
    }
    const company = await this.prisma.societe.findUniqueOrThrow({
      where: { id: proposal.societeId },
    });
    const exceptional = proposal.montant.gt(company.seuilValidationDg);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.propositionPaiementFournisseur.update({
        where: { id },
        data: {
          statut: exceptional ? 'APPROUVEE' : 'APPROUVEE_EXCEPTION',
          approbateurId: user.userId,
          dateApprobation: new Date(),
        },
      });
      await this.audit(
        tx,
        user.userId,
        'PAIEMENT_FOURNISSEUR_APPROUVE_DAF',
        id,
        {
          operation: dto.clientOperationId,
          approbationDgRequise: exceptional,
        },
      );
      return updated;
    });
  }

  async exceptionalApprove(
    id: string,
    dto: AccountingOperationDto,
    user: AuthenticatedUser,
  ) {
    const proposal = await this.loadProposal(id);
    const company = await this.prisma.societe.findUniqueOrThrow({
      where: { id: proposal.societeId },
    });
    if (!proposal.montant.gt(company.seuilValidationDg)) {
      throw new BadRequestException(
        'Approbation DG réservée aux seuils exceptionnels.',
      );
    }
    if (proposal.statut !== 'APPROUVEE' || !proposal.approbateurId) {
      throw new BadRequestException('Approbation DAF préalable requise.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.propositionPaiementFournisseur.update({
        where: { id },
        data: {
          statut: 'APPROUVEE_EXCEPTION',
          approbateurExceptionId: user.userId,
          dateApprobationException: new Date(),
        },
      });
      await this.audit(
        tx,
        user.userId,
        'PAIEMENT_FOURNISSEUR_APPROUVE_DG',
        id,
        {
          operation: dto.clientOperationId,
          montant: proposal.montant.toFixed(2),
        },
      );
      return updated;
    });
  }

  async executePayment(
    id: string,
    dto: ExecuteSupplierPaymentDto,
    user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.paiementFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    if (existing) {
      if (existing.propositionId !== id) {
        throw new ConflictException('Opération déjà utilisée.');
      }
      return existing;
    }
    const proposal = await this.loadProposal(id);
    if (proposal.statut !== 'APPROUVEE_EXCEPTION') {
      throw new BadRequestException('Toutes les approbations sont requises.');
    }
    if (
      proposal.preparateurId === user.userId ||
      proposal.approbateurId === user.userId ||
      proposal.approbateurExceptionId === user.userId
    ) {
      throw new ForbiddenException(
        'Préparation, approbation et exécution doivent être des personnes distinctes.',
      );
    }
    if (
      user.role === RoleLibelle.CAISSIER_CENTRAL &&
      proposal.compteTresorerie.type !== 'CENTRAL_CASH'
    ) {
      throw new ForbiddenException(
        'Le Caissier central exécute uniquement la caisse centrale.',
      );
    }
    const first = proposal.allocations[0];
    const date = dto.dateComptable ? new Date(dto.dateComptable) : new Date();
    const invoiceRate =
      first.facture.tauxChangeSnapshot ?? new Prisma.Decimal(1);
    const paymentRate = new Prisma.Decimal(dto.tauxChange ?? invoiceRate);
    const foreignAmount = proposal.montant;
    const fx = this.calculator.paymentFx({
      foreignAmount,
      invoiceRate,
      paymentRate,
    });
    const supplierBase = proposal.allocations.reduce(
      (sum, allocation) =>
        sum.plus(
          new Prisma.Decimal(
            allocation.montantDevise ?? allocation.montant,
          ).mul(allocation.facture.tauxChangeSnapshot ?? 1),
        ),
      new Prisma.Decimal(0),
    );
    const treasuryBase = new Prisma.Decimal(fx.basePayment);
    const lines: CalculatedPostingLine[] = [
      { role: 'SUPPLIER', debit: supplierBase, credit: 0 },
      { role: 'TREASURY', debit: 0, credit: treasuryBase },
    ];
    if (new Prisma.Decimal(fx.gain).gt(0)) {
      lines.push({ role: 'FX_GAIN', debit: 0, credit: fx.gain });
    }
    if (new Prisma.Decimal(fx.loss).gt(0)) {
      lines.push({ role: 'FX_LOSS', debit: fx.loss, credit: 0 });
    }
    this.calculator.assertBalanced(lines);
    return this.prisma.$transaction(
      async (tx) => {
        const letter = `LT-${proposal.numero}`;
        const context = await this.ledger.context(
          tx,
          proposal.societeId,
          'PAIEMENT_FOURNISSEUR',
          date,
          {
            treasuryCompteComptableId:
              proposal.compteTresorerie.compteComptableId,
          },
        );
        const treasuryMapping = context.template.lignes.find(
          (line) => line.role === 'TRESORERIE',
        );
        if (
          !treasuryMapping ||
          treasuryMapping.compteId !==
            proposal.compteTresorerie.compteComptableId
        ) {
          throw new BadRequestException(
            'Le modèle de paiement ne pointe pas vers le compte comptable du compte de trésorerie sélectionné.',
          );
        }
        const entry = await this.ledger.createEntry(tx, {
          context,
          sourceType: 'PAIEMENT_FOURNISSEUR',
          sourceId: proposal.id,
          factureId: first.factureId,
          label: `Paiement ${proposal.numero}`,
          date,
          currency: proposal.devise,
          rate: paymentRate,
          operationId: dto.clientOperationId,
          authorId: user.userId,
          supplierId: first.facture.fournisseurId,
          lines,
          lettrage: letter,
        });
        const payment = await tx.paiementFournisseur.create({
          data: {
            factureId: first.factureId,
            propositionId: proposal.id,
            compteTresorerieId: proposal.compteTresorerieId,
            ecritureComptableId: entry.id,
            montant: treasuryBase,
            montantDevise: proposal.montant,
            devise: proposal.devise,
            tauxChangeSnapshot: paymentRate,
            mode: proposal.mode,
            reference: dto.reference?.trim() || proposal.referenceInstruction,
            clientOperationId: dto.clientOperationId,
            utilisateurId: user.userId,
          },
        });
        await tx.mouvementTresorerie.create({
          data: {
            compteId: proposal.compteTresorerieId,
            paiementId: payment.id,
            sens: 'SORTIE',
            montant: treasuryBase,
            devise: proposal.compteTresorerie.devise,
            dateValeur: date,
            reference: payment.reference,
            clientOperationId: dto.clientOperationId,
          },
        });
        for (const allocation of proposal.allocations) {
          await tx.allocationPaiementFournisseur.update({
            where: { id: allocation.id },
            data: { paiementId: payment.id, lettrage: letter },
          });
          await tx.ligneEcritureComptable.updateMany({
            where: {
              roleSnapshot: 'FOURNISSEUR',
              ecriture: {
                factureId: allocation.factureId,
                sourceType: {
                  in: ['FACTURE_FOURNISSEUR', 'AVOIR_FOURNISSEUR'],
                },
              },
            },
            data: { lettrage: letter, dateLettrage: date },
          });
          const totalPaid = await tx.allocationPaiementFournisseur.aggregate({
            where: {
              factureId: allocation.factureId,
              proposition: { paiement: { isNot: null } },
            },
            _sum: { montant: true },
          });
          const due =
            allocation.facture.netAPayer ?? allocation.facture.montant;
          await tx.factureFournisseur.update({
            where: { id: allocation.factureId },
            data: {
              statut: new Prisma.Decimal(totalPaid._sum.montant ?? 0).eq(due)
                ? 'PAYEE'
                : 'PARTIELLEMENT_PAYEE',
            },
          });
        }
        await tx.propositionPaiementFournisseur.update({
          where: { id },
          data: {
            statut: 'EXECUTEE',
            executeurId: user.userId,
            dateExecution: date,
          },
        });
        await this.audit(
          tx,
          user.userId,
          'PAIEMENT_FOURNISSEUR_EXECUTE',
          payment.id,
          {
            propositionId: id,
            ecritureId: entry.id,
          },
        );
        return payment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  importBankStatement(dto: ImportBankStatementDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.compteTresorerie.findFirst({
        where: {
          id: dto.compteTresorerieId,
          societeId: dto.societeId,
          actif: true,
        },
      });
      if (!account) {
        throw new BadRequestException(
          'Compte de trésorerie actif introuvable pour cette société.',
        );
      }
      const imported = await tx.importReleveBancaire.create({
        data: {
          societeId: dto.societeId,
          compteId: dto.compteTresorerieId,
          nomFichier: dto.nomFichier,
          hashSha256: dto.hashSha256.toLowerCase(),
          format: dto.format,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          clientOperationId: dto.clientOperationId,
          lignes: {
            create: dto.lignes.map((line) => ({
              numeroLigne: line.numeroLigne,
              dateOperation: new Date(line.dateOperation),
              dateValeur: line.dateValeur ? new Date(line.dateValeur) : null,
              libelle: line.libelle,
              reference: line.reference,
              montant: line.montant,
              devise: line.devise,
              metadata: line.metadata as Prisma.InputJsonValue | undefined,
            })),
          },
        },
        include: { lignes: true },
      });
      await this.audit(
        tx,
        user.userId,
        'RELEVE_BANCAIRE_IMPORTED',
        imported.id,
        {
          hashSha256: imported.hashSha256,
          lignes: imported.lignes.length,
        },
      );
      return imported;
    });
  }

  async reconcile(
    lineId: string,
    dto: ReconcileBankLineDto,
    user: AuthenticatedUser,
  ) {
    const [line, movement] = await Promise.all([
      this.prisma.ligneReleveBancaire.findUnique({
        where: { id: lineId },
        include: { importReleve: true },
      }),
      this.prisma.mouvementTresorerie.findUnique({
        where: { id: dto.mouvementId },
      }),
    ]);
    if (!line || !movement)
      throw new NotFoundException('Ligne ou mouvement introuvable.');
    if (
      line.importReleve.compteId !== movement.compteId ||
      new Prisma.Decimal(line.montant).abs().toFixed(2) !==
        movement.montant.toFixed(2) ||
      line.devise !== movement.devise
    ) {
      throw new BadRequestException(
        'Compte, devise et montant doivent correspondre exactement.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const reconciliation = await tx.rapprochementBancaire.create({
        data: {
          ligneReleveId: lineId,
          mouvementId: movement.id,
          paiementId: movement.paiementId,
          auteurId: user.userId,
          clientOperationId: dto.clientOperationId,
        },
      });
      await this.audit(
        tx,
        user.userId,
        'MOUVEMENT_TRESORERIE_RAPPROCHE',
        reconciliation.id,
        {
          ligneReleveId: lineId,
          mouvementId: movement.id,
        },
      );
      return reconciliation;
    });
  }

  async trialBalance(
    query: AccountingReportQueryDto,
  ): Promise<TrialBalanceRow[]> {
    return this.prisma.$queryRaw<TrialBalanceRow[]>(Prisma.sql`
      SELECT c.id, c.numero, c.intitule,
             COALESCE(SUM(l.debit), 0)::text AS debit,
             COALESCE(SUM(l.credit), 0)::text AS credit,
             COALESCE(SUM(l.debit-l.credit), 0)::text AS solde
      FROM compte_comptable c
      LEFT JOIN ligne_ecriture_comptable l ON l."compteId" = c.id
      LEFT JOIN ecriture_comptable e ON e.id = l."ecritureId"
        AND e."dateComptable" BETWEEN ${new Date(query.du)} AND ${new Date(query.au)}
      WHERE c."societeId" = ${query.societeId}
      GROUP BY c.id, c.numero, c.intitule ORDER BY c.numero
    `);
  }

  generalLedger(query: AccountingReportQueryDto) {
    return this.prisma.ligneEcritureComptable.findMany({
      where: {
        ...(query.compteId ? { compteId: query.compteId } : {}),
        ecriture: {
          societeId: query.societeId,
          dateComptable: { gte: new Date(query.du), lte: new Date(query.au) },
          ...(query.journalId ? { journalId: query.journalId } : {}),
        },
      },
      include: {
        compte: true,
        ecriture: {
          include: {
            journal: {
              select: { id: true, code: true, libelle: true, type: true },
            },
          },
        },
      },
      orderBy: [{ ecriture: { dateComptable: 'asc' } }, { numeroLigne: 'asc' }],
    });
  }

  supplierAging(query: AccountingReportQueryDto) {
    return this.prisma.factureFournisseur.findMany({
      where: {
        societeId: query.societeId,
        statut: { in: ['COMPTABILISEE', 'PARTIELLEMENT_PAYEE', 'PAYEE'] },
        ...(query.fournisseurId ? { fournisseurId: query.fournisseurId } : {}),
      },
      include: {
        fournisseur: true,
        allocationsPaiement: {
          where: {
            OR: [
              { paiementId: { not: null } },
              { proposition: { paiement: { isNot: null } } },
            ],
          },
        },
      },
      orderBy: { dateEcheance: 'asc' },
    });
  }

  async accountingExport(query: AccountingReportQueryDto) {
    const rows = await this.prisma.ligneEcritureComptable.findMany({
      where: {
        ...(query.compteId ? { compteId: query.compteId } : {}),
        ecriture: {
          societeId: query.societeId,
          dateComptable: { gte: new Date(query.du), lte: new Date(query.au) },
        },
      },
      include: {
        compte: true,
        client: { select: { nom: true, prenom: true } },
        ecriture: { include: { journal: true } },
      },
      orderBy: [{ ecriture: { dateComptable: 'asc' } }, { numeroLigne: 'asc' }],
    });
    const fournisseurIds = [
      ...new Set(
        rows
          .map((row) => row.fournisseurId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const fournisseurs = fournisseurIds.length
      ? await this.prisma.fournisseur.findMany({
          where: { id: { in: fournisseurIds } },
          select: { id: true, nom: true },
        })
      : [];
    const fournisseurNom = new Map(
      fournisseurs.map((row) => [row.id, row.nom]),
    );
    return {
      format: 'SYSCOHADA_CSV_UTF8',
      generatedAt: new Date().toISOString(),
      journal: 'GRAND_LIVRE',
      rows: rows.map((row) => {
        const clientAux = row.client
          ? [row.client.nom, row.client.prenom].filter(Boolean).join(' ')
          : '';
        const fournisseurAux = row.fournisseurId
          ? (fournisseurNom.get(row.fournisseurId) ?? '')
          : '';
        return {
          date: row.ecriture.dateComptable.toISOString().slice(0, 10),
          journal: row.ecriture.journal.code,
          piece: row.ecriture.numero,
          pieceLibelle: row.ecriture.libelle,
          compte: row.compte.numero,
          compteIntitule: row.compte.intitule,
          auxiliaire: clientAux || fournisseurAux,
          libelle: row.libelle,
          debit: row.debit.toFixed(2),
          credit: row.credit.toFixed(2),
          devise: row.ecriture.devise,
          lettrage: row.lettrage,
          source: row.ecriture.sourceType,
        };
      }),
    };
  }

  async financialStatements(query: AccountingReportQueryDto) {
    const rows = await this.trialBalance(query);
    return buildSyscohadaStatements(rows);
  }

  async vatReturn(query: AccountingReportQueryDto) {
    const rows = await this.trialBalance(query);
    return buildVatReturn(rows);
  }

  async liasse(query: AccountingReportQueryDto): Promise<LiassePack> {
    const { pack } = await this.liasseWithSociete(query);
    return pack;
  }

  async liasseWithSociete(query: AccountingReportQueryDto) {
    const societe = await this.prisma.societe.findUniqueOrThrow({
      where: { id: query.societeId },
      select: {
        id: true,
        raisonSociale: true,
        adresse: true,
        telephone: true,
        email: true,
      },
    });
    const societeCount = await this.prisma.societe.count();
    const rowsN = await this.trialBalance(query);
    const prev = previousWindow(new Date(query.du), new Date(query.au));
    const rowsN1 = await this.trialBalance({
      ...query,
      du: prev.du.toISOString(),
      au: prev.au.toISOString(),
    });
    const notes = await this.liasseNotes(rowsN, query.societeId);
    return {
      societe,
      pack: buildSyscohadaLiasse({
        rowsN,
        rowsN1,
        perimetre: buildPerimetre({
          societeCount,
          societeLibelle: societe.raisonSociale,
        }),
        notes,
      }),
    };
  }

  async liasseAgregat(query: AccountingRangeQueryDto): Promise<LiassePack> {
    const societes = await this.prisma.societe.findMany({
      select: { id: true, raisonSociale: true },
      orderBy: { raisonSociale: 'asc' },
    });
    const prev = previousWindow(new Date(query.du), new Date(query.au));
    const packsN: TrialBalanceRow[][] = [];
    const packsN1: TrialBalanceRow[][] = [];
    for (const societe of societes) {
      packsN.push(
        await this.trialBalance({
          societeId: societe.id,
          du: query.du,
          au: query.au,
        }),
      );
      packsN1.push(
        await this.trialBalance({
          societeId: societe.id,
          du: prev.du.toISOString(),
          au: prev.au.toISOString(),
        }),
      );
    }
    const rowsN = mergeTrialBalances(packsN);
    const rowsN1 = mergeTrialBalances(packsN1);
    const notes = await this.liasseNotes(rowsN);
    return buildSyscohadaLiasse({
      rowsN,
      rowsN1,
      perimetre: buildPerimetre({
        societeCount: societes.length,
        societeLibelle:
          societes.length === 1 ? societes[0]?.raisonSociale : null,
        agregat: true,
      }),
      notes,
    });
  }

  private async liasseNotes(
    rows: TrialBalanceRow[],
    societeId?: string,
  ): Promise<LiasseNotes> {
    const vat = buildVatReturn(rows);
    const encours401 = rows
      .filter((row) => row.numero.replace(/\D/g, '').startsWith('401'))
      .reduce((sum, row) => sum + Math.max(-netSolde(row), 0), 0);
    const encours411 = rows
      .filter((row) => row.numero.replace(/\D/g, '').startsWith('411'))
      .reduce((sum, row) => sum + Math.max(netSolde(row), 0), 0);
    const immos = await this.prisma.immobilisation.findMany({
      where: societeId ? { societeId } : {},
      include: { dotations: true },
    });
    let brute = 0;
    let amortissements = 0;
    let source: LiasseNotes['immobilisations']['source'] = 'grand_livre';
    if (immos.length > 0) {
      source = 'registre';
      for (const immo of immos) {
        brute += Number(immo.valeurBrute);
        amortissements += immo.dotations.reduce(
          (sum, d) => sum + Number(d.montant),
          0,
        );
      }
    } else {
      for (const row of rows) {
        const n = row.numero.replace(/\D/g, '');
        if (n.startsWith('28')) {
          amortissements += Math.max(-netSolde(row), 0);
        } else if (n.startsWith('2')) {
          brute += Math.max(netSolde(row), 0);
        }
      }
    }
    return {
      methodes: [
        'Devise XOF',
        'Référentiel SYSCOHADA 2017 (AUDCIF)',
        'Inventaire permanent 31 / 603',
        'Amortissement linéaire mensuel (6813 / 28)',
      ],
      immobilisations: {
        brute: brute.toFixed(2),
        amortissements: amortissements.toFixed(2),
        nette: (brute - amortissements).toFixed(2),
        source,
      },
      encours: {
        fournisseurs401: encours401.toFixed(2),
        clients411: encours411.toFixed(2),
      },
      tva: {
        deductible: vat.deductible,
        collectee: vat.collectee,
        netAPayer: vat.netAPayer,
      },
    };
  }

  listTreasuryAccounts(societeId: string) {
    return this.prisma.compteTresorerie.findMany({
      where: { societeId, actif: true },
      include: {
        compteComptable: { select: { id: true, numero: true, intitule: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  listBankImports(societeId: string, compteTresorerieId?: string) {
    return this.prisma.importReleveBancaire.findMany({
      where: {
        societeId,
        ...(compteTresorerieId ? { compteId: compteTresorerieId } : {}),
      },
      include: {
        compte: { select: { id: true, code: true, libelle: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: { dateImport: 'desc' },
      take: 50,
    });
  }

  async unmatchedBank(societeId: string, compteTresorerieId: string) {
    const account = await this.prisma.compteTresorerie.findFirst({
      where: { id: compteTresorerieId, societeId },
    });
    if (!account)
      throw new NotFoundException('Compte de trésorerie introuvable.');
    const [lignes, mouvements] = await Promise.all([
      this.prisma.ligneReleveBancaire.findMany({
        where: {
          rapprochement: null,
          importReleve: { societeId, compteId: compteTresorerieId },
        },
        include: {
          importReleve: {
            select: { id: true, nomFichier: true, dateImport: true },
          },
        },
        orderBy: { dateOperation: 'desc' },
      }),
      this.prisma.mouvementTresorerie.findMany({
        where: { compteId: compteTresorerieId, rapprochements: { none: {} } },
        orderBy: { dateValeur: 'desc' },
      }),
    ]);
    const suggestions = suggestBankMatches(lignes, mouvements);
    return {
      lignes: lignes.map((row) => ({
        ...row,
        mouvementSuggereId: suggestions[row.id] ?? null,
      })),
      mouvements,
    };
  }

  async listOpenLettering(query: LetteringQueryDto) {
    const prefix = query.compte;
    const lines = await this.prisma.ligneEcritureComptable.findMany({
      where: {
        lettrage: null,
        compte: {
          societeId: query.societeId,
          numero: { startsWith: prefix },
          actif: true,
        },
        ecriture: { societeId: query.societeId },
      },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
        ecriture: {
          select: {
            id: true,
            numero: true,
            dateComptable: true,
            libelle: true,
            sourceType: true,
          },
        },
        client: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: [{ compteId: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const fournisseurs = await this.prisma.fournisseur.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              lines
                .map((line) => line.fournisseurId)
                .filter((id): id is string => Boolean(id)),
            ),
          ],
        },
      },
      select: { id: true, nom: true },
    });
    const byFournisseur = new Map(fournisseurs.map((row) => [row.id, row.nom]));
    return lines.map((line) => ({
      id: line.id,
      compte: line.compte,
      debit: line.debit.toFixed(2),
      credit: line.credit.toFixed(2),
      fournisseurId: line.fournisseurId,
      fournisseurNom: line.fournisseurId
        ? (byFournisseur.get(line.fournisseurId) ?? null)
        : null,
      clientId: line.clientId,
      client: line.client,
      ecriture: line.ecriture,
    }));
  }

  async letterLines(dto: LetterLinesDto, user: AuthenticatedUser) {
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(code)) {
      throw new BadRequestException(
        'Le code de lettrage doit contenir 1 à 12 caractères alphanumériques.',
      );
    }
    const uniqueIds = [...new Set(dto.ligneIds)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException(
        'Le lettrage exige au moins deux lignes distinctes.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const lines = await tx.ligneEcritureComptable.findMany({
        where: { id: { in: uniqueIds } },
        include: {
          compte: true,
          ecriture: { select: { societeId: true } },
        },
      });
      if (lines.length !== uniqueIds.length) {
        throw new NotFoundException('Une ligne de lettrage est introuvable.');
      }
      const compteId = lines[0].compteId;
      for (const line of lines) {
        if (line.ecriture.societeId !== dto.societeId) {
          throw new ForbiddenException(
            'Ligne hors du périmètre de la société.',
          );
        }
        if (line.compteId !== compteId) {
          throw new BadRequestException(
            'Toutes les lignes lettrées doivent porter le même compte.',
          );
        }
        if (line.lettrage) {
          throw new ConflictException(
            'Une ligne est déjà lettrée : le code posé est immuable.',
          );
        }
      }
      const numero = lines[0].compte.numero;
      if (!numero.startsWith('401') && !numero.startsWith('411')) {
        throw new BadRequestException(
          'Le lettrage manuel est limité aux comptes 401 et 411.',
        );
      }
      if (numero.startsWith('401')) {
        const supplierId = lines[0].fournisseurId;
        if (
          !supplierId ||
          lines.some((line) => line.fournisseurId !== supplierId)
        ) {
          throw new BadRequestException(
            'Le lettrage 401 exige le même fournisseur sur toutes les lignes.',
          );
        }
      } else {
        const clientId = lines[0].clientId;
        if (!clientId || lines.some((line) => line.clientId !== clientId)) {
          throw new BadRequestException(
            'Le lettrage 411 exige le même client sur toutes les lignes.',
          );
        }
      }
      const debit = lines.reduce(
        (sum, line) => sum.plus(line.debit),
        new Prisma.Decimal(0),
      );
      const credit = lines.reduce(
        (sum, line) => sum.plus(line.credit),
        new Prisma.Decimal(0),
      );
      if (!debit.eq(credit) || debit.isZero()) {
        throw new BadRequestException(
          `Lettrage déséquilibré : débit ${debit.toFixed(2)}, crédit ${credit.toFixed(2)}.`,
        );
      }
      const now = new Date();
      for (const line of lines) {
        await tx.ligneEcritureComptable.update({
          where: { id: line.id },
          data: { lettrage: code, dateLettrage: now },
        });
      }
      await this.audit(
        tx,
        user.userId,
        'LETTRAGE_MANUEL',
        dto.clientOperationId,
        {
          code,
          ligneIds: uniqueIds,
          compteId,
        },
      );
      return { code, ligneIds: uniqueIds };
    });
  }

  async stornoEntry(id: string, dto: StornoEntryDto, user: AuthenticatedUser) {
    const replay = await this.prisma.ecritureComptable.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    const existingStorno = await this.prisma.ecritureComptable.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: 'OD_MANUELLE',
          sourceId: `storno:${id}`,
        },
      },
      include: { lignes: true },
    });
    if (existingStorno) return existingStorno;
    const original = await this.prisma.ecritureComptable.findUnique({
      where: { id },
      include: { lignes: { include: { compte: true } } },
    });
    if (!original || original.societeId !== dto.societeId) {
      throw new NotFoundException('Écriture introuvable.');
    }
    if (original.sourceId.startsWith('storno:')) {
      throw new BadRequestException(
        'On ne storno pas un storno : saisissez une OD de compensation si besoin.',
      );
    }
    const label = libelleOdAvecPiece(
      dto.referencePiece,
      dto.libelle?.trim() || `Storno ${original.numero}`,
    );
    const lines: CalculatedPostingLine[] = original.lignes.map((line) => ({
      role: line.debit.gt(0) ? 'EXPENSE' : 'SALE',
      debit: line.credit,
      credit: line.debit,
      compteId: line.compteId,
    }));
    this.calculator.assertBalanced(lines);
    const date = dto.dateComptable
      ? new Date(dto.dateComptable)
      : original.dateComptable;
    const supplierId =
      original.lignes.find((line) => line.fournisseurId)?.fournisseurId ?? null;
    const clientId =
      original.lignes.find((line) => line.clientId)?.clientId ?? null;
    return this.prisma.$transaction(
      async (tx) => {
        const context = await this.ledger.context(
          tx,
          dto.societeId,
          'OD_MANUELLE',
          date,
        );
        const created = await this.ledger.createEntry(tx, {
          context,
          sourceType: 'OD_MANUELLE',
          sourceId: `storno:${id}`,
          label,
          date,
          currency: original.devise,
          operationId: dto.clientOperationId,
          authorId: user.userId,
          supplierId,
          clientId,
          lines,
        });
        await this.audit(tx, user.userId, 'OD_STORNO_POSTEE', created.id, {
          originalId: id,
          referencePiece: dto.referencePiece.trim(),
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async postManualJournal(dto: ManualJournalDto, user: AuthenticatedUser) {
    const replay = await this.prisma.ecritureComptable.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: { lignes: true },
    });
    if (replay) return replay;
    const label = libelleOdAvecPiece(dto.referencePiece, dto.libelle);
    const lines: CalculatedPostingLine[] = dto.lignes.map((line) => ({
      role: line.debit > 0 ? 'EXPENSE' : 'SALE',
      debit: line.debit,
      credit: line.credit,
      compteId: line.compteId,
    }));
    this.calculator.assertBalanced(lines);
    const date = new Date(dto.dateComptable);
    return this.prisma.$transaction(
      async (tx) => {
        const context = await this.ledger.context(
          tx,
          dto.societeId,
          'OD_MANUELLE',
          date,
        );
        const created = await this.ledger.createEntry(tx, {
          context,
          sourceType: 'OD_MANUELLE',
          sourceId: dto.clientOperationId,
          label,
          date,
          currency: (dto.devise ?? 'XOF').toUpperCase(),
          operationId: dto.clientOperationId,
          authorId: user.userId,
          lines,
        });
        await this.audit(tx, user.userId, 'OD_MANUELLE_POSTEE', created.id, {
          libelle: dto.libelle,
          referencePiece: dto.referencePiece.trim(),
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async closeExercice(
    exerciceId: string,
    dto: CloseExerciceDto,
    user: AuthenticatedUser,
  ) {
    const exercice = await this.prisma.exerciceComptable.findFirst({
      where: { id: exerciceId, societeId: dto.societeId },
      include: { periodes: true, journaux: true },
    });
    if (!exercice) throw new NotFoundException('Exercice introuvable.');
    if (exercice.cloture) return exercice;
    const openPeriods = exercice.periodes.filter((row) => !row.cloture);
    const resultat = await this.prisma.compteComptable.findFirst({
      where: { societeId: dto.societeId, numero: '13', actif: true },
    });
    if (!resultat) {
      throw new BadRequestException(
        'Le compte 13 Résultat net doit exister avant la clôture d’exercice.',
      );
    }
    const du = exercice.dateDebut.toISOString().slice(0, 10);
    const au = exercice.dateFin.toISOString().slice(0, 10);
    const rows = await this.trialBalance({
      societeId: dto.societeId,
      du,
      au,
    });
    const closingLines: CalculatedPostingLine[] = [];
    const openingLines: CalculatedPostingLine[] = [];
    for (const row of rows) {
      const solde = netSolde(row);
      if (Math.abs(solde) < 0.005) continue;
      const account = await this.prisma.compteComptable.findFirst({
        where: { societeId: dto.societeId, numero: row.numero },
      });
      if (!account) continue;
      const classe = classeCompte(row.numero);
      if (classe === '6' || classe === '7') {
        if (solde > 0) {
          closingLines.push({
            role: 'EXPENSE',
            debit: 0,
            credit: solde,
            compteId: account.id,
          });
          closingLines.push({
            role: 'SALE',
            debit: solde,
            credit: 0,
            compteId: resultat.id,
          });
        } else {
          const amount = Math.abs(solde);
          closingLines.push({
            role: 'SALE',
            debit: amount,
            credit: 0,
            compteId: account.id,
          });
          closingLines.push({
            role: 'EXPENSE',
            debit: 0,
            credit: amount,
            compteId: resultat.id,
          });
        }
      } else if (['1', '2', '3', '4', '5'].includes(classe)) {
        if (solde > 0) {
          openingLines.push({
            role: 'EXPENSE',
            debit: solde,
            credit: 0,
            compteId: account.id,
          });
        } else {
          openingLines.push({
            role: 'SALE',
            debit: 0,
            credit: Math.abs(solde),
            compteId: account.id,
          });
        }
      }
    }
    const lastPeriod = [...exercice.periodes].sort(
      (a, b) => b.dateFin.getTime() - a.dateFin.getTime(),
    )[0];
    return this.prisma.$transaction(
      async (tx) => {
        const nextCode = String(Number(exercice.code) + 1);
        if (!Number.isFinite(Number(nextCode))) {
          throw new BadRequestException(
            'Code d’exercice non numérique : clôture refusée.',
          );
        }
        const nextStart = new Date(Date.UTC(Number(nextCode), 0, 1));
        const nextEnd = new Date(
          Date.UTC(Number(nextCode), 11, 31, 23, 59, 59, 999),
        );
        const next = await tx.exerciceComptable.upsert({
          where: {
            societeId_code: { societeId: dto.societeId, code: nextCode },
          },
          update: {},
          create: {
            societeId: dto.societeId,
            code: nextCode,
            dateDebut: nextStart,
            dateFin: nextEnd,
            cloture: false,
          },
        });
        await this.scaffoldExercice(tx, dto.societeId, next);
        if (closingLines.length >= 2) {
          const closeDate = lastPeriod?.dateFin ?? exercice.dateFin;
          const context = await this.ledger.context(
            tx,
            dto.societeId,
            'CLOTURE_EXERCICE',
            closeDate,
          );
          await this.ledger.createEntry(tx, {
            context,
            sourceType: 'CLOTURE_EXERCICE',
            sourceId: `cloture-${exercice.id}`,
            label: `Clôture exercice ${exercice.code}`,
            date: closeDate,
            currency: 'XOF',
            operationId: `${dto.clientOperationId}-cloture`,
            authorId: user.userId,
            lines: closingLines,
          });
        }
        if (openingLines.length >= 2) {
          const openDate = nextStart;
          const context = await this.ledger.context(
            tx,
            dto.societeId,
            'A_NOUVEAUX',
            openDate,
          );
          await this.ledger.createEntry(tx, {
            context,
            sourceType: 'A_NOUVEAUX',
            sourceId: `an-${exercice.id}`,
            label: `À-nouveaux exercice ${nextCode}`,
            date: openDate,
            currency: 'XOF',
            operationId: `${dto.clientOperationId}-an`,
            authorId: user.userId,
            lines: openingLines,
          });
        }
        for (const period of openPeriods) {
          await tx.periodeComptable.update({
            where: { id: period.id },
            data: { cloture: true },
          });
        }
        const closed = await tx.exerciceComptable.update({
          where: { id: exercice.id },
          data: { cloture: true },
        });
        await this.audit(tx, user.userId, 'EXERCICE_CLOTURE', exercice.id, {
          suivant: next.code,
        });
        return closed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listPeriods(societeId: string) {
    return this.prisma.periodeComptable.findMany({
      where: { societeId },
      include: {
        exercice: { select: { id: true, code: true, cloture: true } },
      },
      orderBy: { dateDebut: 'desc' },
    });
  }

  listExercices(societeId: string) {
    return this.prisma.exerciceComptable.findMany({
      where: { societeId },
      include: {
        _count: { select: { periodes: true, journaux: true, ecritures: true } },
      },
      orderBy: { code: 'desc' },
    });
  }

  async openExercice(dto: OpenExerciceDto, user: AuthenticatedUser) {
    const year = Number(dto.code);
    if (!Number.isInteger(year) || dto.code !== String(year)) {
      throw new BadRequestException(
        'Le code d’exercice doit être une année (ex. 2027).',
      );
    }
    const dateDebut = dto.dateDebut
      ? new Date(dto.dateDebut)
      : new Date(Date.UTC(year, 0, 1));
    const dateFin = dto.dateFin
      ? new Date(dto.dateFin)
      : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    if (!(dateDebut < dateFin)) {
      throw new BadRequestException(
        'L’exercice doit avoir une date de fin postérieure au début.',
      );
    }
    const existing = await this.prisma.exerciceComptable.findUnique({
      where: { societeId_code: { societeId: dto.societeId, code: dto.code } },
    });
    if (existing?.cloture) {
      throw new ConflictException(
        `L’exercice ${dto.code} est déjà clôturé : il ne peut pas être rouvert.`,
      );
    }
    const overlap = await this.prisma.exerciceComptable.findFirst({
      where: {
        societeId: dto.societeId,
        dateDebut: { lte: dateFin },
        dateFin: { gte: dateDebut },
        NOT: { code: dto.code },
      },
    });
    if (overlap) {
      throw new ConflictException(
        `L’exercice ${overlap.code} chevauche déjà ces dates.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const exercice = await tx.exerciceComptable.upsert({
        where: { societeId_code: { societeId: dto.societeId, code: dto.code } },
        update: { dateDebut, dateFin },
        create: {
          societeId: dto.societeId,
          code: dto.code,
          dateDebut,
          dateFin,
          cloture: false,
        },
      });
      await this.scaffoldExercice(tx, dto.societeId, exercice);
      await this.audit(tx, user.userId, 'EXERCICE_OUVERT', exercice.id, {
        code: exercice.code,
        clientOperationId: dto.clientOperationId,
      });
      return tx.exerciceComptable.findUniqueOrThrow({
        where: { id: exercice.id },
        include: {
          _count: {
            select: { periodes: true, journaux: true, ecritures: true },
          },
        },
      });
    });
  }

  private async scaffoldExercice(
    tx: Prisma.TransactionClient,
    societeId: string,
    exercice: { id: string; code: string; dateDebut: Date },
  ) {
    const source = await tx.exerciceComptable.findFirst({
      where: { societeId, id: { not: exercice.id } },
      include: { journaux: true },
      orderBy: { code: 'desc' },
    });
    const journals =
      source && source.journaux.length > 0
        ? source.journaux
        : JOURNAUX_EXERCICE_DEFAUT.map((journal) => ({
            ...journal,
            actif: true,
          }));
    const journalByCode = new Map<string, string>();
    for (const journal of journals) {
      const cloned = await tx.journalComptable.upsert({
        where: {
          exerciceId_code: { exerciceId: exercice.id, code: journal.code },
        },
        update: { libelle: journal.libelle, type: journal.type, actif: true },
        create: {
          societeId,
          exerciceId: exercice.id,
          code: journal.code,
          libelle: journal.libelle,
          type: journal.type,
          actif: true,
        },
      });
      journalByCode.set(journal.code, cloned.id);
    }
    const templates = await tx.modeleComptabilisation.findMany({
      where: {
        societeId,
        actif: true,
        ...(source ? { journal: { exerciceId: source.id } } : {}),
      },
      include: { journal: true, lignes: true },
    });
    for (const template of templates) {
      const nextJournalId = journalByCode.get(template.journal.code);
      if (!nextJournalId || nextJournalId === template.journalId) continue;
      const latest = await tx.modeleComptabilisation.findFirst({
        where: { societeId, code: template.code },
        orderBy: { version: 'desc' },
      });
      if (latest && latest.journalId === nextJournalId) continue;
      await tx.modeleComptabilisation.create({
        data: {
          societeId,
          journalId: nextJournalId,
          code: template.code,
          version: (latest?.version ?? template.version) + 1,
          sourceType: template.sourceType,
          valideDu: exercice.dateDebut,
          actif: true,
          lignes: {
            create: template.lignes.map((line) => ({
              role: line.role,
              compteId: line.compteId,
              ordre: line.ordre,
              libelle: line.libelle,
            })),
          },
        },
      });
    }
    const year = Number(exercice.code);
    if (!Number.isInteger(year)) return;
    for (const period of periodesMensuellesExercice(year)) {
      await tx.periodeComptable.upsert({
        where: {
          exerciceId_code: { exerciceId: exercice.id, code: period.code },
        },
        update: {},
        create: {
          societeId,
          exerciceId: exercice.id,
          code: period.code,
          dateDebut: period.dateDebut,
          dateFin: period.dateFin,
        },
      });
    }
  }

  async openPeriod(
    dto: {
      societeId: string;
      code: string;
      dateDebut: string;
      dateFin: string;
    },
    user: AuthenticatedUser,
  ) {
    const debut = new Date(dto.dateDebut);
    const fin = new Date(dto.dateFin);
    if (!(debut < fin)) {
      throw new BadRequestException(
        'La période doit avoir une date de fin postérieure au début.',
      );
    }
    const exercice = await this.prisma.exerciceComptable.findFirst({
      where: {
        societeId: dto.societeId,
        cloture: false,
        dateDebut: { lte: debut },
        dateFin: { gte: fin },
      },
    });
    if (!exercice) {
      throw new BadRequestException(
        'Aucun exercice ouvert ne couvre cette période.',
      );
    }
    const overlap = await this.prisma.periodeComptable.findFirst({
      where: {
        exerciceId: exercice.id,
        cloture: false,
        dateDebut: { lte: fin },
        dateFin: { gte: debut },
      },
    });
    if (overlap) {
      throw new ConflictException(
        `Une période ouverte chevauche déjà ces dates (${overlap.code}).`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.periodeComptable.create({
        data: {
          societeId: dto.societeId,
          exerciceId: exercice.id,
          code: dto.code.trim(),
          dateDebut: debut,
          dateFin: fin,
        },
      });
      await this.audit(
        tx,
        user.userId,
        'PERIODE_COMPTABLE_OUVERTE',
        period.id,
        {
          code: period.code,
        },
      );
      return period;
    });
  }

  async closePeriod(id: string, user: AuthenticatedUser) {
    const period = await this.prisma.periodeComptable.findUnique({
      where: { id },
    });
    if (!period) throw new NotFoundException('Période comptable introuvable.');
    if (period.cloture) return period;
    return this.prisma.$transaction(async (tx) => {
      const closed = await tx.periodeComptable.update({
        where: { id },
        data: { cloture: true },
      });
      await this.audit(tx, user.userId, 'PERIODE_COMPTABLE_CLOTUREE', id, {
        code: closed.code,
      });
      return closed;
    });
  }

  async listJournals(societeId: string, exerciceId?: string) {
    const [items, exercices] = await Promise.all([
      this.prisma.journalComptable.findMany({
        where: { societeId, ...(exerciceId ? { exerciceId } : {}) },
        include: {
          exercice: { select: { id: true, code: true, cloture: true } },
          _count: { select: { ecritures: true, modeles: true } },
        },
        orderBy: [{ exercice: { code: 'desc' } }, { code: 'asc' }],
      }),
      this.prisma.exerciceComptable.findMany({
        where: { societeId },
        select: {
          id: true,
          code: true,
          cloture: true,
          dateDebut: true,
          dateFin: true,
        },
        orderBy: { code: 'desc' },
      }),
    ]);
    return { items, exercices };
  }

  async createJournal(dto: CreateJournalComptableDto, user: AuthenticatedUser) {
    const exercice = await this.prisma.exerciceComptable.findFirst({
      where: { id: dto.exerciceId, societeId: dto.societeId },
    });
    if (!exercice) {
      throw new BadRequestException('L’exercice doit appartenir à la société.');
    }
    if (exercice.cloture) {
      throw new BadRequestException(
        'Impossible de créer un journal sur un exercice clôturé.',
      );
    }
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.journalComptable.findUnique({
      where: { exerciceId_code: { exerciceId: exercice.id, code } },
    });
    if (existing) {
      throw new ConflictException(
        `Le journal ${code} existe déjà sur l’exercice ${exercice.code}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const journal = await tx.journalComptable.create({
        data: {
          societeId: dto.societeId,
          exerciceId: exercice.id,
          code,
          libelle: dto.libelle.trim(),
          type: dto.type,
          actif: true,
        },
        include: {
          exercice: { select: { id: true, code: true, cloture: true } },
          _count: { select: { ecritures: true, modeles: true } },
        },
      });
      await this.audit(
        tx,
        user.userId,
        'JOURNAL_COMPTABLE_CREATED',
        journal.id,
        {
          code: journal.code,
          type: journal.type,
        },
      );
      return journal;
    });
  }

  async updateJournal(
    id: string,
    dto: UpdateJournalComptableDto,
    user: AuthenticatedUser,
  ) {
    const journal = await this.prisma.journalComptable.findUnique({
      where: { id },
      include: { exercice: true },
    });
    if (!journal) throw new NotFoundException('Journal comptable introuvable.');
    if (dto.libelle === undefined && dto.actif === undefined) {
      throw new BadRequestException('Aucune modification à enregistrer.');
    }
    if (dto.actif === false && journal.exercice.cloture) {
      throw new BadRequestException(
        'Un journal d’un exercice clôturé ne peut plus être désactivé.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.journalComptable.update({
        where: { id },
        data: {
          ...(dto.libelle !== undefined ? { libelle: dto.libelle.trim() } : {}),
          ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
        },
        include: {
          exercice: { select: { id: true, code: true, cloture: true } },
          _count: { select: { ecritures: true, modeles: true } },
        },
      });
      await this.audit(tx, user.userId, 'JOURNAL_COMPTABLE_UPDATED', id, {
        code: updated.code,
        libelle: updated.libelle,
        actif: updated.actif,
      });
      return updated;
    });
  }

  listAccounts(societeId: string) {
    return this.prisma.compteComptable.findMany({
      where: { societeId },
      include: {
        parent: { select: { id: true, numero: true, intitule: true } },
      },
      orderBy: { numero: 'asc' },
    });
  }

  async createAccount(dto: CreateCompteComptableDto, user: AuthenticatedUser) {
    const numero = dto.numero.trim();
    if (!/^[0-9]{1,8}$/.test(numero)) {
      throw new BadRequestException(
        'Le numéro de compte doit contenir 1 à 8 chiffres (plan SYSCOHADA).',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      let parentId = dto.parentId ?? null;
      if (parentId) {
        const parent = await tx.compteComptable.findFirst({
          where: { id: parentId, societeId: dto.societeId },
        });
        if (!parent) {
          throw new BadRequestException(
            'Compte parent introuvable pour cette société.',
          );
        }
      } else {
        for (let i = numero.length - 1; i >= 1; i -= 1) {
          const parent = await tx.compteComptable.findUnique({
            where: {
              societeId_numero: {
                societeId: dto.societeId,
                numero: numero.slice(0, i),
              },
            },
          });
          if (parent) {
            parentId = parent.id;
            break;
          }
        }
      }
      const created = await tx.compteComptable.create({
        data: {
          societeId: dto.societeId,
          numero,
          intitule: dto.intitule.trim(),
          parentId,
          actif: dto.actif ?? true,
        },
      });
      await this.audit(
        tx,
        user.userId,
        'COMPTE_COMPTABLE_CREATED',
        created.id,
        {
          numero: created.numero,
        },
      );
      return created;
    });
  }

  async updateAccount(
    id: string,
    dto: UpdateCompteComptableDto,
    user: AuthenticatedUser,
  ) {
    const account = await this.prisma.compteComptable.findUnique({
      where: { id },
      include: { _count: { select: { lignesEcriture: true } } },
    });
    if (!account) throw new NotFoundException('Compte comptable introuvable.');
    if (
      dto.numero &&
      dto.numero.trim() !== account.numero &&
      account._count.lignesEcriture > 0
    ) {
      throw new BadRequestException(
        'Le numéro d’un compte déjà mouvementé est immuable.',
      );
    }
    if (dto.numero && !/^[0-9]{1,8}$/.test(dto.numero.trim())) {
      throw new BadRequestException(
        'Le numéro de compte doit contenir 1 à 8 chiffres.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.compteComptable.update({
        where: { id },
        data: {
          ...(dto.numero ? { numero: dto.numero.trim() } : {}),
          ...(dto.intitule ? { intitule: dto.intitule.trim() } : {}),
          ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        },
      });
      await this.audit(tx, user.userId, 'COMPTE_COMPTABLE_UPDATED', id, {
        numero: updated.numero,
        actif: updated.actif,
      });
      return updated;
    });
  }

  listExpenseNatures(societeId: string) {
    return this.prisma.natureDepense.findMany({
      where: { societeId },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async createExpenseNature(
    dto: CreateNatureDepenseDto,
    user: AuthenticatedUser,
  ) {
    const compte = await this.prisma.compteComptable.findFirst({
      where: { id: dto.compteId, societeId: dto.societeId, actif: true },
    });
    if (!compte) {
      throw new BadRequestException('Compte 6xx introuvable ou inactif.');
    }
    if (!compte.numero.startsWith('6')) {
      throw new BadRequestException(
        'Une nature de dépense doit pointer vers un compte de classe 6.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.natureDepense.create({
        data: {
          societeId: dto.societeId,
          code: dto.code.trim().toUpperCase(),
          libelle: dto.libelle.trim(),
          compteId: dto.compteId,
          actif: dto.actif ?? true,
        },
        include: {
          compte: { select: { id: true, numero: true, intitule: true } },
        },
      });
      await this.audit(tx, user.userId, 'NATURE_DEPENSE_CREATED', created.id, {
        code: created.code,
        compte: compte.numero,
      });
      return created;
    });
  }

  async updateExpenseNature(
    id: string,
    dto: UpdateNatureDepenseDto,
    user: AuthenticatedUser,
  ) {
    const nature = await this.prisma.natureDepense.findUnique({
      where: { id },
    });
    if (!nature) throw new NotFoundException('Nature de dépense introuvable.');
    if (dto.compteId) {
      const compte = await this.prisma.compteComptable.findFirst({
        where: { id: dto.compteId, societeId: nature.societeId, actif: true },
      });
      if (!compte || !compte.numero.startsWith('6')) {
        throw new BadRequestException(
          'Une nature de dépense doit pointer vers un compte de classe 6 actif.',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.natureDepense.update({
        where: { id },
        data: {
          ...(dto.libelle ? { libelle: dto.libelle.trim() } : {}),
          ...(dto.compteId ? { compteId: dto.compteId } : {}),
          ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
        },
        include: {
          compte: { select: { id: true, numero: true, intitule: true } },
        },
      });
      await this.audit(tx, user.userId, 'NATURE_DEPENSE_UPDATED', id, {
        code: updated.code,
        actif: updated.actif,
      });
      return updated;
    });
  }

  async customerAging(query: AccountingReportQueryDto) {
    const au = new Date(query.au);
    const lines = await this.prisma.ligneEcritureComptable.findMany({
      where: {
        roleSnapshot: 'CLIENT',
        lettrage: null,
        compte: { numero: { startsWith: '411' }, societeId: query.societeId },
        ecriture: {
          societeId: query.societeId,
          dateComptable: { lte: au },
        },
      },
      include: {
        client: { select: { id: true, nom: true, prenom: true } },
        ecriture: {
          select: { dateComptable: true, numero: true, libelle: true },
        },
      },
    });
    const grouped = new Map<
      string,
      {
        clientId: string | null;
        client: { id: string; nom: string; prenom: string | null } | null;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        dateEcheance: Date | null;
      }
    >();
    for (const line of lines) {
      const key = line.clientId ?? 'ANONYME';
      const current = grouped.get(key) ?? {
        clientId: line.clientId,
        client: line.client,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
        dateEcheance: line.ecriture.dateComptable,
      };
      current.debit = current.debit.plus(line.debit);
      current.credit = current.credit.plus(line.credit);
      if (
        !current.dateEcheance ||
        line.ecriture.dateComptable < current.dateEcheance
      ) {
        current.dateEcheance = line.ecriture.dateComptable;
      }
      grouped.set(key, current);
    }
    return [...grouped.values()].map((row) => ({
      id: row.clientId ?? 'anonyme',
      numero: row.client
        ? `${row.client.nom} ${row.client.prenom ?? ''}`.trim()
        : 'Ventes anonymes',
      fournisseur: row.client
        ? {
            id: row.client.id,
            nom: `${row.client.nom} ${row.client.prenom ?? ''}`.trim(),
          }
        : { id: 'anonyme', nom: 'Ventes anonymes' },
      dateEcheance: row.dateEcheance?.toISOString() ?? null,
      montant: row.debit.toFixed(2),
      netAPayer: row.debit.minus(row.credit).toFixed(2),
      allocationsPaiement: row.credit.gt(0)
        ? [{ montant: row.credit.toFixed(2) }]
        : [],
    }));
  }

  listPostingQueue(
    societeId: string,
    statut?: 'EN_ATTENTE' | 'POSTEE' | 'ERREUR',
  ) {
    if (!this.salesGl) {
      throw new BadRequestException(
        'Service de file d’écritures indisponible.',
      );
    }
    return this.salesGl.listQueue(societeId, statut);
  }

  flushPostingQueue(societeId: string, user: AuthenticatedUser) {
    if (!this.salesGl) {
      throw new BadRequestException(
        'Service de file d’écritures indisponible.',
      );
    }
    return this.salesGl.flushQueue(societeId, user.userId);
  }

  backfillOperationalSales(societeId: string, user: AuthenticatedUser) {
    if (!this.salesGl) {
      throw new BadRequestException(
        'Service de file d’écritures indisponible.',
      );
    }
    return this.salesGl.backfillOperational(societeId, user.userId);
  }

  private resolveInvoiceSociete(invoice: {
    societeId: string;
    lignes: Array<{
      ligneCommande?: { commande: { societeId: string | null } } | null;
    }>;
  }) {
    if (invoice.societeId) return invoice.societeId;
    const societeIds = new Set(
      invoice.lignes
        .map((line) => line.ligneCommande?.commande.societeId)
        .filter((id): id is string => Boolean(id)),
    );
    if (societeIds.size !== 1) {
      throw new BadRequestException(
        'La facture doit être rattachée à une société unique.',
      );
    }
    return [...societeIds][0];
  }

  private loadProposal(id: string) {
    return this.prisma.propositionPaiementFournisseur.findUniqueOrThrow({
      where: { id },
      include: {
        compteTresorerie: true,
        allocations: { include: { facture: true } },
      },
    });
  }

  private paymentProposalWhere(
    query: PaymentProposalListQueryDto,
    user: AuthenticatedUser,
  ): Prisma.PropositionPaiementFournisseurWhereInput {
    return {
      ...this.paymentProposalScope(user),
      ...(query.societeId ? { societeId: query.societeId } : {}),
      ...(query.statut ? { statut: query.statut } : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.fournisseurId
        ? {
            allocations: {
              some: { facture: { fournisseurId: query.fournisseurId } },
            },
          }
        : {}),
      ...(query.dateExecutionDu || query.dateExecutionAu
        ? {
            dateExecutionPrevue: {
              ...(query.dateExecutionDu
                ? { gte: new Date(query.dateExecutionDu) }
                : {}),
              ...(query.dateExecutionAu
                ? { lte: new Date(query.dateExecutionAu) }
                : {}),
            },
          }
        : {}),
    };
  }

  private paymentProposalScope(
    user: AuthenticatedUser,
  ): Prisma.PropositionPaiementFournisseurWhereInput {
    return user.role === RoleLibelle.CAISSIER_CENTRAL
      ? { compteTresorerie: { type: 'CENTRAL_CASH' } }
      : {};
  }

  private assertModeAccount(
    mode: ModePaiementFournisseur,
    type: 'BANK' | 'CENTRAL_CASH' | 'MOBILE_MONEY',
  ) {
    const allowed =
      type === 'BANK'
        ? ['VIREMENT', 'CHEQUE', 'DEPOT', 'LETTRE_CREDIT']
        : type === 'CENTRAL_CASH'
          ? ['CAISSE_CENTRALE', 'COMPENSATION']
          : ['MOBILE_MONEY'];
    if (!allowed.includes(mode)) {
      throw new BadRequestException(
        `Le mode ${mode} est incompatible avec le compte ${type}.`,
      );
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    entityId: string,
    details: Record<string, unknown>,
  ) {
    return tx.journalAudit.create({
      data: {
        utilisateurId: userId,
        action,
        entite: 'P2P_ACCOUNTING_PAYMENT',
        entiteId: entityId,
        details: JSON.stringify(details),
      },
    });
  }

  private number(prefix: string, operationId: string) {
    return `${prefix}-${operationId.replaceAll('-', '').slice(0, 20).toUpperCase()}`;
  }
}
