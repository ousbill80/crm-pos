import { Module } from '@nestjs/common';
import { CaissesService } from './caisses.service';
import { CaissesController } from './caisses.controller';
import { CaisseBalanceService } from './caisse-balance.service';

@Module({
  providers: [CaissesService, CaisseBalanceService],
  controllers: [CaissesController],
  exports: [CaisseBalanceService],
})
export class CaissesModule {}
