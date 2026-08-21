import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  RoleLibelle,
  ROLES_REGULARISATION_LITIGE,
  ROLES_VALIDATION_CAISSE_CENTRALE,
} from '@caisse-crm/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_LECTURE_CAISSES } from '../caisses/access-scope.constants';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { RapprocherTransactionDto } from './dto/rapprocher-transaction.dto';
import { RegulariserTransactionDto } from './dto/regulariser-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

// Endpoints de la machine à états des transactions de caisse (§6.4). Chaque
// route sensible porte @Roles(...) explicitement : aucune route de ce
// contrôleur ne doit être laissée sans restriction de rôle, sous peine de
// devenir accessible à n'importe quel utilisateur authentifié (cf. RolesGuard).
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // Lecture (§6.2) : même périmètre de rôles que la lecture des caisses
  // (réseau trésorerie, superviseur de zone, périmètre boutique).
  @Get()
  @Roles(...ROLES_LECTURE_CAISSES)
  findAll(
    @Query() query: ListTransactionsQueryDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.findAll(utilisateur, query);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_CAISSES)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.findOne(id, utilisateur);
  }

  // INITIEE — §6.4 : caissier boutique / responsable boutique uniquement.
  @Post()
  @Roles(RoleLibelle.CAISSIER_BOUTIQUE, RoleLibelle.RESPONSABLE_BOUTIQUE)
  initier(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.initier(dto, utilisateur);
  }

  // EN_TRANSIT — §6.4 : responsable boutique. Le "convoyeur" cité par le
  // cahier des charges n'a pas de rôle dédié dans le référentiel (voir
  // rapport de fin de tâche) : non implémenté séparément.
  @Patch(':id/transit')
  @Roles(RoleLibelle.RESPONSABLE_BOUTIQUE)
  @HttpCode(HttpStatus.OK)
  passerEnTransit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.passerEnTransit(id, utilisateur);
  }

  // RECEPTIONNEE — §6.4 : Caissier Central / DAF UNIQUEMENT. Une caisse
  // auxiliaire (boutique) ne doit jamais pouvoir atteindre cette route :
  // appliqué ici côté serveur via @Roles(), pas seulement masqué côté UI.
  @Patch(':id/receptionner')
  @Roles(...ROLES_VALIDATION_CAISSE_CENTRALE)
  @HttpCode(HttpStatus.OK)
  receptionner(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.receptionner(id, utilisateur);
  }

  // VALIDEE / LITIGE — §6.4 : Caissier Central / DAF UNIQUEMENT, à l'issue
  // du rapprochement (écart nul => VALIDEE, écart non nul => LITIGE).
  @Patch(':id/rapprocher')
  @Roles(...ROLES_VALIDATION_CAISSE_CENTRALE)
  @HttpCode(HttpStatus.OK)
  rapprocher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RapprocherTransactionDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.rapprocher(id, dto, utilisateur);
  }

  // LITIGE → VALIDEE — §6.4 : Contrôle interne / DAF uniquement.
  @Patch(':id/regulariser')
  @Roles(...ROLES_REGULARISATION_LITIGE)
  @HttpCode(HttpStatus.OK)
  regulariser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegulariserTransactionDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.regulariser(id, dto, utilisateur);
  }
}
