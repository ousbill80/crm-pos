import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_LECTURE_CAISSES,
  ROLES_PERIMETRE_BOUTIQUE,
} from '../caisses/access-scope.constants';
import { VentesService } from './ventes.service';
import { CreateSessionCaisseDto } from './dto/create-session-caisse.dto';
import { ClotureSessionCaisseDto } from './dto/cloture-session-caisse.dto';
import { CreateVenteDto } from './dto/create-vente.dto';
import { CreateRetourDto } from './dto/create-retour.dto';
import { UpsertReservationDto } from './dto/paiement-reservation.dto';

// Endpoints POS — sessions de caisse et encaissement (§6.3.2, §5.1). Toute
// écriture est réservée au périmètre boutique (caissier/responsable
// boutique) : une caisse auxiliaire encaisse et initie, jamais plus (règle
// de séparation des tâches, cf. CLAUDE.md).
@Controller('ventes')
export class VentesController {
  constructor(private readonly ventesService: VentesService) {}

  @Get('temoins-eligibles')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  listerTemoinsEligibles(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.ventesService.listerTemoinsEligibles(utilisateur);
  }

  @Post('sessions')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  ouvrirSession(
    @Body() dto: CreateSessionCaisseDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.ouvrirSession(dto, utilisateur);
  }

  @Get('sessions')
  @Roles(...ROLES_LECTURE_CAISSES)
  findAll(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.ventesService.findAll(utilisateur);
  }

  @Get('sessions/:id')
  @Roles(...ROLES_LECTURE_CAISSES)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.findOne(id, utilisateur);
  }

  @Get('sessions/:id/ventes')
  @Roles(...ROLES_LECTURE_CAISSES)
  listerVentes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.listerVentesSession(id, utilisateur);
  }

  @Post('sessions/:id/ventes')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  encaisserVente(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVenteDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.encaisserVente(id, dto, utilisateur);
  }

  @Put('sessions/:id/reservations')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  upsertReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertReservationDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.upsertReservation(id, dto, utilisateur);
  }

  @Delete('sessions/:id/reservations/:holdId')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  libererReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.libererReservation(id, holdId, utilisateur);
  }

  @Post('sessions/:id/retours')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  creerRetour(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRetourDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.creerRetour(id, dto, utilisateur);
  }

  @Post('sessions/:id/cloture')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  cloturerSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClotureSessionCaisseDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.cloturerSession(id, dto, utilisateur);
  }

  @Get('sessions/:id/cloture/pdf')
  @Roles(...ROLES_LECTURE_CAISSES)
  async telechargerRelevePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { session, releve } = await this.ventesService.genererReleveCloture(
      id,
      utilisateur,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="releve-session-${session.id}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(16).text('Relevé de clôture de session de caisse', {
      align: 'center',
    });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Session : ${session.id}`);
    doc.text(`Statut : ${session.statut}`);
    doc.text(`Ouverture : ${session.ouvertureDateHeure.toISOString()}`);
    if (session.clotureDateHeure) {
      doc.text(`Clôture : ${session.clotureDateHeure.toISOString()}`);
    }
    doc.moveDown();

    doc.fontSize(12).text('Répartition par mode de paiement', {
      underline: true,
    });
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const ligne of releve) {
      doc.text(
        `${ligne.modePaiement} — ${ligne.nombreVentes} vente(s) — ${ligne.total}`,
      );
    }

    doc.end();
  }
}
