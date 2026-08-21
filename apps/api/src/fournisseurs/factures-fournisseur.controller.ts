import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_FACTURE_FOURNISSEUR,
  ROLES_LECTURE_ACHATS,
  ROLES_PAIEMENT_FOURNISSEUR,
} from '../caisses/access-scope.constants';
import { FacturesFournisseurService } from './factures-fournisseur.service';
import { CreateFactureFournisseurDto } from './dto/create-facture-fournisseur.dto';
import { CreatePaiementFournisseurDto } from './dto/create-paiement-fournisseur.dto';

@Controller('achats/factures')
export class FacturesFournisseurController {
  constructor(private readonly factures: FacturesFournisseurService) {}

  @Post()
  @Roles(...ROLES_FACTURE_FOURNISSEUR)
  creer(
    @Body() dto: CreateFactureFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.creer(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_ACHATS)
  lister() {
    return this.factures.lister();
  }

  @Get('a-facturer')
  @Roles(...ROLES_LECTURE_ACHATS)
  aFacturer(@Query('fournisseurId') fournisseurId?: string) {
    return this.factures.receptionsAFacturer(fournisseurId);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detail(@Param('id') id: string) {
    return this.factures.detail(id);
  }

  @Post(':id/comptabiliser')
  @Roles(...ROLES_FACTURE_FOURNISSEUR)
  comptabiliser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.comptabiliser(id, user);
  }

  @Post(':id/annuler')
  @Roles(...ROLES_FACTURE_FOURNISSEUR)
  annuler(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.factures.annuler(id, user);
  }

  @Post(':id/paiements')
  @Roles(...ROLES_PAIEMENT_FOURNISSEUR)
  payer(
    @Param('id') id: string,
    @Body() dto: CreatePaiementFournisseurDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.payer(id, dto, user);
  }
}
