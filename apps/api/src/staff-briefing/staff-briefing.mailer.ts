import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import type { BriefingHtml } from './staff-briefing.templates';

@Injectable()
export class StaffBriefingMailer {
  private readonly logger = new Logger(StaffBriefingMailer.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (key) this.resend = new Resend(key);
  }

  actif(): boolean {
    const provider =
      this.config.get<string>('EMAIL_PROVIDER')?.trim().toLowerCase() ||
      (this.resend ? 'resend' : 'mock');
    return provider === 'resend' && this.resend != null;
  }

  private fromAddress(): string {
    return (
      this.config.get<string>('STAFF_EMAIL_FROM')?.trim() ||
      this.config.get<string>('SHOP_EMAIL_FROM')?.trim() ||
      'MAJOR AUTO PARTS <onboarding@resend.dev>'
    );
  }

  async envoyer(
    to: string,
    briefing: BriefingHtml,
  ): Promise<string | null> {
    if (!to.includes('@')) return null;
    const provider =
      this.config.get<string>('EMAIL_PROVIDER')?.trim().toLowerCase() ||
      (this.resend ? 'resend' : 'mock');
    const destRef = createHash('sha256')
      .update(to.toLowerCase())
      .digest('hex')
      .slice(0, 12);
    this.logger.log(`Briefing → dest:${destRef} | ${briefing.objet} [${provider}]`);
    if (provider === 'mock' || !this.resend) {
      return 'mock';
    }
    if (provider !== 'resend') return null;
    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress(),
      to: [to],
      subject: briefing.objet.slice(0, 180),
      html: briefing.html,
      text: briefing.text,
      tags: [{ name: 'canal', value: 'staff-briefing' }],
    });
    if (error) {
      this.logger.warn(`Resend briefing dest:${destRef}: ${error.message}`);
      return null;
    }
    return data?.id ?? 'ok';
  }
}
