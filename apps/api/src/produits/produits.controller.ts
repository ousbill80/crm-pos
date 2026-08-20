import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { ProduitsService } from './produits.service';
import { CreateProduitDto } from './dto/create-produit.dto';
import { UpdateProduitDto } from './dto/update-produit.dto';

// Endpoints Produit — catalogue du POS (§6.3.2). RBAC identique aux
// modules zones/boutiques : administration système en écriture, périmètre
// caisses/boutiques + réseau structure en lecture.
@Controller('produits')
export class ProduitsController {
  constructor(private readonly produitsService: ProduitsService) {}

  @Post()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  create(
    @Body() dto: CreateProduitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.create(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findAll() {
    return this.produitsService.findAll();
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string) {
    return this.produitsService.findOne(id);
  }

  @Get(':id/mouvements')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findMouvements(@Param('id') id: string) {
    return this.produitsService.findMouvements(id);
  }

  @Patch(':id')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProduitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.update(id, dto, user);
  }
}
