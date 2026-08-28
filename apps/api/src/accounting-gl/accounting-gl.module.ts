import { Module } from '@nestjs/common';
import { P2pAccountingCalculator } from '../fournisseurs/p2p-accounting.calculator';
import { SalesGlService } from './sales-gl.service';
import { StockGlService } from './stock-gl.service';

@Module({
  providers: [P2pAccountingCalculator, SalesGlService, StockGlService],
  exports: [P2pAccountingCalculator, SalesGlService, StockGlService],
})
export class AccountingGlModule {}
