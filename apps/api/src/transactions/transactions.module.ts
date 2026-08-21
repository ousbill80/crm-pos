import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionStateMachineService } from './transaction-state-machine.service';
import { TransactionsGateway } from './transactions.gateway';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [
    TransactionsService,
    TransactionStateMachineService,
    TransactionsGateway,
  ],
  controllers: [TransactionsController],
  exports: [TransactionsService, TransactionsGateway],
})
export class TransactionsModule {}
