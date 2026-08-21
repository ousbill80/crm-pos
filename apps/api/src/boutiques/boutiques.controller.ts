import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { BoutiquesService } from './boutiques.service';
import {
  CompleterPosteBoutiqueDto,
  CreateBoutiqueDto,
} from './dto/create-boutique.dto';
import { UpdateBoutiqueDto } from './dto/update-boutique.dto';

// Endpoints Boutique — §3, §4, §6.2 du cahier des charges.
@Controller('boutiques')
export class BoutiquesController {
  constructor(private readonly boutiquesService: BoutiquesService) {}

  @Post()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  create(
    @Body() dto: CreateBoutiqueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boutiquesService.create(dto, user);
  }

  @Post('completer-tous')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  completerTous(
    @Body() dto: CompleterPosteBoutiqueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boutiquesService.completerTous(dto ?? {}, user);
  }

  @Post(':id/completer-poste')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  completerPoste(
    @Param('id') id: string,
    @Body() dto: CompleterPosteBoutiqueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boutiquesService.completerPoste(id, dto ?? {}, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.boutiquesService.findAll(user);
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_STRUCTURE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.boutiquesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...ROLES_ADMIN_STRUCTURE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBoutiqueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boutiquesService.update(id, dto, user);
  }
}
