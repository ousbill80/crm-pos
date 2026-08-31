import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_CATALOGUE_ECRITURE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { ProduitsService } from './produits.service';
import { CreateProduitDto } from './dto/create-produit.dto';
import { CreateVarianteDto } from './dto/create-variante.dto';
import { UpdateProduitDto } from './dto/update-produit.dto';
import { ListProduitsQueryDto } from './dto/list-produits-query.dto';
import { ImprimerEtiquettesDto } from './dto/imprimer-etiquettes.dto';
import {
  ApercuImportProduitsDto,
  AppliquerImportProduitsDto,
} from './dto/import-produits.dto';
import { dessinerEtiquettesPdf } from '../impressions/etiquettes.pdf';

// Endpoints Produit — catalogue du POS (§6.3.2). RBAC identique aux
// modules zones/boutiques : administration système en écriture, périmètre
// caisses/boutiques + réseau structure en lecture.
@Controller('produits')
export class ProduitsController {
  constructor(private readonly produitsService: ProduitsService) {}

  @Post()
  @Roles(...ROLES_CATALOGUE_ECRITURE)
  create(
    @Body() dto: CreateProduitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.create(dto, user);
  }

  // Écriture (peut générer/persister un codeBarres interne manquant) — même
  // RBAC que PATCH /produits/:id.
  @Post('etiquettes/pdf')
  @HttpCode(200)
  @Roles(...ROLES_CATALOGUE_ECRITURE)
  async imprimerEtiquettes(
    @Body() dto: ImprimerEtiquettesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const data = await this.produitsService.preparerEtiquettes(dto, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="etiquettes-${Date.now()}.pdf"`,
    );
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: { Title: 'Étiquettes catalogue', Author: 'Caisse CRM' },
    });
    doc.pipe(res);
    await dessinerEtiquettesPdf(doc, data);
    doc.end();
  }

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findAll(
    @Query() query: ListProduitsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.findAll(query, user);
  }

  @Get('export.csv')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  async exportCsv(
    @Query() query: ListProduitsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csv = await this.produitsService.exportCsv(query, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="catalogue-produits.csv"',
    );
    res.send(csv);
  }

  @Get('synthese')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  synthese(@CurrentUser() user: AuthenticatedUser) {
    return this.produitsService.synthese(user);
  }

  @Get('classement')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  classement(@CurrentUser() user: AuthenticatedUser) {
    return this.produitsService.classement(user);
  }

  @Get('categories')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  categories() {
    return this.produitsService.categories();
  }

  @Get('import/modele.csv')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  modeleImportCsv(@Res() res: Response) {
    const csv = this.produitsService.modeleImportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="modele-catalogue-produits.csv"',
    );
    res.send(csv);
  }

  @Post('import/apercu')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  apercuImport(@Body() dto: ApercuImportProduitsDto) {
    return this.produitsService.apercuImport(dto);
  }

  @Post('import')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  appliquerImport(
    @Body() dto: AppliquerImportProduitsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.appliquerImport(dto, user);
  }

  @Get(':id/famille-web')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  getFamilleWeb(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.getFamilleWeb(id, user);
  }

  @Post(':id/variantes')
  @Roles(...ROLES_CATALOGUE_ECRITURE)
  createVariante(
    @Param('id') id: string,
    @Body() dto: CreateVarianteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.createVariante(id, dto, user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.produitsService.findOne(id, user);
  }

  @Get(':id/analyse')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  analyse(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.produitsService.analyse(id, user);
  }

  @Get(':id/ventes')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findVentes(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.produitsService.findVentes(id, user);
  }

  @Get(':id/mouvements')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findMouvements(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.findMouvements(id, user);
  }

  @Patch(':id')
  @Roles(...ROLES_CATALOGUE_ECRITURE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProduitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.produitsService.update(id, dto, user);
  }
}
