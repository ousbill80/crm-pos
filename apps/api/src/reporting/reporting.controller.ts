import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_LECTURE_CAISSES } from '../caisses/access-scope.constants';
import { ReportingService } from './reporting.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { VentesQuotidiennesQueryDto } from './dto/ventes-quotidiennes-query.dto';

// Endpoints Reporting — §6.3.4, §6.7 du cahier des charges.
@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('dashboard')
  @Roles(...ROLES_LECTURE_CAISSES)
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportingService.getDashboard(user, query);
  }

  @Get('ventes-quotidiennes')
  @Roles(...ROLES_LECTURE_CAISSES)
  ventesQuotidiennes(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VentesQuotidiennesQueryDto,
  ) {
    return this.reportingService.ventesQuotidiennes(user, query.jours ?? 30);
  }

  @Get('tresorerie-pilotage')
  @Roles(...ROLES_LECTURE_CAISSES)
  getTresoreriePilotage(@CurrentUser() user: AuthenticatedUser) {
    return this.reportingService.getTresoreriePilotage(user);
  }

  @Get('dashboard/export.csv')
  @Roles(...ROLES_LECTURE_CAISSES)
  async exportDashboardCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.reportingService.getDashboardCsv(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tableau-de-bord.csv"',
    );
    res.send(csv);
  }

  @Get('ventes/export.csv')
  @Roles(...ROLES_LECTURE_CAISSES)
  async exportVentesCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.reportingService.getVentesCsv(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ventes.csv"');
    res.send(csv);
  }
}
