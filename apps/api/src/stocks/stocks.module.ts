import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StockService } from './stock.service';
import { StocksController } from './stocks.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StocksController],
  providers: [StockService],
  exports: [StockService],
})
export class StocksModule {}
