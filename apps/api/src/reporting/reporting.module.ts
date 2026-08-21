import { Module } from '@nestjs/common';
import { CaissesModule } from '../caisses/caisses.module';
import { StocksModule } from '../stocks/stocks.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [CaissesModule, StocksModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
