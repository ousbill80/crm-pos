-- CreateEnum
CREATE TYPE "PurposeActionSensible" AS ENUM (
  'P2P_INVOICE_POST',
  'P2P_PAYMENT_APPROVE',
  'P2P_PAYMENT_EXCEPTION_APPROVE',
  'P2P_PAYMENT_EXECUTE',
  'ACCOUNTING_AI_POLICY_CREATE',
  'ACCOUNTING_AI_POLICY_APPROVE'
);

-- CreateEnum
CREATE TYPE "TypeEvidenceP2p" AS ENUM ('RECEIPT', 'QUALITY', 'CUSTOMS', 'INVOICE');

-- CreateTable
CREATE TABLE "challenge_action_sensible" (
  "id" TEXT NOT NULL,
  "utilisateurId" TEXT NOT NULL,
  "purpose" "PurposeActionSensible" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "challenge_action_sensible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_p2p" (
  "id" TEXT NOT NULL,
  "type" "TypeEvidenceP2p" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "boutiqueId" TEXT,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "tailleOctets" INTEGER NOT NULL,
  "empreinteSha256" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_p2p_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evidence_p2p_storageKey_key" ON "evidence_p2p"("storageKey");
CREATE INDEX "challenge_action_sensible_utilisateurId_purpose_expiresAt_consumedAt_idx"
  ON "challenge_action_sensible"("utilisateurId", "purpose", "expiresAt", "consumedAt");
CREATE INDEX "evidence_p2p_type_sourceId_idx" ON "evidence_p2p"("type", "sourceId");
CREATE INDEX "evidence_p2p_societeId_boutiqueId_dateCreation_idx"
  ON "evidence_p2p"("societeId", "boutiqueId", "dateCreation");

ALTER TABLE "challenge_action_sensible"
  ADD CONSTRAINT "challenge_action_sensible_utilisateurId_fkey"
  FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_p2p"
  ADD CONSTRAINT "evidence_p2p_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_p2p"
  ADD CONSTRAINT "evidence_p2p_boutiqueId_fkey"
  FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_p2p"
  ADD CONSTRAINT "evidence_p2p_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
