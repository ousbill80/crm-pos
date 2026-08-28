import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ALLOCATION_COUT_RECEPTION,
  ROLES_CLOTURE_COURTE_ACHAT,
  ROLES_LECTURE_ACHATS,
  ROLES_QUALITE_P2P_STOCK,
  ROLES_RECEPTION_P2P_QUANTITATIVE,
  ROLES_REPARTITION_STOCK,
} from '../caisses/access-scope.constants';
import { BonsStockService } from '../stocks/bons-stock.service';
import { RepartirReceptionDto } from '../stocks/dto/repartir-reception.dto';
import {
  AllocateReceiptCostDto,
  CreateReceptionAchatDto,
  CreateSupplierReturnDto,
  DispatchSupplierReturnDto,
  PutawayReceiptDto,
  QualityDecisionDto,
  ShortCloseDto,
} from './dto/receipt-stock.dto';
import { ReceiptStockService } from './receipt-stock.service';

@Controller('achats/receptions')
export class AchatsReceptionsController {
  constructor(
    private readonly bons: BonsStockService,
    private readonly receipts: ReceiptStockService,
  ) {}

  @Post()
  @Roles(...ROLES_RECEPTION_P2P_QUANTITATIVE)
  create(
    @Body() dto: CreateReceptionAchatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.createReceipt(dto, user);
  }

  @Get()
  @Roles(...ROLES_LECTURE_ACHATS)
  list() {
    return this.receipts.list();
  }

  @Get(':id')
  @Roles(...ROLES_LECTURE_ACHATS)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.receipts.detail(id);
  }

  @Post(':id/qualite')
  @Roles(...ROLES_QUALITE_P2P_STOCK)
  quality(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QualityDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.decideQuality(id, dto, user);
  }

  @Post(':id/couts')
  @Roles(...ROLES_ALLOCATION_COUT_RECEPTION)
  allocateCost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllocateReceiptCostDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.allocateCost(id, dto, user);
  }

  @Post(':id/putaway')
  @Roles(...ROLES_QUALITE_P2P_STOCK)
  putaway(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutawayReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.putaway(id, dto, user);
  }

  @Post(':id/retours')
  @Roles(...ROLES_QUALITE_P2P_STOCK)
  createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.createReturn(id, dto, user);
  }

  @Post('retours/:id/expedier')
  @Roles(...ROLES_QUALITE_P2P_STOCK)
  dispatchReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispatchSupplierReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.dispatchReturn(id, dto, user);
  }

  @Post('commandes/:id/cloture-courte')
  @Roles(...ROLES_CLOTURE_COURTE_ACHAT)
  shortClose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShortCloseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receipts.shortClose(id, dto, user);
  }

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
