import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
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

// Endpoints POS — sessions de caisse et encaissement (§6.3.2, §5.1). Toute
// écriture est réservée au périmètre boutique (caissier/responsable
// boutique) : une caisse auxiliaire encaisse et initie, jamais plus (règle
// de séparation des tâches, cf. CLAUDE.md).
@Controller('ventes')
export class VentesController {
  constructor(private readonly ventesService: VentesService) {}

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

  @Post('sessions/:id/ventes')
  @Roles(...ROLES_PERIMETRE_BOUTIQUE)
  encaisserVente(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVenteDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ventesService.encaisserVente(id, dto, utilisateur);
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
}
