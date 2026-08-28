import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_APPROBATION_DEMANDE_ACHAT,
  ROLES_DEMANDE_ACHAT_ECRITURE,
  ROLES_LECTURE_ACHATS,
  ROLES_SOURCING_ACHAT,
} from '../caisses/access-scope.constants';
import {
  CreateConsultationDto,
  CreateDemandeAchatDto,
  CreateOffreFournisseurDto,
  DecisionDemandeAchatDto,
  RecommandationsAchatQueryDto,
  UpdateDemandeAchatDto,
} from './dto/planning-achat.dto';
import { PlanningAchatsService } from './planning-achats.service';
import { RecommandationsAchatsService } from './recommandations-achats.service';
import {
  ActiveBudgetListQueryDto,
  CostCentreListQueryDto,
} from './dto/p2p-list.dto';
import { SourcingAchatsService } from './sourcing-achats.service';

@Controller('achats')
export class PlanningAchatsController {
  constructor(
    private readonly planning: PlanningAchatsService,
    private readonly sourcing: SourcingAchatsService,
    private readonly recommandations: RecommandationsAchatsService,
  ) {}

  @Get('centres-cout')
  @Roles(...ROLES_LECTURE_ACHATS)
  centresCout(
    @Query() query: CostCentreListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.listerCentresCout(query, user);
  }

  @Get('budgets/actifs')
  @Roles(...ROLES_LECTURE_ACHATS)
  budgetsActifs(
    @Query() query: ActiveBudgetListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.listerBudgetsActifs(query, user);
  }

  @Post('demandes')
  @Roles(...ROLES_DEMANDE_ACHAT_ECRITURE)
  creer(
    @Body() dto: CreateDemandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.creer(dto, user);
  }

  @Get('demandes')
  @Roles(...ROLES_LECTURE_ACHATS)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.planning.lister(user);
  }

  @Get('demandes/:id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.planning.detail(id, user);
  }

  @Patch('demandes/:id')
  @Roles(...ROLES_DEMANDE_ACHAT_ECRITURE)
  modifier(
    @Param('id') id: string,
    @Body() dto: UpdateDemandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.modifier(id, dto, user);
  }

  @Post('demandes/:id/soumettre')
  @Roles(...ROLES_DEMANDE_ACHAT_ECRITURE)
  soumettre(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.planning.soumettre(id, user);
  }

  @Post('demandes/:id/approuver')
  @Roles(...ROLES_APPROBATION_DEMANDE_ACHAT)
  approuver(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.planning.approuver(id, user);
  }

  @Post('demandes/:id/rejeter')
  @Roles(...ROLES_APPROBATION_DEMANDE_ACHAT)
  rejeter(
    @Param('id') id: string,
    @Body() dto: DecisionDemandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.rejeter(id, dto, user);
  }

  @Post('demandes/:id/annuler')
  @Roles(...ROLES_DEMANDE_ACHAT_ECRITURE)
  annuler(
    @Param('id') id: string,
    @Body() dto: DecisionDemandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.annuler(id, dto, user);
  }

  @Delete('demandes/:id')
  @Roles(...ROLES_DEMANDE_ACHAT_ECRITURE)
  supprimer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.planning.annuler(id, {}, user);
  }

  @Post('demandes/:id/consultations')
  @Roles(...ROLES_SOURCING_ACHAT)
  creerConsultation(
    @Param('id') id: string,
    @Body() dto: CreateConsultationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sourcing.creerConsultation(id, dto, user);
  }

  @Get('consultations/:id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detailConsultation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sourcing.detail(id, user);
  }

  @Post('consultations/:id/offres')
  @Roles(...ROLES_SOURCING_ACHAT)
  ajouterOffre(
    @Param('id') id: string,
    @Body() dto: CreateOffreFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sourcing.ajouterOffre(id, dto, user);
  }

  @Get('consultations/:id/comparaison')
  @Roles(...ROLES_LECTURE_ACHATS)
  comparer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sourcing.comparer(id, user);
  }

  @Get('recommandations')
  @Roles(...ROLES_LECTURE_ACHATS)
  recommandationsAchat(
    @Query() query: RecommandationsAchatQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommandations.calculer(query, user);
  }
}
