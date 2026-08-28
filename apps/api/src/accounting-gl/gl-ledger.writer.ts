import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  RoleLigneComptable,
  TypeSourceComptable,
} from '@prisma/client';
import {
  CalculatedPostingLine,
  P2pAccountingCalculator,
  PostingRole,
} from '../fournisseurs/p2p-accounting.calculator';

export const ROLE_MAP: Record<PostingRole, RoleLigneComptable> = {
  PURCHASE: 'ACHAT',
  STOCK: 'STOCK',
  LANDED_COST: 'COUT_LOGISTIQUE',
  TAX: 'TAXE',
  WITHHOLDING: 'RETENUE',
  SUPPLIER: 'FOURNISSEUR',
  TREASURY: 'TRESORERIE',
  ADVANCE: 'AVANCE',
  FX_GAIN: 'GAIN_CHANGE',
  FX_LOSS: 'PERTE_CHANGE',
  CUSTOMER: 'CLIENT',
  SALE: 'VENTE',
  OUTPUT_TAX: 'TVA_COLLECTEE',
  EXPENSE: 'CHARGE',
  DEPRECIATION: 'AMORTISSEMENT',
};

const AUX_FOURNISSEUR: RoleLigneComptable[] = ['FOURNISSEUR', 'AVANCE'];
const AUX_CLIENT: RoleLigneComptable[] = ['CLIENT'];

export type LedgerTx = Prisma.TransactionClient;

export type LedgerContext = {
  period: Prisma.PeriodeComptableGetPayload<{ include: { exercice: true } }>;
  template: Prisma.ModeleComptabilisationGetPayload<{
    include: {
      journal: true;
      lignes: { include: { compte: true } };
    };
  }>;
};

export class GlLedgerWriter {
  constructor(private readonly calculator: P2pAccountingCalculator) {}

  async context(
    tx: LedgerTx,
    companyId: string,
    sourceType: TypeSourceComptable,
    date: Date,
    options?: { treasuryCompteComptableId?: string },
  ): Promise<LedgerContext> {
    const period = await tx.periodeComptable.findFirst({
      where: {
        societeId: companyId,
        cloture: false,
        dateDebut: { lte: date },
        dateFin: { gte: date },
        exercice: { cloture: false },
      },
      include: { exercice: true },
    });
    if (!period) {
      throw new BadRequestException(
        'Aucune période comptable ouverte pour cette date.',
      );
    }
    const templates = await tx.modeleComptabilisation.findMany({
      where: {
        societeId: companyId,
        sourceType,
        actif: true,
        valideDu: { lte: date },
        OR: [{ valideAu: null }, { valideAu: { gte: date } }],
      },
      include: {
        journal: true,
        lignes: { include: { compte: true }, orderBy: { ordre: 'asc' } },
      },
      orderBy: [{ version: 'desc' }],
    });
    const template = options?.treasuryCompteComptableId
      ? templates.find((item) =>
          item.lignes.some(
            (line) =>
              line.role === 'TRESORERIE' &&
              line.compteId === options.treasuryCompteComptableId,
          ),
        )
      : templates[0];
    if (!template) {
      throw new BadRequestException(
        options?.treasuryCompteComptableId
          ? 'Aucun modèle de trésorerie ne correspond au compte (571/521/572).'
          : `Aucun modèle comptable versionné pour ${sourceType}.`,
      );
    }
    if (
      template.journalId === '' ||
      template.lignes.some(
        (line) => !line.compte.actif || line.compte.societeId !== companyId,
      )
    ) {
      throw new BadRequestException('Mapping de comptes incomplet ou inactif.');
    }
    if (!template.journal.actif) {
      throw new BadRequestException(
        `Le journal ${template.journal.code} est inactif : aucune écriture nouvelle n’y est acceptée.`,
      );
    }
    return { period, template };
  }

  async createEntry(
    tx: LedgerTx,
    input: {
      context: LedgerContext;
      sourceType: TypeSourceComptable;
      sourceId: string;
      factureId?: string | null;
      label: string;
      date: Date;
      currency: string;
      rate?: Prisma.Decimal | number | string | null;
      operationId: string;
      authorId: string;
      supplierId?: string | null;
      clientId?: string | null;
      lines: CalculatedPostingLine[];
      lettrage?: string | null;
    },
  ) {
    this.calculator.assertBalanced(input.lines);
    const accountByRole = new Map(
      input.context.template.lignes.map((line) => [line.role, line.compteId]),
    );
    const missing = [
      ...new Set(
        input.lines
          .filter(
            (line) => !line.compteId && !accountByRole.has(ROLE_MAP[line.role]),
          )
          .map((line) => ROLE_MAP[line.role]),
      ),
    ];
    if (missing.length) {
      throw new BadRequestException(
        `Mapping de compte manquant : ${missing.join(', ')}.`,
      );
    }
    const numero = await this.nextPieceNumber(
      tx,
      input.context.template.journal.code,
      input.context.period.exercice.code,
    );
    return tx.ecritureComptable.create({
      data: {
        numero,
        societeId: input.context.period.societeId,
        exerciceId: input.context.period.exerciceId,
        periodeId: input.context.period.id,
        journalId: input.context.template.journalId,
        modeleId: input.context.template.id,
        modeleCodeSnapshot: input.context.template.code,
        modeleVersionSnapshot: input.context.template.version,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        factureId: input.factureId ?? null,
        libelle: input.label,
        dateComptable: input.date,
        devise: input.currency,
        tauxChangeSnapshot: input.rate ?? null,
        clientOperationId: input.operationId,
        auteurId: input.authorId,
        lignes: {
          create: input.lines.map((line, index) => {
            const role = ROLE_MAP[line.role];
            const auxFournisseur = AUX_FOURNISSEUR.includes(role);
            const auxClient = AUX_CLIENT.includes(role);
            return {
              numeroLigne: index + 1,
              compteId: line.compteId ?? accountByRole.get(role)!,
              roleSnapshot: role,
              libelle: input.label,
              debit: line.debit,
              credit: line.credit,
              fournisseurId: auxFournisseur ? (input.supplierId ?? null) : null,
              clientId: auxClient ? (input.clientId ?? null) : null,
              lettrage:
                auxFournisseur || auxClient ? (input.lettrage ?? null) : null,
              dateLettrage: input.lettrage ? input.date : null,
            };
          }),
        },
      },
      include: { lignes: true },
    });
  }

  async nextPieceNumber(
    tx: LedgerTx,
    journalCode: string,
    exerciceCode: string,
  ) {
    const prefix = `${journalCode}-${exerciceCode}-`;
    const last = await tx.ecritureComptable.findFirst({
      where: { numero: { startsWith: prefix } },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const seq = last ? Number(last.numero.slice(prefix.length)) + 1 : 1;
    if (!Number.isInteger(seq) || seq < 1) {
      throw new BadRequestException('Séquence de pièce comptable illisible.');
    }
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }
}
