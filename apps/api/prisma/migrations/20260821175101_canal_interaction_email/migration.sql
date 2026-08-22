-- Canal e-mail pour campagnes SMTP (§6.6). Hors transaction précédente (PG ADD VALUE).
ALTER TYPE "CanalInteraction" ADD VALUE IF NOT EXISTS 'EMAIL';
