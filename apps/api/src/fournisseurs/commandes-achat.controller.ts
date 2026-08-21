import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_COMMANDE_ACHAT,
  ROLES_LECTURE_ACHATS,
} from '../caisses/access-scope.constants';
import { CommandesAchatService } from './commandes-achat.service';
import { CreateCommandeAchatDto } from './dto/create-commande-achat.dto';

@Controller('achats/commandes')
export class CommandesAchatController {
  constructor(private readonly commandes: CommandesAchatService) {}

  @Post()
  @Roles(...ROLES_COMMANDE_ACHAT)
  creer(
    @Body() dto: CreateCommandeAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.commandes.creer(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_ACHATS)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.commandes.lister(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.detail(id, user);
  }

  @Post(':id/confirmer')
  @Roles(...ROLES_COMMANDE_ACHAT)
  confirmer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.confirmer(id, user);
  }

  @Post(':id/annuler')
  @Roles(...ROLES_COMMANDE_ACHAT)
  annuler(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.annuler(id, user);
  }

  @Post(':id/cloturer')
  @Roles(...ROLES_COMMANDE_ACHAT)
  cloturer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commandes.cloturer(id, user);
  }
}
