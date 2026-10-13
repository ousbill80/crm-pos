import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_POSE_ANNULATION,
  ROLES_POSE_LECTURE,
  ROLES_POSE_TECHNIQUE,
} from '../caisses/access-scope.constants';
import { OrdresPoseService } from './ordres-pose.service';
import { DemarrerOrdrePoseDto } from './dto/demarrer-ordre-pose.dto';
import { AnnulerOrdrePoseDto } from './dto/annuler-ordre-pose.dto';

@Controller('ordres-pose')
export class OrdresPoseController {
  constructor(private readonly ordresPoseService: OrdresPoseService) {}

  @Get(':id')
  @Roles(...ROLES_POSE_LECTURE)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ordresPoseService.findOne(id, utilisateur);
  }

  @Post(':id/demarrer')
  @Roles(...ROLES_POSE_TECHNIQUE)
  @HttpCode(HttpStatus.OK)
  demarrer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DemarrerOrdrePoseDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ordresPoseService.demarrer(id, dto, utilisateur);
  }

  @Post(':id/terminer')
  @Roles(...ROLES_POSE_TECHNIQUE)
  @HttpCode(HttpStatus.OK)
  terminer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ordresPoseService.terminer(id, utilisateur);
  }

  @Post(':id/annuler')
  @Roles(...ROLES_POSE_ANNULATION)
  @HttpCode(HttpStatus.OK)
  annuler(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnnulerOrdrePoseDto,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.ordresPoseService.annuler(id, dto, utilisateur);
  }
}
