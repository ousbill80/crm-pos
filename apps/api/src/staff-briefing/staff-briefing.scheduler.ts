import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TZ_BRIEFING } from './staff-briefing.engine';
import { StaffBriefingService } from './staff-briefing.service';

@Injectable()
export class StaffBriefingScheduler {
  private readonly logger = new Logger(StaffBriefingScheduler.name);

  constructor(private readonly briefing: StaffBriefingService) {}

  @Cron('0 22 * * *', { timeZone: TZ_BRIEFING })
  async soir(): Promise<void> {
    await this.safe('soir', () => this.briefing.cycleSoir());
  }

  @Cron('30 7 * * 1', { timeZone: TZ_BRIEFING })
  async lundi(): Promise<void> {
    await this.safe('hebdo', () => this.briefing.cycleHebdo());
  }

  @Cron('0 18 * * *', { timeZone: TZ_BRIEFING })
  async finMois(): Promise<void> {
    await this.safe('mois', () => this.briefing.cycleMensuel());
  }

  @Cron('0 9 * * *', { timeZone: TZ_BRIEFING })
  async relances(): Promise<void> {
    await this.safe('relance', () => this.briefing.cycleRelances());
  }

  @Cron('0 10 * * *', { timeZone: TZ_BRIEFING })
  async shop(): Promise<void> {
    await this.safe('shop', () => this.briefing.cycleShopInactif());
  }

  /** Dès 20h Abidjan, puis toutes les 15 min : caisses non clôturées après service. */
  @Cron('*/15 19-23 * * *', { timeZone: TZ_BRIEFING })
  async cloture(): Promise<void> {
    await this.safe('cloture', () => this.briefing.cycleCloture());
  }

  private async safe(nom: string, fn: () => Promise<number>): Promise<void> {
    if (!this.briefing.enabled()) return;
    try {
      const n = await fn();
      this.logger.log(`Briefing ${nom}: ${n} e-mail(s).`);
    } catch (err) {
      this.logger.error(`Briefing ${nom} en échec: ${String(err)}`);
    }
  }
}
