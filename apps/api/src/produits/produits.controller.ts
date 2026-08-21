import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { ListProduitsQueryDto } from './dto/list-produits-query.dto';

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
  findAll(@Query() query: ListProduitsQueryDto) {
    return this.produitsService.findAll(query);
  }

  @Get('export.csv')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  async exportCsv(@Query() query: ListProduitsQueryDto, @Res() res: Response) {
    const csv = await this.produitsService.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="catalogue-produits.csv"',
    );
    res.send(csv);
  }

  @Get('synthese')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  synthese() {
    return this.produitsService.synthese();
  }

  @Get('classement')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  classement() {
    return this.produitsService.classement();
  }

  @Get('categories')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  categories() {
    return this.produitsService.categories();
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string) {
    return this.produitsService.findOne(id);
  }

  @Get(':id/analyse')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  analyse(@Param('id') id: string) {
    return this.produitsService.analyse(id);
  }

  @Get(':id/ventes')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findVentes(@Param('id') id: string) {
    return this.produitsService.findVentes(id);
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
