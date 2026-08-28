-- Facture client B2B : pièce distincte du ticket POS / commande web.
-- GL : TypeSourceComptable.FACTURE_CLIENT (411 / 701 / 4457), jamais VENTE_POS.

ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'FACTURE_CLIENT';

CREATE TYPE "StatutFactureClient" AS ENUM (
  'BROUILLON',
  'EMISE',
  'ANNULEE'
);

CREATE TYPE "ModeEncaissementFactureClient" AS ENUM (
  'ESPECES',
  'VIREMENT',
  'MOBILE_MONEY',
  'CARTE'
);

CREATE TABLE "facture_client" (
  "id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "statut" "StatutFactureClient" NOT NULL DEFAULT 'BROUILLON',
  "clientId" TEXT NOT NULL,
  "boutiqueId" TEXT,
  "devisId" TEXT,
  "dateFacture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateEcheance" TIMESTAMP(3),
  "montantHt" DECIMAL(14,2) NOT NULL,
  "montantTva" DECIMAL(14,2) NOT NULL,
  "montantTtc" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "emiseParId" TEXT,
  "emiseAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "facture_client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_facture_client" (
  "id" TEXT NOT NULL,
  "factureId" TEXT NOT NULL,
  "produitId" TEXT,
  "designation" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "prixUnitaire" DECIMAL(14,2) NOT NULL,
  "remise" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tauxTva" DECIMAL(5,2) NOT NULL,
  "montantHt" DECIMAL(14,2) NOT NULL,
  "montantTva" DECIMAL(14,2) NOT NULL,
  "montantTtc" DECIMAL(14,2) NOT NULL,
  "coutUnitaire" DECIMAL(14,2),
  CONSTRAINT "ligne_facture_client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paiement_facture_client" (
  "id" TEXT NOT NULL,
  "factureId" TEXT NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL,
  "mode" "ModeEncaissementFactureClient" NOT NULL,
  "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paiement_facture_client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facture_client_numero_key" ON "facture_client"("numero");
CREATE UNIQUE INDEX "facture_client_devisId_key" ON "facture_client"("devisId");
CREATE INDEX "facture_client_clientId_idx" ON "facture_client"("clientId");
CREATE INDEX "facture_client_statut_idx" ON "facture_client"("statut");
CREATE INDEX "paiement_facture_client_factureId_idx" ON "paiement_facture_client"("factureId");

ALTER TABLE "facture_client" ADD CONSTRAINT "facture_client_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture_client" ADD CONSTRAINT "facture_client_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facture_client" ADD CONSTRAINT "facture_client_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "devis_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facture_client" ADD CONSTRAINT "facture_client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture_client" ADD CONSTRAINT "facture_client_emiseParId_fkey" FOREIGN KEY ("emiseParId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ligne_facture_client" ADD CONSTRAINT "ligne_facture_client_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_client" ADD CONSTRAINT "ligne_facture_client_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "paiement_facture_client" ADD CONSTRAINT "paiement_facture_client_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement_facture_client" ADD CONSTRAINT "paiement_facture_client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
