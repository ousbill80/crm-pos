import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { ProduitsService } from './produits.service';
import { ProduitsController } from './produits.controller';

@Module({
  imports: [StocksModule],
  providers: [ProduitsService],
  controllers: [ProduitsController],
  exports: [ProduitsService],
})
export class ProduitsModule {}
