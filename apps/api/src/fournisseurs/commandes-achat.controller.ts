import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_APPROBATION_COMMANDE_ACHAT,
  ROLES_COMMANDE_ACHAT,
  ROLES_LECTURE_ACHATS,
  ROLES_SAISIE_COMMANDE_ACHAT,
  ROLES_LOGISTIQUE_IMPORT,
} from '../caisses/access-scope.constants';
import { dessinerBonCommandePdf } from '../impressions/bon-commande.pdf';
import { pipePdf } from '../impressions/pdf.util';
import { CommandesAchatService } from './commandes-achat.service';
import { CreateCommandeAchatDto } from './dto/create-commande-achat.dto';
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
import { OrdersImportService } from './orders-import.service';

@Controller('achats/commandes')
export class CommandesAchatController {
  constructor(
    private readonly commandes: CommandesAchatService,
    private readonly ordersImport: OrdersImportService,
  ) {}

  @Post()
  @Roles(...ROLES_SAISIE_COMMANDE_ACHAT)
  creer(
    @Body() dto: CreateCommandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.commandes.creer(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_ACHATS)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.commandes.lister(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.detail(id, user);
  }

  @Get(':id/pdf')
  @Roles(...ROLES_LECTURE_ACHATS)
  async telechargerPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const data = await this.commandes.getBonCommandePdfData(id, user);
    const prefix = data.proformaReference ? 'proforma' : 'bon-commande';
    pipePdf(
      res,
      `${prefix}-${data.numero}.pdf`,
      (doc) => dessinerBonCommandePdf(doc, data),
      data.proformaReference
        ? 'Proforma · document achats'
        : 'Bon de commande · document achats',
    );
  }

  @Get(':id/import')
  @Roles(...ROLES_LECTURE_ACHATS)
  detailImport(@Param('id') id: string) {
    return this.ordersImport.detail(id);
  }

  @Post(':id/avenants')
  @Roles(...ROLES_SAISIE_COMMANDE_ACHAT)
  amender(
    @Param('id') id: string,
    @Body() dto: AmendCommandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.amender(id, dto, user);
  }

  @Post(':id/soumettre')
  @Roles(...ROLES_SAISIE_COMMANDE_ACHAT)
  soumettre(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersImport.soumettre(id, user);
  }

  @Post(':id/approuver')
  @Roles(...ROLES_APPROBATION_COMMANDE_ACHAT)
  approuver(
    @Param('id') id: string,
    @Body() dto: DecisionCommandeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.approuver(id, dto, user);
  }

  @Post(':id/rejeter')
  @Roles(...ROLES_APPROBATION_COMMANDE_ACHAT)
  rejeter(
    @Param('id') id: string,
    @Body() dto: DecisionCommandeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.rejeter(id, dto, user);
  }

  @Post(':id/production')
  @Roles(...ROLES_LOGISTIQUE_IMPORT)
  production(
    @Param('id') id: string,
    @Body() dto: JalonCommandeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.production(id, dto, user);
  }

  @Post(':id/expeditions')
  @Roles(...ROLES_LOGISTIQUE_IMPORT)
  creerExpedition(
    @Param('id') id: string,
    @Body() dto: CreateExpeditionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.creerExpedition(id, dto, user);
  }

  @Patch(':id/expeditions/:expeditionId/dossier')
  @Roles(...ROLES_LOGISTIQUE_IMPORT)
  mettreAJourDossier(
    @Param('id') id: string,
    @Param('expeditionId') expeditionId: string,
    @Body() dto: UpdateDossierDouaneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.mettreAJourDossier(id, expeditionId, dto, user);
  }

  @Post(':id/expeditions/:expeditionId/dossier/documents')
  @Roles(...ROLES_LOGISTIQUE_IMPORT)
  ajouterDocument(
    @Param('id') id: string,
    @Param('expeditionId') expeditionId: string,
    @Body() dto: CreateDocumentImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.ajouterDocument(id, expeditionId, dto, user);
  }

  @Post(':id/expeditions/:expeditionId/dossier/couts')
  @Roles(...ROLES_LOGISTIQUE_IMPORT)
  ajouterCout(
    @Param('id') id: string,
    @Param('expeditionId') expeditionId: string,
    @Body() dto: CreateCoutImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersImport.ajouterCout(id, expeditionId, dto, user);
  }

  @Get(':id/cout-rendu')
  @Roles(...ROLES_LECTURE_ACHATS)
  coutRendu(@Param('id') id: string) {
    return this.ordersImport.coutRendu(id);
  }

  @Post(':id/comparaison-transport')
  @Roles(...ROLES_LECTURE_ACHATS)
  comparerTransport(@Param('id') id: string, @Body() dto: CompareScenariosDto) {
    return this.ordersImport.comparer(id, dto);
  }

  @Post(':id/confirmer')
  @Roles(...ROLES_APPROBATION_COMMANDE_ACHAT)
  confirmer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.confirmer(id, user);
  }

  @Post(':id/annuler')
  @Roles(...ROLES_COMMANDE_ACHAT)
  annuler(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.annuler(id, user);
  }

  @Post(':id/cloturer')
  @Roles(...ROLES_COMMANDE_ACHAT)
  cloturer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.cloturer(id, user);
  }
}
