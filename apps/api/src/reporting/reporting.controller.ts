import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_LECTURE_CAISSES } from '../caisses/access-scope.constants';
import { ReportingService } from './reporting.service';

// Endpoints Reporting — §6.3.4, §6.7 du cahier des charges.
@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('dashboard')
  @Roles(...ROLES_LECTURE_CAISSES)
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.reportingService.getDashboard(user);
  }
}
