import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_P2P_COMPTABILITE_ECRITURE,
  ROLES_P2P_COMPTABILITE_LECTURE,
  ROLES_P2P_IMMO_DOTATION,
} from '../caisses/access-scope.constants';
import {
  CreateImmobilisationDto,
  GenererDotationsDto,
  ImmobilisationListQueryDto,
  SortirImmobilisationDto,
} from './dto/immobilisation.dto';
import { ImmobilisationsService } from './immobilisations.service';

@Controller('achats/comptabilite/immobilisations')
export class ImmobilisationsController {
  constructor(private readonly immos: ImmobilisationsService) {}

  @Get()
  @Roles(...ROLES_P2P_COMPTABILITE_LECTURE)
  list(@Query() query: ImmobilisationListQueryDto) {
    return this.immos.list(query.societeId);
  }

  @Post()
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  create(
    @Body() dto: CreateImmobilisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immos.create(dto, user);
  }

  @Post('dotations')
  @Roles(...ROLES_P2P_IMMO_DOTATION)
  generer(
    @Body() dto: GenererDotationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immos.genererMois(dto, user);
  }

  @Post(':id/sortir')
  @Roles(...ROLES_P2P_COMPTABILITE_ECRITURE)
  sortir(
    @Param('id') id: string,
    @Body() dto: SortirImmobilisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immos.sortir(id, dto, user);
  }
}
