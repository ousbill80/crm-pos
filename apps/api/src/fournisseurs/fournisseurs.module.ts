import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { FournisseursService } from './fournisseurs.service';
import { FournisseursController } from './fournisseurs.controller';

@Module({
  imports: [StocksModule],
  providers: [FournisseursService],
  controllers: [FournisseursController],
  exports: [FournisseursService],
})
export class FournisseursModule {}
