import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types';
import { CampagnesService } from './campagnes.service';
import { CreateCampagneDto } from '../dto/create-campagne.dto';
import { CRM_ROLES_ADMIN, CRM_ROLES_LECTURE } from '../crm-roles.constants';

// Endpoints Campagnes CRM (§6.6) — ciblage + export CSV, jamais d'envoi
// automatisé (voir campagnes.service.ts).
@Controller('crm/campagnes')
export class CampagnesController {
  constructor(private readonly campagnesService: CampagnesService) {}

  @Post()
  @Roles(...CRM_ROLES_ADMIN)
  create(
    @Body() dto: CreateCampagneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campagnesService.create(dto, user.userId);
  }

  @Get()
  @Roles(...CRM_ROLES_LECTURE)
  findAll() {
    return this.campagnesService.findAll();
  }

  @Get(':id')
  @Roles(...CRM_ROLES_LECTURE)
  findOne(@Param('id') id: string) {
    return this.campagnesService.findOne(id);
  }

  @Get(':id/contacts')
  @Roles(...CRM_ROLES_LECTURE)
  contacts(@Param('id') id: string) {
    return this.campagnesService.contacts(id);
  }

  @Get(':id/contacts/export.csv')
  @Roles(...CRM_ROLES_LECTURE)
  async exportContactsCsv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.campagnesService.contactsCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="campagne-${id}-contacts.csv"`,
    );
    res.send(csv);
  }
}
