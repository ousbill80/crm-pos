import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_LECTURE_CAISSES } from '../caisses/access-scope.constants';
import { AlertesService } from './alertes.service';
import { AcquitterAlerteDto } from './dto/acquitter-alerte.dto';

// Endpoints Alertes automatiques — §6.7 du cahier des charges.
@Controller('alertes')
export class AlertesController {
  constructor(private readonly alertesService: AlertesService) {}

  @Get()
  @Roles(...ROLES_LECTURE_CAISSES)
  lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('inclureAcquittees') inclureAcquittees?: string,
  ) {
    return this.alertesService.lister(user, inclureAcquittees === 'true');
  }

  @Post('acquittements')
  @Roles(...ROLES_LECTURE_CAISSES)
  acquitter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcquitterAlerteDto,
  ) {
    return this.alertesService.acquitter(user, dto);
  }
}
