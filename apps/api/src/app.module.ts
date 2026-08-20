import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CaissesModule } from './caisses/caisses.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CrmModule } from './crm/crm.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CaissesModule,
    TransactionsModule,
    CrmModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
