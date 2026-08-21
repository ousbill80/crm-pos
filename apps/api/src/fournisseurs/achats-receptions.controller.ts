import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_REPARTITION_STOCK } from '../caisses/access-scope.constants';
import { BonsStockService } from '../stocks/bons-stock.service';
import { RepartirReceptionDto } from '../stocks/dto/repartir-reception.dto';

@Controller('achats/receptions')
export class AchatsReceptionsController {
  constructor(private readonly bons: BonsStockService) {}

  @Post(':id/repartir')
  @Roles(...ROLES_REPARTITION_STOCK)
  repartir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepartirReceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bons.repartirDepuisReception(id, dto, user);
  }
}
