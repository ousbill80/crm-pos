import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_LECTURE_STRUCTURE,
} from '../caisses/access-scope.constants';
import { EntrepriseService } from './entreprise.service';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';

@Controller('entreprise')
export class EntrepriseController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

  @Get()
  @Roles(...ROLES_LECTURE_STRUCTURE)
  get() {
    return this.entrepriseService.getOrCreate();
  }

  @Patch()
  @Roles(...ROLES_ADMIN_STRUCTURE)
  update(
    @Body() dto: UpdateEntrepriseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entrepriseService.update(dto, user);
  }
}
