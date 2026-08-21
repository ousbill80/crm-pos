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
  ROLES_INITIATION_SORTIE_FONDS,
  ROLES_MISE_EN_TRANSIT,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
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

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

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

  @Post()
  @Roles(...ROLES_INITIATION_SORTIE_FONDS)
  initier(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.initier(dto, utilisateur);
  }

  // EN_TRANSIT — §6.4 : responsable boutique ou convoyeur.
  @Patch(':id/transit')
  @Roles(...ROLES_MISE_EN_TRANSIT)
  @HttpCode(HttpStatus.OK)
  passerEnTransit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.passerEnTransit(id, utilisateur);
  }

  @Patch(':id/receptionner')
  @Roles(...ROLES_VALIDATION_CAISSE_CENTRALE)
  @HttpCode(HttpStatus.OK)
  receptionner(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.receptionner(id, utilisateur);
  }

  // Rapprochement : Central / DAF, + Direction Générale pour seuils
  // exceptionnels (garde fine dans le service).
  @Patch(':id/rapprocher')
  @Roles(...ROLES_VALIDATION_CAISSE_CENTRALE, RoleLibelle.DIRECTION_GENERALE)
  @HttpCode(HttpStatus.OK)
  rapprocher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RapprocherTransactionDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.rapprocher(id, dto, utilisateur);
  }

  @Patch(':id/regulariser')
  @Roles(...ROLES_REGULARISATION_LITIGE, ...ROLES_REGULARISATION_LITIGE_INTERNE)
  @HttpCode(HttpStatus.OK)
  regulariser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegulariserTransactionDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.transactionsService.regulariser(id, dto, utilisateur);
  }
}
