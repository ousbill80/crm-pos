-- CreateEnum
CREATE TYPE "TypeCaisse" AS ENUM ('AUXILIAIRE', 'CENTRALE');

-- CreateEnum
CREATE TYPE "TypeTransaction" AS ENUM ('VENTE', 'SORTIE_FONDS');

-- CreateEnum
CREATE TYPE "StatutTransaction" AS ENUM ('INITIEE', 'EN_TRANSIT', 'RECEPTIONNEE', 'VALIDEE', 'LITIGE');

-- CreateEnum
CREATE TYPE "SegmentClient" AS ENUM ('NOUVEAU', 'REGULIER', 'VIP');

-- CreateEnum
CREATE TYPE "NiveauFidelite" AS ENUM ('BRONZE', 'ARGENT', 'OR');

-- CreateEnum
CREATE TYPE "CanalInteraction" AS ENUM ('APPEL', 'SMS', 'WHATSAPP', 'VISITE', 'CAMPAGNE');

-- CreateTable
CREATE TABLE "zone" (
    "id" TEXT NOT NULL,
    "nomZone" TEXT NOT NULL,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boutique" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "boutique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "niveauHabilitation" INTEGER NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse" (
    "id" TEXT NOT NULL,
    "type" "TypeCaisse" NOT NULL,
    "soldeCourant" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "boutiqueId" TEXT,

    CONSTRAINT "caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_caisse" (
    "id" TEXT NOT NULL,
    "type" "TypeTransaction" NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "StatutTransaction" NOT NULL DEFAULT 'INITIEE',
    "caisseId" TEXT NOT NULL,
    "initiateurId" TEXT NOT NULL,

    CONSTRAINT "transaction_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bordereau_versement" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "montantDeclare" DECIMAL(14,2) NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pieceJointe" TEXT,

    CONSTRAINT "bordereau_versement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_validation" (
    "id" TEXT NOT NULL,
    "bordereauId" TEXT NOT NULL,
    "montantRecu" DECIMAL(14,2) NOT NULL,
    "ecart" DECIMAL(14,2) NOT NULL,
    "statutFinal" "StatutTransaction" NOT NULL,
    "validateurId" TEXT NOT NULL,
    "dateReception" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produit" (
    "id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "prixUnitaire" DECIMAL(14,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vente" (
    "id" TEXT NOT NULL,
    "dateVente" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montantTotal" DECIMAL(14,2) NOT NULL,
    "caisseId" TEXT NOT NULL,
    "clientId" TEXT,

    CONSTRAINT "vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_vente" (
    "id" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ligne_vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "contact" TEXT,
    "dateNaissance" TIMESTAMP(3),
    "segment" "SegmentClient" NOT NULL DEFAULT 'NOUVEAU',
    "consentementMarketing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fidelite" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "pointsCumules" INTEGER NOT NULL DEFAULT 0,
    "niveau" "NiveauFidelite" NOT NULL DEFAULT 'BRONZE',

    CONSTRAINT "fidelite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_crm" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" "CanalInteraction" NOT NULL,
    "contenu" TEXT,

    CONSTRAINT "interaction_crm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_libelle_key" ON "role"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_login_key" ON "utilisateur"("login");

-- CreateIndex
CREATE UNIQUE INDEX "bordereau_versement_transactionId_key" ON "bordereau_versement"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "reception_validation_bordereauId_key" ON "reception_validation"("bordereauId");

-- CreateIndex
CREATE UNIQUE INDEX "fidelite_clientId_key" ON "fidelite"("clientId");

-- AddForeignKey
ALTER TABLE "boutique" ADD CONSTRAINT "boutique_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse" ADD CONSTRAINT "caisse_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_caisse" ADD CONSTRAINT "transaction_caisse_caisseId_fkey" FOREIGN KEY ("caisseId") REFERENCES "caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_caisse" ADD CONSTRAINT "transaction_caisse_initiateurId_fkey" FOREIGN KEY ("initiateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bordereau_versement" ADD CONSTRAINT "bordereau_versement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_validation" ADD CONSTRAINT "reception_validation_bordereauId_fkey" FOREIGN KEY ("bordereauId") REFERENCES "bordereau_versement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_validation" ADD CONSTRAINT "reception_validation_validateurId_fkey" FOREIGN KEY ("validateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_caisseId_fkey" FOREIGN KEY ("caisseId") REFERENCES "caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_vente" ADD CONSTRAINT "ligne_vente_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_vente" ADD CONSTRAINT "ligne_vente_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fidelite" ADD CONSTRAINT "fidelite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_crm" ADD CONSTRAINT "interaction_crm_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
