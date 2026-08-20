-- CreateEnum
CREATE TYPE "TypeEntrepot" AS ENUM ('PRINCIPAL', 'SECONDAIRE');

-- AlterEnum
ALTER TYPE "TypeMouvementStock" ADD VALUE 'TRANSFERT_OUT';
ALTER TYPE "TypeMouvementStock" ADD VALUE 'TRANSFERT_IN';

-- CreateTable
CREATE TABLE "societe" (
    "id" TEXT NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "logoUrl" TEXT,

    CONSTRAINT "societe_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "boutique" ADD COLUMN     "code" TEXT,
ADD COLUMN     "actif" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "entrepot" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "TypeEntrepot" NOT NULL DEFAULT 'PRINCIPAL',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "boutiqueId" TEXT NOT NULL,

    CONSTRAINT "entrepot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_quant" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "entrepotId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_quant_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "mouvement_stock" ADD COLUMN     "entrepotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "entrepot_boutiqueId_code_key" ON "entrepot"("boutiqueId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_quant_produitId_entrepotId_key" ON "stock_quant"("produitId", "entrepotId");

-- CreateIndex
CREATE INDEX "mouvement_stock_entrepotId_produitId_idx" ON "mouvement_stock"("entrepotId", "produitId");

-- AddForeignKey
ALTER TABLE "entrepot" ADD CONSTRAINT "entrepot_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
