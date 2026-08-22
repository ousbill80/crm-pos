-- CreateEnum
CREATE TYPE "TypeProduit" AS ENUM ('ARTICLE', 'PRESTATION');

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "typeProduit" "TypeProduit" NOT NULL DEFAULT 'ARTICLE';

-- AlterTable
ALTER TABLE "retour_vente" ADD COLUMN     "clientOperationId" TEXT;

-- AlterTable
ALTER TABLE "societe" ADD COLUMN     "avantageFideliteArgentPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "avantageFideliteOrPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "delaiRegularisationLitigeHeures" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "seuilVersementAnticipe" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "alerte_notifiee" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cleUnique" TEXT NOT NULL,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerte_notifiee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerte_notifiee_cleUnique_key" ON "alerte_notifiee"("cleUnique");

-- CreateIndex
CREATE UNIQUE INDEX "retour_vente_clientOperationId_key" ON "retour_vente"("clientOperationId");
