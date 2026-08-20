import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { VentesService } from './ventes.service';
import { VentesController } from './ventes.controller';

@Module({
  imports: [TransactionsModule],
  providers: [VentesService],
  controllers: [VentesController],
})
export class VentesModule {}
