import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from '../dto/create-interaction.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types';
import { CRM_ROLES_CREATION, CRM_ROLES_LECTURE } from '../crm-roles.constants';

@Controller('crm/clients/:clientId/interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @Roles(...CRM_ROLES_CREATION)
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactionsService.create(clientId, dto, user.userId);
  }

  @Get()
  @Roles(...CRM_ROLES_LECTURE)
  findAll(@Param('clientId') clientId: string) {
    return this.interactionsService.findAllForClient(clientId);
  }
}
