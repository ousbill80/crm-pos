import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

// Endpoints Zone — §3, §4, §6.2 du cahier des charges.
@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  create(@Body() dto: CreateZoneDto, @CurrentUser() user: AuthenticatedUser) {
    return this.zonesService.create(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.zonesService.findAll(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.zonesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.zonesService.update(id, dto, user);
  }
}
