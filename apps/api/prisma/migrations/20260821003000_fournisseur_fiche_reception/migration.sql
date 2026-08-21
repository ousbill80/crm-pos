-- Fiche fournisseur enrichie + traçabilité réception (entrepôt, réf. BL).
-- Pas de bon de commande ni de facture fournisseur (hors CDC).

ALTER TABLE "fournisseur" ADD COLUMN "telephone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "adresse" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "actif" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "fournisseur_actif_idx" ON "fournisseur"("actif");

ALTER TABLE "reception_stock" ADD COLUMN "entrepotId" TEXT,
ADD COLUMN "reference" TEXT;

CREATE INDEX "reception_stock_fournisseurId_dateReception_idx" ON "reception_stock"("fournisseurId", "dateReception");

ALTER TABLE "reception_stock" ADD CONSTRAINT "reception_stock_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
