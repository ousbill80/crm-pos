import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { FournisseursService } from './fournisseurs.service';
import { CreateFournisseurDto } from './dto/create-fournisseur.dto';
import { CreateReceptionDto } from './dto/create-reception.dto';

// Endpoints Fournisseur & réception de stock — extension au socle MCD (§6.5).
// RBAC identique au catalogue produit : administration système en écriture,
// périmètre caisses/boutiques + réseau structure en lecture.
@Controller('fournisseurs')
export class FournisseursController {
  constructor(private readonly fournisseursService: FournisseursService) {}

  @Post()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  create(
    @Body() dto: CreateFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fournisseursService.create(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findAll() {
    return this.fournisseursService.findAll();
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string) {
    return this.fournisseursService.findOne(id);
  }

  @Post(':id/receptions')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  creerReception(
    @Param('id') id: string,
    @Body() dto: CreateReceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fournisseursService.creerReception(id, dto, user);
  }
}
