import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import type { MailAlerteFonds } from './alertes-mail';

@Injectable()
export class AlertesMailer {
  private readonly logger = new Logger(AlertesMailer.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (key) this.resend = new Resend(key);
  }

  crmUrl(path: string): string {
    const base =
      this.config.get<string>('CRM_PUBLIC_URL')?.trim() ||
      'https://crm.majorautoparts.shop';
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private fromAddress(): string {
    return (
      this.config.get<string>('STAFF_EMAIL_FROM')?.trim() ||
      this.config.get<string>('SHOP_EMAIL_FROM')?.trim() ||
      'MAJOR AUTO PARTS <onboarding@resend.dev>'
    );
  }

  private provider(): string {
    return (
      this.config.get<string>('EMAIL_PROVIDER')?.trim().toLowerCase() ||
      (this.resend ? 'resend' : 'mock')
    );
  }

  async envoyer(to: string, mail: MailAlerteFonds): Promise<string | null> {
    if (!to.includes('@')) return null;
    const provider = this.provider();
    const destRef = createHash('sha256')
      .update(to.toLowerCase())
      .digest('hex')
      .slice(0, 12);
    this.logger.log(`Alerte fonds → dest:${destRef} | ${mail.objet} [${provider}]`);
    if (provider === 'mock' || !this.resend) {
      return 'mock';
    }
    if (provider !== 'resend') return null;
    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress(),
      to: [to],
      subject: mail.objet.slice(0, 180),
      html: mail.html,
      text: mail.text,
      tags: [{ name: 'canal', value: 'alerte-fonds' }],
    });
    if (error) {
      this.logger.warn(`Resend alerte dest:${destRef}: ${error.message}`);
      return null;
    }
    return data?.id ?? 'ok';
  }
}
