import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from './stock.service';
import { AjusterStockDto } from './dto/ajuster-stock.dto';
import { TransfererStockDto } from './dto/transferer-stock.dto';

@Controller('stocks')
export class StocksController {
  constructor(
    private readonly stocks: StockService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('synthese')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  async synthese(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entrepotId') entrepotId?: string,
  ) {
    const entrepotIds = await this.resolveEntrepotScope(user, entrepotId);
    return this.stocks.synthese(entrepotIds);
  }

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entrepotId') entrepotId?: string,
    @Query('produitId') produitId?: string,
  ) {
    const entrepotIds = await this.resolveEntrepotScope(user, entrepotId);
    return this.stocks.listerQuants({
      produitId,
      entrepotId:
        entrepotId && entrepotIds.includes(entrepotId) ? entrepotId : undefined,
      entrepotIds: entrepotId ? undefined : entrepotIds,
    });
  }

  @Get('mouvements')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  async mouvements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entrepotId') entrepotId?: string,
    @Query('produitId') produitId?: string,
  ) {
    const entrepotIds = await this.resolveEntrepotScope(user, entrepotId);
    return this.stocks.listerMouvements({
      produitId,
      entrepotId:
        entrepotId && entrepotIds.includes(entrepotId) ? entrepotId : undefined,
      entrepotIds: entrepotId ? undefined : entrepotIds,
    });
  }

  @Get('mouvements/:id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  async mouvement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const entrepotIds = await this.resolveEntrepotScope(user);
    return this.stocks.trouverMouvement(id, entrepotIds);
  }

  @Post('ajustements')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  async ajuster(
    @Body() dto: AjusterStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertEntrepotWritable(user, dto.entrepotId);
    const mouvement = await this.stocks.ajuster({
      produitId: dto.produitId,
      entrepotId: dto.entrepotId,
      quantiteComptee: dto.quantiteComptee,
      utilisateurId: user.userId,
      reference: dto.reference,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'STOCK_AJUSTEMENT',
      entite: 'MouvementStock',
      entiteId: mouvement.id,
      details: JSON.stringify(dto),
    });
    return mouvement;
  }

  @Post('transferts')
  @Roles(...ROLES_ADMIN_STRUCTURE, ...ROLES_PERIMETRE_BOUTIQUE)
  async transferer(
    @Body() dto: TransfererStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertEntrepotWritable(user, dto.entrepotSourceId);
    await this.assertEntrepotWritable(user, dto.entrepotDestId);
    const result = await this.stocks.transferer({
      produitId: dto.produitId,
      entrepotSourceId: dto.entrepotSourceId,
      entrepotDestId: dto.entrepotDestId,
      quantite: dto.quantite,
      utilisateurId: user.userId,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'STOCK_TRANSFERT',
      entite: 'MouvementStock',
      entiteId: result.sortie.id,
      details: JSON.stringify(dto),
    });
    return result;
  }

  private async resolveEntrepotScope(
    user: AuthenticatedUser,
    entrepotId?: string,
  ): Promise<string[]> {
    let boutiqueFilter: { id?: string; zoneId?: string } | undefined;
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      boutiqueFilter = undefined;
    } else if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      boutiqueFilter = { zoneId };
    } else if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      boutiqueFilter = { id: requireOwnBoutiqueId(user) };
    } else {
      throw new ForbiddenException('Périmètre stock non déterminé.');
    }

    const entrepots = await this.prisma.entrepot.findMany({
      where: {
        ...(boutiqueFilter ? { boutique: boutiqueFilter } : {}),
        ...(entrepotId ? { id: entrepotId } : {}),
        actif: true,
      },
      select: { id: true },
    });
    if (entrepotId && !entrepots.some((e) => e.id === entrepotId)) {
      throw new ForbiddenException('Entrepôt hors périmètre.');
    }
    return entrepots.map((e) => e.id);
  }

  private async assertEntrepotWritable(
    user: AuthenticatedUser,
    entrepotId: string,
  ): Promise<void> {
    await this.resolveEntrepotScope(user, entrepotId);
  }
}
