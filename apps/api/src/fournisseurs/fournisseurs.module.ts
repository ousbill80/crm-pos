import { Module } from '@nestjs/common';
import { FournisseursService } from './fournisseurs.service';
import { FournisseursController } from './fournisseurs.controller';

@Module({
  providers: [FournisseursService],
  controllers: [FournisseursController],
  exports: [FournisseursService],
})
export class FournisseursModule {}
