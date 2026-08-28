import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { ShopModule } from './shop/shop.module';
import { ShopHealthController } from './shop/shop-health.controller';

const rateLimit = Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit:
          process.env.NODE_ENV === 'test'
            ? 100_000
            : Math.max(60, Number.isFinite(rateLimit) ? rateLimit : 600),
      },
    ]),
    PrismaModule,
    AuditModule,
    ShopModule,
  ],
  controllers: [ShopHealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ShopAppModule {}
