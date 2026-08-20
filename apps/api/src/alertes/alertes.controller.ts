import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_LECTURE_CAISSES } from '../caisses/access-scope.constants';
import { AlertesService } from './alertes.service';

// Endpoints Alertes automatiques — §6.7 du cahier des charges.
@Controller('alertes')
export class AlertesController {
  constructor(private readonly alertesService: AlertesService) {}

  @Get()
  @Roles(...ROLES_LECTURE_CAISSES)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.alertesService.lister(user);
  }
}
