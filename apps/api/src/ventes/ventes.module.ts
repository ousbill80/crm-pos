import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { StocksModule } from '../stocks/stocks.module';
import { VentesService } from './ventes.service';
import { VentesController } from './ventes.controller';

@Module({
  imports: [TransactionsModule, StocksModule],
  providers: [VentesService],
  controllers: [VentesController],
})
export class VentesModule {}
