-- Seuils CRM paramétrables (§6.6) + date d'envoi campagne.
ALTER TABLE "societe" ADD COLUMN "seuilFideliteArgent" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "societe" ADD COLUMN "seuilFideliteOr" INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE "societe" ADD COLUMN "seuilSegmentRegulier" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "societe" ADD COLUMN "seuilSegmentVip" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "campagne_crm" ADD COLUMN "dateEnvoi" TIMESTAMP(3);
