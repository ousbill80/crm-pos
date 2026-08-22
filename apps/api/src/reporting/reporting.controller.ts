import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_CONTROLE_COHERENCE,
  ROLES_LECTURE_CAISSES,
  ROLES_RESEAU_TRESORERIE,
} from '../caisses/access-scope.constants';
import { ReportingService } from './reporting.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { VentesQuotidiennesQueryDto } from './dto/ventes-quotidiennes-query.dto';
import { ControleCoherenceQueryDto } from './dto/controle-coherence-query.dto';
import {
  dessinerDafPdf,
  dessinerDashboardPdf,
} from '../impressions/reporting.pdf';
import { pipePdf } from '../impressions/pdf.util';

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

  /** Cockpit Finance DAF — pôle central (résultat + stocks + trésorerie). */
  @Get('daf')
  @Roles(...ROLES_RESEAU_TRESORERIE)
  getDaf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportingService.getDaf(user, query);
  }

  @Get('daf/export.csv')
  @Roles(...ROLES_RESEAU_TRESORERIE)
  async exportDafCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.reportingService.getDafCsv(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="finance-daf.csv"',
    );
    res.send(csv);
  }

  @Get('daf/export.pdf')
  @Roles(...ROLES_RESEAU_TRESORERIE)
  async exportDafPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const [data, societe] = await Promise.all([
      this.reportingService.getDaf(user, query),
      this.reportingService.enteteSociete(),
    ]);
    pipePdf(
      res,
      'finance-daf.pdf',
      (doc) => dessinerDafPdf(doc, data, societe),
      'Finance DAF · §6.3.4 · grand livre append-only',
    );
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

  @Get('dashboard/export.pdf')
  @Roles(...ROLES_LECTURE_CAISSES)
  async exportDashboardPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const [data, societe] = await Promise.all([
      this.reportingService.getDashboard(user, query),
      this.reportingService.enteteSociete(),
    ]);
    pipePdf(
      res,
      'tableau-de-bord.pdf',
      (doc) => dessinerDashboardPdf(doc, data, societe),
      'Tableau de bord · §6.3.4',
    );
  }

  /** Rapprochement 3 voies (§5.2) — contrôle interne. */
  @Get('controle-coherence')
  @Roles(...ROLES_CONTROLE_COHERENCE)
  getControleCoherence(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ControleCoherenceQueryDto,
  ) {
    return this.reportingService.getControleCoherence(user, query);
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
