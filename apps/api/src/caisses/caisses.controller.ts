import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_ADMIN_STRUCTURE, ROLES_LECTURE_CAISSES } from './access-scope.constants';
import { CreateCaisseDto } from './dto/create-caisse.dto';
import { CaissesService } from './caisses.service';

// Endpoints Caisse — §6.3.1, §6.2 du cahier des charges. Le solde n'est
// jamais exposé depuis la colonne de cache Caisse.soldeCourant : voir
// GET /caisses/:id/solde, calculé à la volée depuis le grand livre.
@Controller('caisses')
export class CaissesController {
  constructor(private readonly caissesService: CaissesService) {}

  @Post()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  create(
    @Body() dto: CreateCaisseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caissesService.create(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_CAISSES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.findAll(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_CAISSES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.findOne(id, user);
  }

  @Get(':id/solde')
  @Roles(...ROLES_LECTURE_CAISSES)
  getSolde(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.getSolde(id, user);
  }
}
