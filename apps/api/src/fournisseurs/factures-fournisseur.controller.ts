import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { SensitiveActionChallengeService } from '../auth/sensitive-action-challenge.service';
import { PurposeActionSensible } from '@prisma/client';
import {
  ROLES_COMPTABILISATION_FOURNISSEUR,
  ROLES_EXCEPTION_FACTURE_P2P,
  ROLES_LECTURE_ACHATS,
  ROLES_PAIEMENT_FOURNISSEUR,
  ROLES_RAPPROCHEMENT_FACTURE_P2P,
  ROLES_SAISIE_FACTURE_FOURNISSEUR,
} from '../caisses/access-scope.constants';
import { FacturesFournisseurService } from './factures-fournisseur.service';
import { CreateChargeInvoiceDto } from './dto/charge-invoice.dto';
import { CreateFactureFournisseurDto } from './dto/create-facture-fournisseur.dto';
import { CreatePaiementFournisseurDto } from './dto/create-paiement-fournisseur.dto';
import {
  CreateInvoiceExtractionIntakeDto,
  CreateP2pInvoiceDto,
  CreateSupplierCreditNoteDto,
  GrantInvoiceExceptionDto,
  ReviewInvoiceExtractionDto,
} from './dto/invoice-match.dto';
import { SensitiveAccountingOperationDto } from './dto/p2p-accounting.dto';
import { InvoiceMatchService } from './invoice-match.service';
import { P2pAccountingService } from './p2p-accounting.service';

@Controller('achats/factures')
export class FacturesFournisseurController {
  constructor(
    private readonly factures: FacturesFournisseurService,
    private readonly invoiceMatch: InvoiceMatchService,
    private readonly accounting: P2pAccountingService,
    private readonly sensitiveActions: SensitiveActionChallengeService,
  ) {}

  @Post()
  @Roles(...ROLES_SAISIE_FACTURE_FOURNISSEUR)
  creer(
    @Body() dto: CreateFactureFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.creer(dto, user);
  }

  @Post('charges')
  @Roles(...ROLES_SAISIE_FACTURE_FOURNISSEUR)
  creerCharge(
    @Body() dto: CreateChargeInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.creerCharge(dto, user);
  }

  @Post('p2p')
  @Roles(...ROLES_RAPPROCHEMENT_FACTURE_P2P)
  creerP2p(
    @Body() dto: CreateP2pInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceMatch.create(dto, user);
  }

  @Post('extraction-intake')
  @Roles(...ROLES_RAPPROCHEMENT_FACTURE_P2P)
  intakeExtraction(
    @Body() dto: CreateInvoiceExtractionIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceMatch.intakeExtraction(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_ACHATS)
  lister() {
    return this.factures.lister();
  }

  @Get('a-facturer')
  @Roles(...ROLES_LECTURE_ACHATS)
  aFacturer(@Query('fournisseurId') fournisseurId?: string) {
    return this.factures.receptionsAFacturer(fournisseurId);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detail(@Param('id') id: string) {
    return this.factures.detail(id);
  }

  @Post(':id/comptabiliser')
  @Roles(...ROLES_COMPTABILISATION_FOURNISSEUR)
  async comptabiliser(
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

  @Post(':id/exception')
  @Roles(...ROLES_EXCEPTION_FACTURE_P2P)
  exception(
    @Param('id') id: string,
    @Body() dto: GrantInvoiceExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceMatch.grantException(id, dto, user);
  }

  @Post(':id/avoir')
  @Roles(...ROLES_RAPPROCHEMENT_FACTURE_P2P)
  avoir(
    @Param('id') id: string,
    @Body() dto: CreateSupplierCreditNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceMatch.createCredit(id, dto, user);
  }

  @Post(':id/extraction-review')
  @Roles(...ROLES_RAPPROCHEMENT_FACTURE_P2P)
  reviewExtraction(
    @Param('id') id: string,
    @Body() dto: ReviewInvoiceExtractionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceMatch.reviewExtraction(id, dto, user);
  }

  @Post(':id/annuler')
  @Roles(...ROLES_RAPPROCHEMENT_FACTURE_P2P)
  annuler(
    @Param('id') id: string,
    @Body() dto: CreateSupplierCreditNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceMatch.createCredit(id, dto, user);
  }

  @Post(':id/paiements')
  @Roles(...ROLES_PAIEMENT_FOURNISSEUR)
  payer(
    @Param('id') id: string,
    @Body() dto: CreatePaiementFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.payer(id, dto, user);
  }
}
