import { Controller, Get, Query } from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { ListInteractionsQueryDto } from '../dto/list-interactions-query.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CRM_ROLES_LECTURE } from '../crm-roles.constants';

/** Journal réseau — distinct de /crm/clients/:id/interactions (fiche). */
@Controller('crm/interactions')
export class InteractionsReseauController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get()
  @Roles(...CRM_ROLES_LECTURE)
  findAll(@Query() query: ListInteractionsQueryDto) {
    return this.interactionsService.findAllReseau(query);
  }
}
