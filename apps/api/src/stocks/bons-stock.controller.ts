import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_BON_STOCK_FAIT,
  ROLES_BON_STOCK_PILOTE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { BonsStockService } from './bons-stock.service';
import {
  CreateBonStockDto,
  CreateCoutLogistiqueDto,
  CreateLotDto,
  CreateRegleReapproDto,
} from './dto/create-bon-stock.dto';

@Controller('stocks')
export class BonsStockController {
  constructor(private readonly bons: BonsStockService) {}

  @Get('emplacements')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  emplacements() {
    return this.bons.listerEmplacements();
  }

  @Get('bons')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.bons.lister(user);
  }

  @Get('bons/:id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.detail(id, user);
  }

  @Post('bons')
  @Roles(...ROLES_BON_STOCK_PILOTE)
  creer(@Body() dto: CreateBonStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bons.creer(dto, user);
  }

  @Post('bons/:id/pret')
  @Roles(...ROLES_BON_STOCK_PILOTE)
  pret(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.pret(id, user);
  }

  @Post('bons/:id/annuler')
  @Roles(...ROLES_BON_STOCK_FAIT)
  annuler(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.annuler(id, user);
  }

  @Post('bons/:id/valider')
  @Roles(...ROLES_BON_STOCK_FAIT)
  valider(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.valider(id, user);
  }

  @Get('reappro')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  listerRegles() {
    return this.bons.listerRegles();
  }

  @Post('reappro')
  @Roles(...ROLES_BON_STOCK_PILOTE)
  upsertRegle(
    @Body() dto: CreateRegleReapproDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.upsertRegle(dto, user);
  }

  @Post('reappro/lancer')
  @Roles(...ROLES_BON_STOCK_PILOTE)
  lancer(@CurrentUser() user: AuthenticatedUser) {
    return this.bons.lancerReappro(user);
  }

  @Get('lots')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  lots(@Query('produitId') produitId?: string) {
    return this.bons.listerLots(produitId);
  }

  @Post('lots')
  @Roles(...ROLES_BON_STOCK_PILOTE)
  creerLot(@Body() dto: CreateLotDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bons.creerLot(dto, user);
  }

  @Post('couts-logistiques')
  @Roles(...ROLES_BON_STOCK_PILOTE)
  cout(
    @Body() dto: CreateCoutLogistiqueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.ajouterCoutLogistique(dto, user);
  }

  @Get('prevu')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  prevu(
    @Query('produitId') produitId: string,
    @Query('entrepotId') entrepotId: string,
  ) {
    return this.bons.stockPrevu(produitId, entrepotId);
  }
}
