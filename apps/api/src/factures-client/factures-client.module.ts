import { Module } from '@nestjs/common';
import { AccountingGlModule } from '../accounting-gl/accounting-gl.module';
import { StocksModule } from '../stocks/stocks.module';
import { FacturesClientController } from './factures-client.controller';
import { FacturesClientService } from './factures-client.service';

@Module({
  imports: [AccountingGlModule, StocksModule],
  controllers: [FacturesClientController],
  providers: [FacturesClientService],
  exports: [FacturesClientService],
})
export class FacturesClientModule {}
