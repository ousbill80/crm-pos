-- Reversement automatique Wave (ZenAPI -> Wave Business Major Auto Parts).
CREATE TYPE "StatutPayoutWave" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'REUSSI', 'ECHEC');

ALTER TABLE "parametre_shop"
  ADD COLUMN "waveCommissionPourcent" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN "waveBeneficiaireMobile" TEXT,
  ADD COLUMN "waveBeneficiaireNom" TEXT,
  ADD COLUMN "waveBeneficiaireTesteAt" TIMESTAMP(3);

CREATE TABLE "payout_wave" (
  "id" TEXT NOT NULL,
  "commandeWebId" TEXT NOT NULL,
  "montantBrut" DECIMAL(14,2) NOT NULL,
  "commissionPourcent" DECIMAL(5,2) NOT NULL,
  "commissionMontant" DECIMAL(14,2) NOT NULL,
  "montantNet" DECIMAL(14,2) NOT NULL,
  "mobileBeneficiaire" TEXT NOT NULL,
  "statut" "StatutPayoutWave" NOT NULL DEFAULT 'EN_ATTENTE',
  "referenceProvider" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "tentatives" INTEGER NOT NULL DEFAULT 0,
  "erreurCode" TEXT,
  "erreurMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_wave_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payout_wave_commandeWebId_key" ON "payout_wave"("commandeWebId");
CREATE UNIQUE INDEX "payout_wave_idempotencyKey_key" ON "payout_wave"("idempotencyKey");
CREATE INDEX "payout_wave_statut_idx" ON "payout_wave"("statut");

ALTER TABLE "payout_wave" ADD CONSTRAINT "payout_wave_commandeWebId_fkey" FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
