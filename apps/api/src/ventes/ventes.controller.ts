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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_LECTURE_CAISSES,
  ROLES_POS_ECRITURE,
} from '../caisses/access-scope.constants';
import { VentesService } from './ventes.service';
import { CreateSessionCaisseDto } from './dto/create-session-caisse.dto';
import { ClotureSessionCaisseDto } from './dto/cloture-session-caisse.dto';
import { CreateVenteDto } from './dto/create-vente.dto';
import { CreateRetourDto } from './dto/create-retour.dto';
import { UpsertReservationDto } from './dto/paiement-reservation.dto';
import { dessinerEtatSession } from '../impressions/etat-session.pdf';
import { pipePdf } from '../impressions/pdf.util';

// Endpoints POS — sessions de caisse et encaissement (§6.3.2, §5.1).
// Écriture : caissier / responsable boutique uniquement (ROLES_POS_ECRITURE).
// Le convoyeur n’encaisse pas (§4 / §6.4).
@Controller('ventes')
export class VentesController {
  constructor(private readonly ventesService: VentesService) {}

  @Get('temoins-eligibles')
  @Roles(...ROLES_POS_ECRITURE)
  listerTemoinsEligibles(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.ventesService.listerTemoinsEligibles(utilisateur);
  }

  @Post('sessions')
  @Roles(...ROLES_POS_ECRITURE)
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
  @Roles(...ROLES_POS_ECRITURE)
  encaisserVente(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVenteDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.encaisserVente(id, dto, utilisateur);
  }

  @Put('sessions/:id/reservations')
  @Roles(...ROLES_POS_ECRITURE)
  upsertReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertReservationDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.upsertReservation(id, dto, utilisateur);
  }

  @Get('sessions/:id/reservations')
  @Roles(...ROLES_POS_ECRITURE)
  listerTicketsAttente(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.listerTicketsAttente(id, utilisateur);
  }

  @Delete('sessions/:id/reservations/:holdId')
  @Roles(...ROLES_POS_ECRITURE)
  libererReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.libererReservation(id, holdId, utilisateur);
  }

  @Post('sessions/:id/retours')
  @Roles(...ROLES_POS_ECRITURE)
  creerRetour(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRetourDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.creerRetour(id, dto, utilisateur);
  }

  @Post('sessions/:id/cloture')
  @Roles(...ROLES_POS_ECRITURE)
  cloturerSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClotureSessionCaisseDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.cloturerSession(id, dto, utilisateur);
  }

  @Get('sessions/:id/etat')
  @Roles(...ROLES_LECTURE_CAISSES)
  async etatSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    const { etat } = await this.ventesService.chargerEtatSession(
      id,
      utilisateur,
    );
    return {
      ...etat,
      ouvertureDateHeure: etat.ouvertureDateHeure.toISOString(),
      clotureDateHeure: etat.clotureDateHeure
        ? etat.clotureDateHeure.toISOString()
        : null,
      imprimeAt: etat.imprimeAt.toISOString(),
      ventes: etat.ventes.map((v) => ({
        ...v,
        dateVente: v.dateVente.toISOString(),
      })),
    };
  }

  @Get('sessions/:id/cloture/pdf')
  @Roles(...ROLES_LECTURE_CAISSES)
  async telechargerRelevePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { etat } = await this.ventesService.genererReleveCloture(
      id,
      utilisateur,
    );
    const prefix = etat.typeEtat === 'Z' ? 'etat-z' : 'etat-x';
    pipePdf(
      res,
      `${prefix}-session-${etat.sessionId}.pdf`,
      (doc) => dessinerEtatSession(doc, etat),
      `${prefix === 'etat-z' ? 'État Z' : 'État X'} · document de caisse §6.3.4`,
    );
  }
}
