-- Segmentation CRM comportementale (§6.6) : récence/montant cumulé additifs,
-- sans modification du calcul de segment VIP/REGULIER/NOUVEAU existant.
ALTER TABLE "client" ADD COLUMN "derniereDateAchat" TIMESTAMP(3);
ALTER TABLE "client" ADD COLUMN "montantTotalAchats" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "societe" ADD COLUMN "seuilInactiviteMois" INTEGER NOT NULL DEFAULT 6;
