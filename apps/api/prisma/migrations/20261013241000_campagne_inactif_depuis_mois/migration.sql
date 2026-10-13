-- Ciblage campagne additif (§6.6) : clients sans achat depuis N mois.
ALTER TABLE "campagne_crm" ADD COLUMN "inactifDepuisMois" INTEGER;
