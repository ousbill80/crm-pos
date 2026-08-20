import { Module } from '@nestjs/common';
import { CaissesService } from './caisses.service';
import { CaissesController } from './caisses.controller';

@Module({
  providers: [CaissesService],
  controllers: [CaissesController],
})
export class CaissesModule {}
