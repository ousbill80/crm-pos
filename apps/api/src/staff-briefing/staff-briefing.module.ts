import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { StaffBriefingMailer } from './staff-briefing.mailer';
import { StaffBriefingScheduler } from './staff-briefing.scheduler';
import { StaffBriefingService } from './staff-briefing.service';

@Module({
  imports: [StocksModule],
  providers: [StaffBriefingMailer, StaffBriefingService, StaffBriefingScheduler],
})
export class StaffBriefingModule {}
