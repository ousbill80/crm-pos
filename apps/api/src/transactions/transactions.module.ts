import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionStateMachineService } from './transaction-state-machine.service';

@Module({
  providers: [TransactionsService, TransactionStateMachineService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
