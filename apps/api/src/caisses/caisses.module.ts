import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CaissesService } from './caisses.service';
import { CaissesController } from './caisses.controller';
import { CaisseBalanceService } from './caisse-balance.service';

@Module({
  providers: [CaissesService, CaisseBalanceService],
  controllers: [CaissesController],
  exports: [CaissesService, CaisseBalanceService],
})
export class CaissesModule {}
