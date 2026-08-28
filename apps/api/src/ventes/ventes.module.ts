import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { StocksModule } from '../stocks/stocks.module';
import { CrmModule } from '../crm/crm.module';
import { VentesService } from './ventes.service';
import { VentesController } from './ventes.controller';
import { AccountingGlModule } from '../accounting-gl/accounting-gl.module';

@Module({
  imports: [TransactionsModule, StocksModule, CrmModule, AccountingGlModule],
  providers: [VentesService],
  controllers: [VentesController],
})
export class VentesModule {}
