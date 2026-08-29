import { Module } from '@nestjs/common';
import { CaissesModule } from '../caisses/caisses.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AlertesController } from './alertes.controller';
import { AlertesService } from './alertes.service';
import { AlertesMailer } from './alertes-mailer';
import { AlertesSchedulerService } from './alertes-scheduler.service';

@Module({
  imports: [CaissesModule, TransactionsModule],
  controllers: [AlertesController],
  providers: [AlertesService, AlertesMailer, AlertesSchedulerService],
})
export class AlertesModule {}
