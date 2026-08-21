import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_INVENTAIRE_COMPTAGE,
  ROLES_INVENTAIRE_VALIDATION,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { AuditService } from '../audit/audit.service';
import { InventairesService } from './inventaires.service';
import { OuvrirInventaireDto } from './dto/ouvrir-inventaire.dto';
import { CompterLigneInventaireDto } from './dto/compter-ligne-inventaire.dto';

@Controller('inventaires')
export class InventairesController {
  constructor(
    private readonly inventaires: InventairesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.inventaires.lister(user);
  }

  @Get('priorites')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  priorites(@CurrentUser() user: AuthenticatedUser) {
    return this.inventaires.priorites(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventaires.detail(id, user);
  }

  @Post()
  @Roles(...ROLES_INVENTAIRE_COMPTAGE)
  async ouvrir(
    @Body() dto: OuvrirInventaireDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.inventaires.ouvrir(
      user,
      dto.entrepotId,
      dto.motif,
    );
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'INVENTAIRE_OUVERT',
      entite: 'SessionInventaire',
      entiteId: session.id,
      details: JSON.stringify(dto),
    });
    return session;
  }

  @Patch(':id/lignes')
  @Roles(...ROLES_INVENTAIRE_COMPTAGE)
  compter(
    @Param('id') id: string,
    @Body() dto: CompterLigneInventaireDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventaires.compter(
      id,
      user,
      dto.produitId,
      dto.quantiteComptee,
    );
  }

  @Post(':id/reporter-theorique')
  @Roles(...ROLES_INVENTAIRE_COMPTAGE)
  reporterTheorique(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventaires.reporterTheorique(id, user);
  }

  @Post(':id/valider')
  @Roles(...ROLES_INVENTAIRE_VALIDATION)
  async valider(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.inventaires.valider(id, user);
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'INVENTAIRE_VALIDE',
      entite: 'SessionInventaire',
      entiteId: session.id,
      details: `lignes=${session.lignes.length}`,
    });
    return session;
  }

  @Post(':id/annuler')
  @Roles(...ROLES_INVENTAIRE_COMPTAGE)
  async annuler(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.inventaires.annuler(id, user);
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'INVENTAIRE_ANNULE',
      entite: 'SessionInventaire',
      entiteId: session.id,
    });
    return session;
  }
}
