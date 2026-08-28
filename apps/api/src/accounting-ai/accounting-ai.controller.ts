import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ACCOUNTING_AI_AUDIT,
  ROLES_ACCOUNTING_AI_FINDING_REMEDIATION,
  ROLES_ACCOUNTING_AI_INTAKE,
  ROLES_ACCOUNTING_AI_POLICY_APPROVAL,
  ROLES_ACCOUNTING_AI_REVIEW,
} from './accounting-ai.constants';
import { AccountingAiService } from './accounting-ai.service';
import {
  AccountingAiDashboardQueryDto,
  AssignFindingDto,
  CreateAccountingAiPolicyDto,
  DecideSuggestionDto,
  EnqueueAccountingWorkDto,
  ResolveFindingDto,
} from './dto/accounting-ai.dto';
import { SensitiveChallengeDto } from '../auth/dto/create-sensitive-challenge.dto';

@Controller('accounting-ai')
export class AccountingAiController {
  constructor(private readonly service: AccountingAiService) {}

  @Post('work-items/intake')
  @Roles(...ROLES_ACCOUNTING_AI_INTAKE)
  enqueue(
    @Body() dto: EnqueueAccountingWorkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.enqueue(dto, user);
  }

  @Get('work-items')
  @Roles(...ROLES_ACCOUNTING_AI_AUDIT)
  list(@Query() query: AccountingAiDashboardQueryDto) {
    return this.service.listWorkItems(query.societeId);
  }

  @Get('policies')
  @Roles(...ROLES_ACCOUNTING_AI_AUDIT)
  listPolicies(@Query() query: AccountingAiDashboardQueryDto) {
    return this.service.listPolicies(query.societeId);
  }

  @Post('suggestions/:id/decision')
  @Roles(...ROLES_ACCOUNTING_AI_REVIEW)
  decide(
    @Param('id') id: string,
    @Body() dto: DecideSuggestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.decide(id, dto, user);
  }

  @Post('policies')
  @Roles(...ROLES_ACCOUNTING_AI_REVIEW)
  createPolicy(
    @Body() dto: CreateAccountingAiPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createPolicy(dto, user);
  }

  @Post('policies/:id/approve')
  @Roles(...ROLES_ACCOUNTING_AI_POLICY_APPROVAL)
  approvePolicy(
    @Param('id') id: string,
    @Body() dto: SensitiveChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.approvePolicy(id, dto.challengeId, user);
  }

  @Get('findings')
  @Roles(...ROLES_ACCOUNTING_AI_AUDIT)
  findings(@Query() query: AccountingAiDashboardQueryDto) {
    return this.service.listFindings(query.societeId);
  }

  @Post('findings/:id/assign')
  @Roles(...ROLES_ACCOUNTING_AI_FINDING_REMEDIATION)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignFindingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.assignFinding(id, dto, user);
  }

  @Post('findings/:id/resolve')
  @Roles(...ROLES_ACCOUNTING_AI_FINDING_REMEDIATION)
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveFindingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resolveFinding(id, dto, user);
  }

  @Get('dashboard')
  @Roles(...ROLES_ACCOUNTING_AI_AUDIT)
  dashboard(@Query() query: AccountingAiDashboardQueryDto) {
    return this.service.dashboard(query.societeId);
  }
}
