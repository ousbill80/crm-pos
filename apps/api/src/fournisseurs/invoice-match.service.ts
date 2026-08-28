import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TypeTaxeAchat } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceExtractionIntakeDto,
  CreateP2pInvoiceDto,
  CreateSupplierCreditNoteDto,
  GrantInvoiceExceptionDto,
  InvoiceOperationDto,
  ReviewInvoiceExtractionDto,
} from './dto/invoice-match.dto';
import {
  InvoiceDiscrepancy,
  InvoiceMatchCalculator,
} from './invoice-match.calculator';
import { InvoiceMatchStateMachine } from './invoice-match-state-machine';

const P2P_INVOICE_INCLUDE = {
  fournisseur: { select: { id: true, nom: true } },
  lignes: { include: { taxes: true } },
  taxes: true,
  litiges: { orderBy: { dateCreation: 'asc' as const } },
  exceptions: { orderBy: { dateDecision: 'asc' as const } },
  revuesExtraction: { orderBy: { dateRevue: 'asc' as const } },
  compensations: { select: { id: true, numero: true, typeDocument: true } },
} as const;

type Tx = Prisma.TransactionClient;
type LoadedInvoice = Prisma.FactureFournisseurGetPayload<{
  include: typeof P2P_INVOICE_INCLUDE;
}>;

@Injectable()
export class InvoiceMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: InvoiceMatchCalculator,
    private readonly machine: InvoiceMatchStateMachine,
  ) {}

  async create(dto: CreateP2pInvoiceDto, user: AuthenticatedUser) {
    const replay = await this.prisma.factureFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: P2P_INVOICE_INCLUDE,
    });
    if (replay) {
      if (
        replay.createurId !== user.userId ||
        replay.documentHash !== dto.document.hashSha256.toLowerCase()
      ) {
        throw new ConflictException(
          'clientOperationId déjà utilisé pour une autre facture.',
        );
      }
      return this.serialize(replay);
    }
    this.assertUnique(dto.lignes.map((line) => line.ligneQualiteId));
    const documentDate = this.date(dto.dateDocument, 'date de facture');
    const dueDate = dto.dateEcheance
      ? this.date(dto.dateEcheance, 'date d’échéance')
      : null;
    const referenceNormalisee = this.normalizeReference(
      dto.referenceFournisseur,
    );
    const documentHash = dto.document.hashSha256.toLowerCase();

    const qualityLines = await this.prisma.ligneDecisionQualiteAchat.findMany({
      where: { id: { in: dto.lignes.map((line) => line.ligneQualiteId) } },
      include: {
        ligneReception: {
          include: {
            reception: { include: { commande: true } },
            ligneCommande: {
              include: {
                tauxFiscalAchat: { include: { referentiel: true } },
              },
            },
          },
        },
      },
    });
    if (qualityLines.length !== dto.lignes.length) {
      throw new BadRequestException(
        'Une ligne de décision qualité est introuvable.',
      );
    }
    const qualityById = new Map(qualityLines.map((line) => [line.id, line]));
    const taxIds = [
      ...dto.lignes.flatMap((line) =>
        line.tauxFiscalAchatId ? [line.tauxFiscalAchatId] : [],
      ),
      ...(dto.taxesAdditionnelles ?? []).map((item) => item.tauxFiscalAchatId),
    ];
    const taxes = await this.prisma.tauxFiscalAchat.findMany({
      where: { id: { in: [...new Set(taxIds)] } },
      include: { referentiel: true },
    });
    if (taxes.length !== new Set(taxIds).size) {
      throw new BadRequestException('Un code fiscal est introuvable.');
    }
    const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
    taxes.forEach((tax) => this.assertCiTax(tax, documentDate));

    const matchInputs = dto.lignes.map((input) => {
      const quality = qualityById.get(input.ligneQualiteId)!;
      const receiptLine = quality.ligneReception;
      const orderLine = receiptLine.ligneCommande;
      const order = receiptLine.reception.commande;
      if (input.ligneCommandeId !== orderLine.id) {
        throw new BadRequestException(
          'La ligne qualité ne correspond pas à la ligne de commande indiquée.',
        );
      }
      const invoiceTax = input.tauxFiscalAchatId
        ? taxById.get(input.tauxFiscalAchatId)!
        : null;
      return {
        input,
        quality,
        receiptLine,
        orderLine,
        order,
        invoiceTax,
        match: {
          orderSupplierId: order.fournisseurId,
          invoiceSupplierId: dto.fournisseurId,
          orderCurrency: order.devise,
          invoiceCurrency: dto.devise,
          orderedQuantity: orderLine.quantite,
          acceptedQuantity: quality.quantiteAcceptee,
          invoicedQuantity: input.quantite,
          orderUnitPrice: orderLine.prixUnitaire,
          invoiceUnitPrice: input.prixUnitaire,
          orderTaxCode:
            orderLine.codeTaxeSnapshot ??
            orderLine.tauxFiscalAchat?.code ??
            null,
          invoiceTaxCode: invoiceTax?.code ?? null,
          orderTaxRate:
            orderLine.tauxTaxeSnapshot ??
            orderLine.tauxFiscalAchat?.taux ??
            null,
          invoiceTaxRate: invoiceTax?.taux ?? null,
        },
      };
    });

    const totals = this.calculator.totals({
      lines: matchInputs.map(({ input, invoiceTax }) => ({
        quantity: input.quantite,
        unitPrice: input.prixUnitaire,
        discountAmount: input.remise ?? 0,
        taxes: invoiceTax
          ? [{ type: invoiceTax.type, rate: invoiceTax.taux }]
          : [],
      })),
      globalDiscount: dto.remiseGlobale ?? 0,
    });
    const adjusted = this.applyAdditionalTaxes(
      totals,
      dto.taxesAdditionnelles ?? [],
      taxById,
    );
    await this.assertNoDuplicate({
      supplierId: dto.fournisseurId,
      referenceNormalisee,
      documentHash,
      documentDate,
      amount: adjusted.netPayable,
    });
    const alreadyInvoiced = await this.prisma.ligneFactureFournisseur.findFirst(
      {
        where: {
          ligneQualiteId: { in: dto.lignes.map((line) => line.ligneQualiteId) },
          facture: { typeDocument: 'FACTURE', statut: { not: 'ANNULEE' } },
        },
      },
    );
    if (alreadyInvoiced) {
      throw new ConflictException(
        'Une quantité acceptée est déjà rattachée à une facture fournisseur.',
      );
    }
    const societeIds = new Set(matchInputs.map((item) => item.order.societeId));
    if (societeIds.size !== 1) {
      throw new BadRequestException(
        'La facture doit être rattachée à une société unique.',
      );
    }
    const societeId = [...societeIds][0];
    if (!societeId) {
      throw new BadRequestException(
        'La facture doit être rattachée à une société unique.',
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.factureFournisseur.create({
          data: {
            numero: this.number('FF', dto.clientOperationId),
            referenceFournisseur: dto.referenceFournisseur.trim(),
            referenceNormalisee,
            societeId,
            nature: 'MARCHANDISE',
            fournisseurId: dto.fournisseurId,
            dateDocument: documentDate,
            dateEcheance: dueDate,
            devise: dto.devise.toUpperCase(),
            tauxChangeSnapshot: dto.tauxChangeSnapshot,
            notes: dto.notes?.trim() || null,
            montant: adjusted.netPayable,
            montantBrutHt: adjusted.grossHt,
            remiseLignes: adjusted.lineDiscounts,
            remiseGlobale: adjusted.globalDiscount,
            totalHt: adjusted.netHt,
            totalTaxes: adjusted.totalTaxes,
            totalRetenues: adjusted.withholding,
            totalTtc: adjusted.totalTtc,
            netAPayer: adjusted.netPayable,
            documentHash,
            documentNomFichier: dto.document.nomFichier.trim(),
            documentMimeType: dto.document.mimeType,
            documentTailleOctets: dto.document.tailleOctets,
            documentUri: dto.document.uri,
            documentMetadata:
              (dto.document.metadata as Prisma.InputJsonValue | undefined) ??
              undefined,
            clientOperationId: dto.clientOperationId,
            createurId: user.userId,
          },
        });
        const discrepancies: InvoiceDiscrepancy[] = [];
        const beforeGlobal = new Prisma.Decimal(adjusted.grossHt).minus(
          adjusted.lineDiscounts,
        );
        const ratio = beforeGlobal.isZero()
          ? new Prisma.Decimal(0)
          : new Prisma.Decimal(adjusted.netHt).div(beforeGlobal);
        for (const item of matchInputs) {
          const gross = new Prisma.Decimal(item.input.prixUnitaire).mul(
            item.input.quantite,
          );
          const discount = new Prisma.Decimal(item.input.remise ?? 0);
          if (discount.lt(0) || discount.gt(gross)) {
            throw new BadRequestException(
              'La remise de ligne doit être comprise entre zéro et le brut.',
            );
          }
          const net = gross.minus(discount);
          const taxableBase = net.mul(ratio);
          const taxAmount = item.invoiceTax
            ? taxableBase.mul(item.invoiceTax.taux).div(100)
            : new Prisma.Decimal(0);
          const line = await tx.ligneFactureFournisseur.create({
            data: {
              factureId: invoice.id,
              ligneCommandeId: item.orderLine.id,
              ligneReceptionId: item.receiptLine.id,
              ligneQualiteId: item.quality.id,
              produitId: item.orderLine.produitId,
              quantite: item.input.quantite,
              prixUnitaire: item.input.prixUnitaire,
              montantBrut: gross,
              remise: discount,
              montantHt: net,
              tauxFiscalAchatId: item.invoiceTax?.id,
              referentielCodeSnapshot:
                item.invoiceTax?.referentiel.code ?? null,
              referentielVersionSnapshot:
                item.invoiceTax?.referentiel.version ?? null,
              codeTaxeSnapshot: item.invoiceTax?.code ?? null,
              typeTaxeSnapshot: item.invoiceTax?.type ?? null,
              tauxTaxeSnapshot: item.invoiceTax?.taux ?? null,
              montantTaxe: taxAmount,
            },
          });
          if (item.invoiceTax) {
            await tx.taxeFactureFournisseur.create({
              data: this.taxData(
                invoice.id,
                line.id,
                item.invoiceTax,
                taxableBase,
              ),
            });
          }
          discrepancies.push(
            ...this.calculator
              .match([{ ...item.match, lineId: line.id }])
              .map((entry) => ({ ...entry, lineId: line.id })),
          );
        }
        for (const extra of dto.taxesAdditionnelles ?? []) {
          const tax = taxById.get(extra.tauxFiscalAchatId)!;
          await tx.taxeFactureFournisseur.create({
            data: this.taxData(
              invoice.id,
              null,
              tax,
              new Prisma.Decimal(extra.base),
            ),
          });
        }
        if (discrepancies.length) {
          await tx.litigeRapprochementFacture.createMany({
            data: discrepancies.map((item) => ({
              factureId: invoice.id,
              ligneId: item.lineId,
              dimension: item.dimension,
              attendu: item.attendu,
              constate: item.constate,
              bloquant: true,
            })),
          });
        }
        await tx.factureFournisseur.update({
          where: { id: invoice.id },
          data: {
            statutRapprochement: discrepancies.length ? 'LITIGE' : 'RAPPROCHEE',
          },
        });
        await this.auditTx(
          tx,
          user.userId,
          'FACTURE_P2P_RAPPROCHEE',
          invoice.id,
          {
            clientOperationId: dto.clientOperationId,
            discrepancies: discrepancies.map((item) => item.dimension),
            documentHash,
          },
        );
        return tx.factureFournisseur.findUniqueOrThrow({
          where: { id: invoice.id },
          include: P2P_INVOICE_INCLUDE,
        });
      });
      return this.serialize(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Facture dupliquée (référence, document ou opération).',
        );
      }
      throw error;
    }
  }

  async post(id: string, dto: InvoiceOperationDto, user: AuthenticatedUser) {
    const invoice = await this.load(id);
    if (invoice.operationComptabilisationId === dto.clientOperationId) {
      return this.serialize(invoice);
    }
    this.machine.assertCanPost(
      invoice.statutRapprochement,
      invoice.exceptions.length > 0,
      user.role,
    );
    if (invoice.statut === 'COMPTABILISEE') {
      throw new ConflictException('Cette facture est déjà comptabilisée.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.factureFournisseur.update({
        where: { id },
        data: {
          statut: 'COMPTABILISEE',
          operationComptabilisationId: dto.clientOperationId,
        },
        include: P2P_INVOICE_INCLUDE,
      });
      await this.auditTx(tx, user.userId, 'FACTURE_P2P_COMPTABILISEE', id, {
        clientOperationId: dto.clientOperationId,
        exceptionId: invoice.exceptions.at(-1)?.id ?? null,
      });
      return updated;
    });
    return this.serialize(result);
  }

  async grantException(
    id: string,
    dto: GrantInvoiceExceptionDto,
    user: AuthenticatedUser,
  ) {
    this.machine.assertCanExcept(user.role, dto.motif);
    const replay = await this.prisma.exceptionRapprochementFacture.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    if (replay) return replay;
    const invoice = await this.load(id);
    if (invoice.statutRapprochement !== 'LITIGE') {
      throw new BadRequestException(
        'Une exception ne peut couvrir qu’une facture en litige.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.exceptionRapprochementFacture.create({
        data: {
          factureId: id,
          decideurId: user.userId,
          roleSnapshot: user.role,
          motif: dto.motif.trim(),
          clientOperationId: dto.clientOperationId,
        },
      });
      await tx.factureFournisseur.update({
        where: { id },
        data: { statutRapprochement: 'EXCEPTEE' },
      });
      await this.auditTx(
        tx,
        user.userId,
        'FACTURE_P2P_EXCEPTION_ACCORDEE',
        id,
        {
          exceptionId: exception.id,
          motif: exception.motif,
          role: user.role,
        },
      );
      return exception;
    });
  }

  async createCredit(
    id: string,
    dto: CreateSupplierCreditNoteDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.factureFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: P2P_INVOICE_INCLUDE,
    });
    if (replay) return this.serialize(replay);
    const original = await this.load(id);
    if (original.typeDocument !== 'FACTURE') {
      throw new BadRequestException(
        'Seule une facture peut être compensée par un avoir.',
      );
    }
    this.machine.assertCanCredit(original.statut);
    const referenceNormalisee = this.normalizeReference(
      dto.referenceFournisseur,
    );
    const result = await this.prisma.$transaction(async (tx) => {
      const credit = await tx.factureFournisseur.create({
        data: {
          numero: this.number('AV', dto.clientOperationId),
          referenceFournisseur: dto.referenceFournisseur.trim(),
          referenceNormalisee,
          fournisseurId: original.fournisseurId,
          societeId: original.societeId,
          nature: original.nature,
          statutRapprochement: 'RAPPROCHEE',
          typeDocument: 'AVOIR',
          dateDocument: new Date(),
          devise: original.devise,
          tauxChangeSnapshot: original.tauxChangeSnapshot,
          montant: original.montant,
          montantBrutHt: original.montantBrutHt,
          remiseLignes: original.remiseLignes,
          remiseGlobale: original.remiseGlobale,
          totalHt: original.totalHt,
          totalTaxes: original.totalTaxes,
          totalRetenues: original.totalRetenues,
          totalTtc: original.totalTtc,
          netAPayer: original.netAPayer,
          clientOperationId: dto.clientOperationId,
          createurId: user.userId,
          factureOrigineId: original.id,
          motifCompensation: dto.motif.trim(),
        },
      });
      const lineMap = new Map<string, string>();
      for (const line of original.lignes) {
        const copy = await tx.ligneFactureFournisseur.create({
          data: {
            factureId: credit.id,
            ligneCommandeId: line.ligneCommandeId,
            ligneReceptionId: line.ligneReceptionId,
            ligneQualiteId: line.ligneQualiteId,
            produitId: line.produitId,
            quantite: line.quantite,
            prixUnitaire: line.prixUnitaire,
            montantBrut: line.montantBrut,
            remise: line.remise,
            montantHt: line.montantHt,
            tauxFiscalAchatId: line.tauxFiscalAchatId,
            referentielCodeSnapshot: line.referentielCodeSnapshot,
            referentielVersionSnapshot: line.referentielVersionSnapshot,
            codeTaxeSnapshot: line.codeTaxeSnapshot,
            typeTaxeSnapshot: line.typeTaxeSnapshot,
            tauxTaxeSnapshot: line.tauxTaxeSnapshot,
            montantTaxe: line.montantTaxe,
          },
        });
        lineMap.set(line.id, copy.id);
      }
      await tx.taxeFactureFournisseur.createMany({
        data: original.taxes.map((tax) => ({
          factureId: credit.id,
          ligneId: tax.ligneId ? lineMap.get(tax.ligneId) : null,
          tauxFiscalAchatId: tax.tauxFiscalAchatId,
          referentielCodeSnapshot: tax.referentielCodeSnapshot,
          referentielVersionSnapshot: tax.referentielVersionSnapshot,
          codeSnapshot: tax.codeSnapshot,
          libelleSnapshot: tax.libelleSnapshot,
          typeSnapshot: tax.typeSnapshot,
          tauxSnapshot: tax.tauxSnapshot,
          base: tax.base,
          montant: tax.montant,
        })),
      });
      await this.auditTx(tx, user.userId, 'AVOIR_FOURNISSEUR_CREE', credit.id, {
        factureOrigineId: original.id,
        motif: dto.motif.trim(),
      });
      return tx.factureFournisseur.findUniqueOrThrow({
        where: { id: credit.id },
        include: P2P_INVOICE_INCLUDE,
      });
    });
    return this.serialize(result);
  }

  async intakeExtraction(
    dto: CreateInvoiceExtractionIntakeDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.factureFournisseur.findUnique({
      where: { clientOperationId: dto.clientOperationId },
      include: P2P_INVOICE_INCLUDE,
    });
    if (replay) return this.serialize(replay);
    const hash = dto.document.hashSha256.toLowerCase();
    if (
      await this.prisma.factureFournisseur.findFirst({
        where: { documentHash: hash, typeDocument: 'FACTURE' },
      })
    ) {
      throw new ConflictException('Ce document source existe déjà.');
    }
    const societe = await this.prisma.societe.findFirst();
    if (!societe) {
      throw new BadRequestException('Société introuvable.');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.factureFournisseur.create({
        data: {
          numero: this.number('OCR', dto.clientOperationId),
          societeId: societe.id,
          nature: 'MARCHANDISE',
          fournisseurId: dto.fournisseurId,
          statutExtraction: 'A_EXTRAIRE',
          montant: 0,
          documentHash: hash,
          documentNomFichier: dto.document.nomFichier,
          documentMimeType: dto.document.mimeType,
          documentTailleOctets: dto.document.tailleOctets,
          documentUri: dto.document.uri,
          documentMetadata:
            (dto.document.metadata as Prisma.InputJsonValue | undefined) ??
            undefined,
          clientOperationId: dto.clientOperationId,
          createurId: user.userId,
        },
        include: P2P_INVOICE_INCLUDE,
      });
      await this.auditTx(
        tx,
        user.userId,
        'FACTURE_EXTRACTION_RECUE',
        invoice.id,
        {
          documentHash: hash,
          provider: null,
        },
      );
      return invoice;
    });
    return this.serialize(created);
  }

  async reviewExtraction(
    id: string,
    dto: ReviewInvoiceExtractionDto,
    user: AuthenticatedUser,
  ) {
    const replay = await this.prisma.revueExtractionFacture.findUnique({
      where: { clientOperationId: dto.clientOperationId },
    });
    if (replay) return replay;
    const invoice = await this.load(id);
    if (!['A_EXTRAIRE', 'A_REVOIR'].includes(invoice.statutExtraction)) {
      throw new BadRequestException(
        'Cette extraction n’est pas dans un état révisable.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.revueExtractionFacture.create({
        data: {
          factureId: id,
          auteurId: user.userId,
          decision: dto.decision,
          commentaire: dto.commentaire?.trim() || null,
          payloadRevise:
            (dto.payloadRevise as Prisma.InputJsonValue | undefined) ??
            undefined,
          clientOperationId: dto.clientOperationId,
        },
      });
      await tx.factureFournisseur.update({
        where: { id },
        data: {
          statutExtraction: dto.decision === 'CONFIRMER' ? 'REVUE' : 'REJETEE',
          extractionPayload:
            (dto.payloadRevise as Prisma.InputJsonValue | undefined) ??
            undefined,
        },
      });
      await this.auditTx(tx, user.userId, 'FACTURE_EXTRACTION_REVUE', id, {
        reviewId: review.id,
        decision: dto.decision,
      });
      return review;
    });
  }

  private async load(id: string): Promise<LoadedInvoice> {
    const invoice = await this.prisma.factureFournisseur.findUnique({
      where: { id },
      include: P2P_INVOICE_INCLUDE,
    });
    if (!invoice)
      throw new NotFoundException('Facture fournisseur introuvable.');
    return invoice;
  }

  private async assertNoDuplicate(input: {
    supplierId: string;
    referenceNormalisee: string;
    documentHash: string;
    documentDate: Date;
    amount: string;
  }) {
    const duplicate = await this.prisma.factureFournisseur.findFirst({
      where: {
        typeDocument: 'FACTURE',
        OR: [
          {
            fournisseurId: input.supplierId,
            referenceNormalisee: input.referenceNormalisee,
          },
          { documentHash: input.documentHash },
          {
            fournisseurId: input.supplierId,
            dateDocument: input.documentDate,
            montant: input.amount,
          },
        ],
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Doublon fournisseur détecté par référence, montant/date ou empreinte du document.',
      );
    }
  }

  private assertCiTax(
    tax: {
      actif: boolean;
      referentiel: {
        actif: boolean;
        pays: string;
        valideDu: Date;
        valideAu: Date | null;
      };
    },
    documentDate: Date,
  ) {
    const reference = tax.referentiel;
    if (
      !tax.actif ||
      !reference.actif ||
      reference.pays.toUpperCase() !== 'CI' ||
      reference.valideDu > documentDate ||
      (reference.valideAu !== null && reference.valideAu < documentDate)
    ) {
      throw new BadRequestException(
        'Le code taxe doit appartenir au référentiel fiscal CI configuré et valide à la date du document.',
      );
    }
  }

  private taxData(
    invoiceId: string,
    lineId: string | null,
    tax: {
      id: string;
      code: string;
      libelle: string;
      type: TypeTaxeAchat;
      taux: Prisma.Decimal;
      referentiel: { code: string; version: number };
    },
    base: Prisma.Decimal,
  ): Prisma.TaxeFactureFournisseurUncheckedCreateInput {
    return {
      factureId: invoiceId,
      ligneId: lineId,
      tauxFiscalAchatId: tax.id,
      referentielCodeSnapshot: tax.referentiel.code,
      referentielVersionSnapshot: tax.referentiel.version,
      codeSnapshot: tax.code,
      libelleSnapshot: tax.libelle,
      typeSnapshot: tax.type,
      tauxSnapshot: tax.taux,
      base,
      montant: base.mul(tax.taux).div(100),
    };
  }

  private applyAdditionalTaxes(
    totals: ReturnType<InvoiceMatchCalculator['totals']>,
    additions: Array<{ tauxFiscalAchatId: string; base: string }>,
    taxes: Map<
      string,
      {
        id: string;
        type: TypeTaxeAchat;
        taux: Prisma.Decimal;
      }
    >,
  ) {
    let vat = new Prisma.Decimal(totals.vat);
    let duties = new Prisma.Decimal(totals.duties);
    let withholding = new Prisma.Decimal(totals.withholding);
    let otherTaxes = new Prisma.Decimal(totals.otherTaxes);
    for (const addition of additions) {
      const tax = taxes.get(addition.tauxFiscalAchatId)!;
      const amount = new Prisma.Decimal(addition.base).mul(tax.taux).div(100);
      if (tax.type === 'TVA') vat = vat.plus(amount);
      else if (tax.type === 'DROIT_DOUANE') duties = duties.plus(amount);
      else if (tax.type === 'RETENUE') withholding = withholding.plus(amount);
      else otherTaxes = otherTaxes.plus(amount);
    }
    const netHt = new Prisma.Decimal(totals.netHt);
    const totalTaxes = vat.plus(duties).plus(otherTaxes);
    const totalTtc = netHt.plus(totalTaxes);
    const netPayable = totalTtc.minus(withholding);
    return {
      ...totals,
      vat: vat.toFixed(2),
      duties: duties.toFixed(2),
      withholding: withholding.toFixed(2),
      otherTaxes: otherTaxes.toFixed(2),
      totalTaxes: totalTaxes.toFixed(2),
      totalTtc: totalTtc.toFixed(2),
      netPayable: netPayable.toFixed(2),
    };
  }

  private async auditTx(
    tx: Tx,
    userId: string,
    action: string,
    entityId: string,
    details: object,
  ) {
    await tx.journalAudit.create({
      data: {
        utilisateurId: userId,
        action,
        entite: 'FactureFournisseur',
        entiteId: entityId,
        details: JSON.stringify(details),
      },
    });
  }

  private serialize(invoice: LoadedInvoice) {
    return {
      ...invoice,
      montant: invoice.montant.toFixed(2),
      montantBrutHt: invoice.montantBrutHt?.toFixed(2) ?? null,
      remiseLignes: invoice.remiseLignes?.toFixed(2) ?? null,
      remiseGlobale: invoice.remiseGlobale?.toFixed(2) ?? null,
      totalHt: invoice.totalHt?.toFixed(2) ?? null,
      totalTaxes: invoice.totalTaxes?.toFixed(2) ?? null,
      totalRetenues: invoice.totalRetenues?.toFixed(2) ?? null,
      totalTtc: invoice.totalTtc?.toFixed(2) ?? null,
      netAPayer: invoice.netAPayer?.toFixed(2) ?? null,
      tauxChangeSnapshot: invoice.tauxChangeSnapshot?.toFixed(6) ?? null,
      lignes: invoice.lignes.map((line) => ({
        ...line,
        prixUnitaire: line.prixUnitaire.toFixed(2),
        montantBrut: line.montantBrut?.toFixed(2) ?? null,
        remise: line.remise?.toFixed(2) ?? null,
        montantHt: line.montantHt?.toFixed(2) ?? null,
        tauxTaxeSnapshot: line.tauxTaxeSnapshot?.toFixed(4) ?? null,
        montantTaxe: line.montantTaxe?.toFixed(2) ?? null,
      })),
    };
  }

  private date(value: string, label: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} invalide.`);
    }
    return date;
  }

  private normalizeReference(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private assertUnique(values: string[]) {
    if (new Set(values).size !== values.length) {
      throw new BadRequestException(
        'Les lignes facture dupliquées sont interdites.',
      );
    }
  }

  private number(prefix: string, operationId: string) {
    return `${prefix}-${new Date().getUTCFullYear()}-${operationId.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  }
}
