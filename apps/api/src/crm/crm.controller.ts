import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientsService } from './crm.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  CRM_ROLES_ADMIN,
  CRM_ROLES_CREATION,
  CRM_ROLES_LECTURE,
} from './crm-roles.constants';

// Fiche client unique consolidée réseau (§6.6) — voir crm-roles.constants.ts
// pour la matrice RBAC retenue (interprétation documentée, cahier des
// charges non exhaustif sur ce point).
@Controller('crm/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(...CRM_ROLES_CREATION)
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(dto, user);
  }

  // Sans `q` : liste magasin pour les rôles boutique. Avec `q` : recherche
  // réseau (POS). La fiche (GET :id) reste unique réseau (§6.6).
  @Get()
  @Roles(...CRM_ROLES_LECTURE)
  findAll(
    @Query() query: ListClientsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(...CRM_ROLES_LECTURE)
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Get(':id/historique-achats')
  @Roles(...CRM_ROLES_LECTURE)
  historiqueAchats(@Param('id') id: string) {
    return this.clientsService.historiqueAchats(id);
  }

  @Get(':id/tableau-de-bord')
  @Roles(...CRM_ROLES_LECTURE)
  tableauDeBord(@Param('id') id: string) {
    return this.clientsService.tableauDeBord(id);
  }

  @Patch(':id')
  @Roles(...CRM_ROLES_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, dto, user.userId);
  }

  @Post(':id/segment/recalculer')
  @Roles(...CRM_ROLES_ADMIN)
  recalculerSegment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.recalculerSegment(id, user.userId);
  }
}
