import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { SensitiveActionChallengeService } from '../auth/sensitive-action-challenge.service';
import { PurposeActionSensible } from '@prisma/client';
import {
  ROLES_P2P_COMPTABILITE_ECRITURE,
  ROLES_P2P_COMPTABILITE_LECTURE,
  ROLES_P2P_PAIEMENT_APPROBATION,
  ROLES_P2P_PAIEMENT_EXCEPTION,
  ROLES_P2P_PAIEMENT_EXECUTION,
} from '../caisses/access-scope.constants';
import {
  AccountingRangeQueryDto,
  AccountingReportQueryDto,
  CreatePostingTemplateDto,
  CreatePaymentScheduleDto,
  CreateTreasuryAccountDto,
  ExecuteSupplierPaymentDto,
  ImportBankStatementDto,
  OpenAccountingPeriodDto,
  AccountingPeriodQueryDto,
  AccountingJournalQueryDto,
  CreateJournalComptableDto,
  UpdateCompteComptableDto,
  UpdateJournalComptableDto,
  UpdateNatureDepenseDto,
  CreateCompteComptableDto,
  CreateNatureDepenseDto,
  AccountingQueueQueryDto,
  ManualJournalDto,
  CloseExerciceDto,
  OpenExerciceDto,
  BackfillSalesDto,
  TreasuryListQueryDto,
  BankImportListQueryDto,
  BankUnmatchedQueryDto,
  PrepareSupplierPaymentDto,
  ReconcileBankLineDto,
  SensitiveAccountingOperationDto,
  LetteringQueryDto,
  LetterLinesDto,
  StornoEntryDto,
} from './dto/p2p-accounting.dto';
import { PaymentProposalListQueryDto } from './dto/p2p-list.dto';
import { P2pAccountingService } from './p2p-accounting.service';
import { pipePdf } from '../impressions/pdf.util';
import { dessinerLiasseSyscohadaPdf } from '../impressions/syscohada-liasse.pdf';
import { liasseToCsv } from '../accounting-gl/syscohada-liasse';

@Controller('achats/comptabilite')
export class P2pAccountingController {
  constructor(
    private readonly accounting: P2pAccountingService,
    private readonly sensitiveActions: SensitiveActionChallengeService,
  ) {}

  @Post('comptes-tresorerie')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  createTreasuryAccount(
    @Body() dto: CreateTreasuryAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createTreasuryAccount(dto, user);
  }

  @Post('modeles')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  createTemplate(
    @Body() dto: CreatePostingTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createTemplate(dto, user);
  }

  @Get('paiements/propositions')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE, ...ROLES_P2P_PAIEMENT_EXECUTION)
  listPaymentProposals(
    @Query() query: PaymentProposalListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.listPaymentProposals(query, user);
  }

  @Get('paiements/propositions/:id')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE, ...ROLES_P2P_PAIEMENT_EXECUTION)
  paymentProposalDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.paymentProposalDetail(id, user);
  }

  @Post('factures/:id/comptabiliser')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  async postInvoice(
    @Param('id') id: string,
    @Body() dto: SensitiveAccountingOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.sensitiveActions.consume(
      dto.challengeId,
      user.userId,
      PurposeActionSensible.P2P_INVOICE_POST,
    );
    return this.accounting.postInvoice(id, dto, user);
  }

  @Post('paiements/propositions')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  preparePayment(
    @Body() dto: PrepareSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.preparePayment(dto, user);
  }

  @Post('factures/:id/echeancier')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  createSchedule(
    @Param('id') id: string,
    @Body() dto: CreatePaymentScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createPaymentSchedule(id, dto, user);
  }

  @Post('paiements/propositions/:id/approuver')
  @Roles(...ROLES_P2P_PAIEMENT_APPROBATION)
  async approvePayment(
    @Param('id') id: string,
    @Body() dto: SensitiveAccountingOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.sensitiveActions.consume(
      dto.challengeId,
      user.userId,
      PurposeActionSensible.P2P_PAYMENT_APPROVE,
    );
    return this.accounting.approvePayment(id, dto, user);
  }

  @Post('paiements/propositions/:id/approuver-exception')
  @Roles(...ROLES_P2P_PAIEMENT_EXCEPTION)
  async approveException(
    @Param('id') id: string,
    @Body() dto: SensitiveAccountingOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.sensitiveActions.consume(
      dto.challengeId,
      user.userId,
      PurposeActionSensible.P2P_PAYMENT_EXCEPTION_APPROVE,
    );
    return this.accounting.exceptionalApprove(id, dto, user);
  }

  @Post('paiements/propositions/:id/executer')
  @Roles(...ROLES_P2P_PAIEMENT_EXECUTION)
  async executePayment(
    @Param('id') id: string,
    @Body() dto: ExecuteSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.sensitiveActions.consume(
      dto.challengeId,
      user.userId,
      PurposeActionSensible.P2P_PAYMENT_EXECUTE,
    );
    return this.accounting.executePayment(id, dto, user);
  }

  @Post('releves/imports')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  importStatement(
    @Body() dto: ImportBankStatementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.importBankStatement(dto, user);
  }

  @Post('releves/lignes/:id/rapprocher')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  reconcile(
    @Param('id') id: string,
    @Body() dto: ReconcileBankLineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.reconcile(id, dto, user);
  }

  @Get('rapports/balance')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  trialBalance(@Query() query: AccountingReportQueryDto) {
    return this.accounting.trialBalance(query);
  }

  @Get('rapports/grand-livre')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  generalLedger(@Query() query: AccountingReportQueryDto) {
    return this.accounting.generalLedger(query);
  }

  @Get('rapports/balance-agee-fournisseurs')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  supplierAging(@Query() query: AccountingReportQueryDto) {
    return this.accounting.supplierAging(query);
  }

  @Get('rapports/balance-agee-clients')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  customerAging(@Query() query: AccountingReportQueryDto) {
    return this.accounting.customerAging(query);
  }

  @Get('rapports/bilan')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  bilan(@Query() query: AccountingReportQueryDto) {
    return this.accounting.financialStatements(query);
  }

  @Get('rapports/tva')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  vatReturn(@Query() query: AccountingReportQueryDto) {
    return this.accounting.vatReturn(query);
  }

  @Get('rapports/liasse')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  liasse(@Query() query: AccountingReportQueryDto) {
    return this.accounting.liasse(query);
  }

  @Get('rapports/liasse/pdf')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  async liassePdf(
    @Query() query: AccountingReportQueryDto,
    @Res() res: Response,
  ) {
    const { pack, societe } = await this.accounting.liasseWithSociete(query);
    pipePdf(
      res,
      `liasse-syscohada-${query.du}-${query.au}.pdf`,
      (doc) =>
        dessinerLiasseSyscohadaPdf(doc, pack, societe, query.du, query.au),
      pack.mention,
    );
  }

  @Get('rapports/liasse.csv')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  async liasseCsv(
    @Query() query: AccountingReportQueryDto,
    @Res() res: Response,
  ) {
    const pack = await this.accounting.liasse(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="liasse-syscohada-${query.du}-${query.au}.csv"`,
    );
    res.send(liasseToCsv(pack));
  }

  @Get('rapports/liasse-agregat')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  liasseAgregat(@Query() query: AccountingRangeQueryDto) {
    return this.accounting.liasseAgregat(query);
  }

  @Get('rapports/liasse-agregat/pdf')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  async liasseAgregatPdf(
    @Query() query: AccountingRangeQueryDto,
    @Res() res: Response,
  ) {
    const pack = await this.accounting.liasseAgregat(query);
    pipePdf(
      res,
      `liasse-agregat-${query.du}-${query.au}.pdf`,
      (doc) => dessinerLiasseSyscohadaPdf(doc, pack, null, query.du, query.au),
      pack.mention,
    );
  }

  @Get('exports/ecritures')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  export(@Query() query: AccountingReportQueryDto) {
    return this.accounting.accountingExport(query);
  }

  @Get('periodes')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listPeriods(@Query() query: AccountingPeriodQueryDto) {
    return this.accounting.listPeriods(query.societeId);
  }

  @Get('journaux')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listJournals(@Query() query: AccountingJournalQueryDto) {
    return this.accounting.listJournals(query.societeId, query.exerciceId);
  }

  @Post('journaux')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  createJournal(
    @Body() dto: CreateJournalComptableDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createJournal(dto, user);
  }

  @Post('journaux/:id')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  updateJournal(
    @Param('id') id: string,
    @Body() dto: UpdateJournalComptableDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.updateJournal(id, dto, user);
  }

  @Get('comptes')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listAccounts(@Query() query: AccountingPeriodQueryDto) {
    return this.accounting.listAccounts(query.societeId);
  }

  @Post('comptes')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  createAccount(
    @Body() dto: CreateCompteComptableDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createAccount(dto, user);
  }

  @Post('comptes/:id')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateCompteComptableDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.updateAccount(id, dto, user);
  }

  @Get('natures-depense')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listNatures(@Query() query: AccountingPeriodQueryDto) {
    return this.accounting.listExpenseNatures(query.societeId);
  }

  @Post('natures-depense')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  createNature(
    @Body() dto: CreateNatureDepenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.createExpenseNature(dto, user);
  }

  @Post('natures-depense/:id')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  updateNature(
    @Param('id') id: string,
    @Body() dto: UpdateNatureDepenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.updateExpenseNature(id, dto, user);
  }

  @Get('comptes-tresorerie')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE, ...ROLES_P2P_PAIEMENT_EXECUTION)
  listTreasury(@Query() query: TreasuryListQueryDto) {
    return this.accounting.listTreasuryAccounts(query.societeId);
  }

  @Get('releves/imports')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listBankImports(@Query() query: BankImportListQueryDto) {
    return this.accounting.listBankImports(
      query.societeId,
      query.compteTresorerieId,
    );
  }

  @Get('releves/non-rapproches')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  unmatchedBank(@Query() query: BankUnmatchedQueryDto) {
    return this.accounting.unmatchedBank(
      query.societeId,
      query.compteTresorerieId,
    );
  }

  @Get('file')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listQueue(@Query() query: AccountingQueueQueryDto) {
    return this.accounting.listPostingQueue(query.societeId, query.statut);
  }

  @Post('file/rejouer')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  flushQueue(
    @Body() dto: AccountingQueueQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.flushPostingQueue(dto.societeId, user);
  }

  @Post('file/rattraper-ventes')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  backfillSales(
    @Body() dto: BackfillSalesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.backfillOperationalSales(dto.societeId, user);
  }

  @Post('od')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  postManual(
    @Body() dto: ManualJournalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.postManualJournal(dto, user);
  }

  @Get('lettrage/ouverts')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listOpenLettering(@Query() query: LetteringQueryDto) {
    return this.accounting.listOpenLettering(query);
  }

  @Post('lettrage')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  letterLines(
    @Body() dto: LetterLinesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.letterLines(dto, user);
  }

  @Post('ecritures/:id/storno')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  stornoEntry(
    @Param('id') id: string,
    @Body() dto: StornoEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.stornoEntry(id, dto, user);
  }

  @Get('exercices')
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  listExercices(@Query() query: AccountingPeriodQueryDto) {
    return this.accounting.listExercices(query.societeId);
  }

  @Post('exercices')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  openExercice(
    @Body() dto: OpenExerciceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.openExercice(dto, user);
  }

  @Post('exercices/:id/cloturer')
  @Roles(...ROLES_P2P_PAIEMENT_APPROBATION)
  closeExercice(
    @Param('id') id: string,
    @Body() dto: CloseExerciceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.closeExercice(id, dto, user);
  }

  @Post('periodes')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  openPeriod(
    @Body() dto: OpenAccountingPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounting.openPeriod(dto, user);
  }

  @Post('periodes/:id/cloturer')
  @Roles(...ROLES_P2P_PAIEMENT_APPROBATION)
  closePeriod(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.accounting.closePeriod(id, user);
  }
}
