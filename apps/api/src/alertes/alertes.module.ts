import { Module } from '@nestjs/common';
import { CaissesModule } from '../caisses/caisses.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AlertesController } from './alertes.controller';
import { AlertesService } from './alertes.service';
import { AlertesSchedulerService } from './alertes-scheduler.service';

@Module({
  imports: [CaissesModule, TransactionsModule],
  controllers: [AlertesController],
  providers: [AlertesService, AlertesSchedulerService],
})
export class AlertesModule {}
