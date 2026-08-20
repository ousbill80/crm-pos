import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CaissesModule } from './caisses/caisses.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CrmModule } from './crm/crm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CaissesModule,
    TransactionsModule,
    CrmModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guards globaux : toute route est protégée par défaut (secure by
    // default). Utiliser @Public() pour une exception explicite, @Roles(...)
    // pour restreindre à des rôles précis (§6.2, §6.4).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
