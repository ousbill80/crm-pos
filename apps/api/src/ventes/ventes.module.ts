import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { StocksModule } from '../stocks/stocks.module';
import { CrmModule } from '../crm/crm.module';
import { VentesService } from './ventes.service';
import { VentesController } from './ventes.controller';

@Module({
  imports: [TransactionsModule, StocksModule, CrmModule],
  providers: [VentesService],
  controllers: [VentesController],
})
export class VentesModule {}
