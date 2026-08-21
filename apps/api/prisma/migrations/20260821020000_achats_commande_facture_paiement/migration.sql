-- Cycle Achats complet : commande → réception liée → facture → paiement
-- (extension validée utilisateur). Paiements hors TRANSACTION_CAISSE §6.4.

CREATE TYPE "StatutCommandeAchat" AS ENUM ('BROUILLON', 'CONFIRMEE', 'PARTIELLEMENT_RECEPTIONNEE', 'RECEPTIONNEE', 'CLOTUREE', 'ANNULEE');
CREATE TYPE "StatutFactureFournisseur" AS ENUM ('BROUILLON', 'COMPTABILISEE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'ANNULEE');
CREATE TYPE "ModePaiementFournisseur" AS ENUM ('VIREMENT', 'ESPECES', 'MOBILE_MONEY');

CREATE TABLE "commande_achat" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "statut" "StatutCommandeAchat" NOT NULL DEFAULT 'BROUILLON',
    "notes" TEXT,
    "dateCommande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateConfirmation" TIMESTAMP(3),
    "dateCloture" TIMESTAMP(3),
    "initiateurId" TEXT NOT NULL,
    "boutiqueId" TEXT,

    CONSTRAINT "commande_achat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commande_achat_numero_key" ON "commande_achat"("numero");
CREATE INDEX "commande_achat_fournisseurId_statut_idx" ON "commande_achat"("fournisseurId", "statut");

CREATE TABLE "ligne_commande_achat" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ligne_commande_achat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ligne_commande_achat_commandeId_produitId_key" ON "ligne_commande_achat"("commandeId", "produitId");

ALTER TABLE "reception_stock" ADD COLUMN "commandeId" TEXT,
ADD COLUMN "ligneCommandeId" TEXT;

CREATE INDEX "reception_stock_commandeId_idx" ON "reception_stock"("commandeId");

CREATE TABLE "facture_fournisseur" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "referenceFournisseur" TEXT,
    "fournisseurId" TEXT NOT NULL,
    "statut" "StatutFactureFournisseur" NOT NULL DEFAULT 'BROUILLON',
    "dateFacture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEcheance" TIMESTAMP(3),
    "notes" TEXT,
    "montant" DECIMAL(14,2) NOT NULL,
    "createurId" TEXT NOT NULL,

    CONSTRAINT "facture_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facture_fournisseur_numero_key" ON "facture_fournisseur"("numero");
CREATE INDEX "facture_fournisseur_fournisseurId_statut_idx" ON "facture_fournisseur"("fournisseurId", "statut");

CREATE TABLE "ligne_facture_fournisseur" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "receptionId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ligne_facture_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ligne_facture_fournisseur_receptionId_key" ON "ligne_facture_fournisseur"("receptionId");

CREATE TABLE "paiement_fournisseur" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "mode" "ModePaiementFournisseur" NOT NULL,
    "reference" TEXT,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,

    CONSTRAINT "paiement_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paiement_fournisseur_factureId_datePaiement_idx" ON "paiement_fournisseur"("factureId", "datePaiement");

ALTER TABLE "commande_achat" ADD CONSTRAINT "commande_achat_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commande_achat" ADD CONSTRAINT "commande_achat_initiateurId_fkey" FOREIGN KEY ("initiateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commande_achat" ADD CONSTRAINT "commande_achat_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ligne_commande_achat" ADD CONSTRAINT "ligne_commande_achat_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_commande_achat" ADD CONSTRAINT "ligne_commande_achat_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reception_stock" ADD CONSTRAINT "reception_stock_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reception_stock" ADD CONSTRAINT "reception_stock_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "ligne_commande_achat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "paiement_fournisseur" ADD CONSTRAINT "paiement_fournisseur_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement_fournisseur" ADD CONSTRAINT "paiement_fournisseur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
