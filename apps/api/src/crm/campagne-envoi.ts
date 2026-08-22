import { BadRequestException } from '@nestjs/common';

export async function envoyerSms(to: string, body: string): Promise<void> {
  const url = process.env.SMS_GATEWAY_URL;
  if (!url) {
    throw new BadRequestException(
      'Passerelle SMS non configurée (SMS_GATEWAY_URL). Utilisez l’export CSV.',
    );
  }
  if (url.startsWith('mock://')) return;
  const token = process.env.SMS_GATEWAY_TOKEN;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ to, body }),
  });
  if (!res.ok) {
    throw new BadRequestException(`Passerelle SMS : HTTP ${res.status}.`);
  }
}

export async function envoyerEmail(
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new BadRequestException(
      'SMTP non configuré (SMTP_HOST). Utilisez l’export CSV.',
    );
  }
  if (host === 'mock') return;
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@localhost',
    to,
    subject,
    text,
  });
}
