import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockService } from './stock.service';
import { StocksController } from './stocks.controller';
import { BonsStockController } from './bons-stock.controller';
import { BonsStockService } from './bons-stock.service';
import { BonStockStateMachineService } from './bon-stock-state-machine.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StocksController, BonsStockController],
  providers: [StockService, BonsStockService, BonStockStateMachineService],
  exports: [StockService, BonsStockService],
})
export class StocksModule {}
