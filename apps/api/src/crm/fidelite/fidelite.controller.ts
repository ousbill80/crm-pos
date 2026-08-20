import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FideliteService } from './fidelite.service';
import { AddPointsDto } from '../dto/add-points.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types';
import { CRM_ROLES_ADMIN, CRM_ROLES_LECTURE } from '../crm-roles.constants';

@Controller('crm/clients/:clientId/fidelite')
export class FideliteController {
  constructor(private readonly fideliteService: FideliteService) {}

  @Get()
  @Roles(...CRM_ROLES_LECTURE)
  get(@Param('clientId') clientId: string) {
    return this.fideliteService.getForClient(clientId);
  }

  // Crédit de points — action d'administration du programme de fidélité,
  // réservée au Responsable CRM (voir crm-roles.constants.ts).
  @Post('points')
  @Roles(...CRM_ROLES_ADMIN)
  addPoints(
    @Param('clientId') clientId: string,
    @Body() dto: AddPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fideliteService.addPoints(clientId, dto, user.userId);
  }
}
