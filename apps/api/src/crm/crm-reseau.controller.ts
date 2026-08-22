import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ClientsService } from './crm.service';
import { UpdateCrmParametresDto } from './dto/update-crm-parametres.dto';
import { CRM_ROLES_ADMIN, CRM_ROLES_LECTURE } from './crm-roles.constants';

// Pilotage réseau + paramétrage paliers/segments (§6.6).
@Controller('crm')
export class CrmReseauController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('parametres')
  @Roles(...CRM_ROLES_LECTURE)
  getParametres() {
    return this.clientsService.getParametres();
  }

  @Patch('parametres')
  @Roles(...CRM_ROLES_ADMIN)
  updateParametres(
    @Body() dto: UpdateCrmParametresDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.updateParametres(dto, user.userId);
  }

  @Get('tableau-de-bord')
  @Roles(...CRM_ROLES_LECTURE)
  tableauDeBord() {
    return this.clientsService.tableauDeBordReseau();
  }
}
