import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DevisService } from './devis.service';
import {
  CreateDevisDto,
  ListDevisQueryDto,
  TransitionDevisDto,
  UpdateDevisDto,
} from './dto/devis.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_DEVIS_ECRITURE,
  ROLES_DEVIS_LECTURE,
} from './devis-rules.constants';
import { dessinerDevisClientPdf } from '../impressions/devis-client.pdf';
import { pipePdf } from '../impressions/pdf.util';

@Controller('devis')
export class DevisController {
  constructor(private readonly devisService: DevisService) {}

  @Get()
  @Roles(...ROLES_DEVIS_LECTURE)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDevisQueryDto,
  ) {
    return this.devisService.findAll(user, query);
  }

  @Get(':id/pdf')
  @Roles(...ROLES_DEVIS_LECTURE)
  async telechargerPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const data = await this.devisService.getDevisPdfData(id, user);
    pipePdf(
      res,
      `devis-${data.numero}.pdf`,
      (doc) => dessinerDevisClientPdf(doc, data),
      'Devis client · hors TVA',
    );
  }

  @Get(':id')
  @Roles(...ROLES_DEVIS_LECTURE)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devisService.findOne(id, user);
  }

  @Post()
  @Roles(...ROLES_DEVIS_ECRITURE)
  create(@Body() dto: CreateDevisDto, @CurrentUser() user: AuthenticatedUser) {
    return this.devisService.create(dto, user);
  }

  @Put(':id')
  @Roles(...ROLES_DEVIS_ECRITURE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDevisDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devisService.update(id, dto, user);
  }

  @Patch(':id/statut')
  @Roles(...ROLES_DEVIS_ECRITURE)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDevisDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devisService.transition(id, dto, user);
  }
}
