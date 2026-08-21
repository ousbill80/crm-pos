import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StocksModule } from '../stocks/stocks.module';
import { InventairesController } from './inventaires.controller';
import { InventairesService } from './inventaires.service';

@Module({
  imports: [PrismaModule, AuditModule, StocksModule],
  controllers: [InventairesController],
  providers: [InventairesService],
})
export class InventairesModule {}
