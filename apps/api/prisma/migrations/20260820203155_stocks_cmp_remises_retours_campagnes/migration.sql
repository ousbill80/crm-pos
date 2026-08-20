/*
  Warnings:

  - Added the required column `prixAchat` to the `reception_stock` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TypeMouvementStock" AS ENUM ('RECEPTION', 'VENTE', 'RETOUR', 'AJUSTEMENT');

-- AlterTable
ALTER TABLE "ligne_vente" ADD COLUMN     "remise" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "coutMoyenPondere" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "seuilReappro" INTEGER;

-- AlterTable
ALTER TABLE "reception_stock" ADD COLUMN     "prixAchat" DECIMAL(14,2) NOT NULL;

-- CreateTable
CREATE TABLE "mouvement_stock" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "type" "TypeMouvementStock" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "stockApres" INTEGER NOT NULL,
    "reference" TEXT,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,

    CONSTRAINT "mouvement_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retour_vente" (
    "id" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "ligneVenteId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "montantRembourse" DECIMAL(14,2) NOT NULL,
    "sessionCaisseId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retour_vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campagne_crm" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "segment" "SegmentClient",
    "niveauFidelite" "NiveauFidelite",
    "canal" "CanalInteraction" NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "campagne_crm_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_vente" ADD CONSTRAINT "retour_vente_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_vente" ADD CONSTRAINT "retour_vente_ligneVenteId_fkey" FOREIGN KEY ("ligneVenteId") REFERENCES "ligne_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_vente" ADD CONSTRAINT "retour_vente_sessionCaisseId_fkey" FOREIGN KEY ("sessionCaisseId") REFERENCES "session_caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_vente" ADD CONSTRAINT "retour_vente_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campagne_crm" ADD CONSTRAINT "campagne_crm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
