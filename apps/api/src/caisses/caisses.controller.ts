import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ROLES_CONFIG_TIROIRS } from '@caisse-crm/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_CAISSES,
} from './access-scope.constants';
import {
  CreateCaisseDto,
  CreateTiroirDto,
  UpdateTiroirDto,
} from './dto/create-caisse.dto';
import { CaissesService } from './caisses.service';

@Controller('caisses')
export class CaissesController {
  constructor(private readonly caissesService: CaissesService) {}

  @Post()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  create(@Body() dto: CreateCaisseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.create(dto, user);
  }

  @Post('tiroirs')
  @Roles(...ROLES_CONFIG_TIROIRS)
  createTiroir(
    @Body() dto: CreateTiroirDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caissesService.createTiroir(dto, user);
  }

  @Patch('tiroirs/:id')
  @Roles(...ROLES_CONFIG_TIROIRS)
  updateTiroir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTiroirDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caissesService.updateTiroir(id, dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_CAISSES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.findAll(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_CAISSES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.findOne(id, user);
  }

  @Get(':id/solde')
  @Roles(...ROLES_LECTURE_CAISSES)
  getSolde(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.caissesService.getSolde(id, user);
  }

  @Get(':id/mouvements')
  @Roles(...ROLES_LECTURE_CAISSES)
  getMouvements(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caissesService.getMouvements(id, user);
  }
}
