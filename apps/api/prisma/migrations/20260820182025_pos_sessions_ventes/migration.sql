/*
  Warnings:

  - Added the required column `modePaiement` to the `vente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sessionCaisseId` to the `vente` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'CARTE', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "StatutSessionCaisse" AS ENUM ('OUVERTE', 'FERMEE');

-- AlterTable
ALTER TABLE "vente" ADD COLUMN     "modePaiement" "ModePaiement" NOT NULL,
ADD COLUMN     "sessionCaisseId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "session_caisse" (
    "id" TEXT NOT NULL,
    "caisseId" TEXT NOT NULL,
    "statut" "StatutSessionCaisse" NOT NULL DEFAULT 'OUVERTE',
    "ouvertureDateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fondInitial" DECIMAL(14,2) NOT NULL,
    "ouvertureUtilisateurId" TEXT NOT NULL,
    "ouvertureTemoinId" TEXT NOT NULL,
    "clotureDateHeure" TIMESTAMP(3),
    "fondCompteCloture" DECIMAL(14,2),
    "clotureUtilisateurId" TEXT,
    "clotureTemoinId" TEXT,
    "transactionVersementId" TEXT,

    CONSTRAINT "session_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_caisse_transactionVersementId_key" ON "session_caisse"("transactionVersementId");

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_caisseId_fkey" FOREIGN KEY ("caisseId") REFERENCES "caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_ouvertureUtilisateurId_fkey" FOREIGN KEY ("ouvertureUtilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_ouvertureTemoinId_fkey" FOREIGN KEY ("ouvertureTemoinId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_clotureUtilisateurId_fkey" FOREIGN KEY ("clotureUtilisateurId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_clotureTemoinId_fkey" FOREIGN KEY ("clotureTemoinId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_transactionVersementId_fkey" FOREIGN KEY ("transactionVersementId") REFERENCES "transaction_caisse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_sessionCaisseId_fkey" FOREIGN KEY ("sessionCaisseId") REFERENCES "session_caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
