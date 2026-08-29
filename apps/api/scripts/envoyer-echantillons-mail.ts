import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { AlertesMailer } from '../src/alertes/alertes-mailer';
import { echantillonsIllustration } from '../src/staff-briefing/staff-briefing-echantillons';
import { StaffBriefingMailer } from '../src/staff-briefing/staff-briefing.mailer';

const DESTINATAIRES = [
  'ot@prodestic.net',
  't.amadou@prodestic.net',
  'amon@prodestic.net',
];

loadEnv({ path: resolve(__dirname, '../../../.env.prod') });
loadEnv({ path: resolve(__dirname, '../.env') });
if (process.env.MAIL_ENV_FILE) {
  loadEnv({ path: process.env.MAIL_ENV_FILE, override: true });
}

function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Refus d’envoyer des e-mails en NODE_ENV=test.');
  }
  if (process.env.RESEND_API_KEY && !process.env.EMAIL_PROVIDER) {
    process.env.EMAIL_PROVIDER = 'resend';
  }
  const config = new ConfigService(process.env);
  const briefingMailer = new StaffBriefingMailer(config);
  const alertesMailer = new AlertesMailer(config);
  if (!briefingMailer.actif()) {
    throw new Error(
      'Resend inactif (EMAIL_PROVIDER / RESEND_API_KEY). Aucun e-mail envoyé.',
    );
  }
  const pieces = echantillonsIllustration();
  const resultats: { type: string; to: string; ok: boolean }[] = [];
  for (const to of DESTINATAIRES) {
    for (const p of pieces) {
      let id: string | null = null;
      try {
        id =
          p.canal === 'briefing'
            ? await briefingMailer.envoyer(to, p.mail)
            : await alertesMailer.envoyer(to, p.mail);
      } catch (err) {
        console.error(`${p.type} → ${to}: ${String(err)}`);
      }
      resultats.push({ type: p.type, to, ok: Boolean(id) && id !== 'mock' });
      await pause(250);
    }
  }
  const ok = resultats.filter((r) => r.ok).length;
  const ko = resultats.filter((r) => !r.ok).length;
  console.log(
    JSON.stringify(
      {
        destinataires: DESTINATAIRES.length,
        types: [...new Set(resultats.map((r) => r.type))],
        envoyes: ok,
        echecs: ko,
      },
      null,
      2,
    ),
  );
  if (ko > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
