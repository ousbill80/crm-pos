import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
  ROLES_RECEPTION_STOCK,
} from '../caisses/access-scope.constants';
import { FournisseursService } from './fournisseurs.service';
import { CreateFournisseurDto } from './dto/create-fournisseur.dto';
import { UpdateFournisseurDto } from './dto/update-fournisseur.dto';
import { CreateReceptionDto } from './dto/create-reception.dto';

// Endpoints Fournisseur & réception de stock — extension au socle MCD (§6.5).
// Fiches : administration structure. Réceptions fournisseur : SI / DG
// (entrepôt central). La boutique réceptionne les bons de transfert interne.
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

  @Get('synthese')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  synthese() {
    return this.fournisseursService.synthese();
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string) {
    return this.fournisseursService.findOne(id);
  }

  @Patch(':id')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fournisseursService.update(id, dto, user);
  }

  @Post(':id/receptions')
  @Roles(...ROLES_RECEPTION_STOCK)
  creerReception(
    @Param('id') id: string,
    @Body() dto: CreateReceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fournisseursService.creerReception(id, dto, user);
  }
}
