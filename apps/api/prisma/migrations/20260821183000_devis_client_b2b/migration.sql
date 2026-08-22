-- Devis clients B2B (extension hors MCD §6.5)
CREATE TYPE "StatutDevisClient" AS ENUM (
  'BROUILLON',
  'ENVOYE',
  'ACCEPTE',
  'REFUSE',
  'ANNULE',
  'TRANSFORME'
);

CREATE TABLE "devis_client" (
  "id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "statut" "StatutDevisClient" NOT NULL DEFAULT 'BROUILLON',
  "clientId" TEXT NOT NULL,
  "boutiqueId" TEXT,
  "montantTotal" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "venteId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "devis_client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_devis_client" (
  "id" TEXT NOT NULL,
  "devisId" TEXT NOT NULL,
  "produitId" TEXT,
  "designation" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "prixUnitaire" DECIMAL(14,2) NOT NULL,
  "remise" DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT "ligne_devis_client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "devis_client_numero_key" ON "devis_client"("numero");
CREATE UNIQUE INDEX "devis_client_venteId_key" ON "devis_client"("venteId");
CREATE INDEX "devis_client_clientId_idx" ON "devis_client"("clientId");
CREATE INDEX "devis_client_statut_idx" ON "devis_client"("statut");

ALTER TABLE "devis_client" ADD CONSTRAINT "devis_client_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devis_client" ADD CONSTRAINT "devis_client_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "devis_client" ADD CONSTRAINT "devis_client_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "devis_client" ADD CONSTRAINT "devis_client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_devis_client" ADD CONSTRAINT "ligne_devis_client_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "devis_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ligne_devis_client" ADD CONSTRAINT "ligne_devis_client_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
