-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "actif" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "categorie" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "produit_reference_key" ON "produit"("reference");

-- CreateIndex
CREATE INDEX "produit_categorie_idx" ON "produit"("categorie");

-- CreateIndex
CREATE INDEX "produit_actif_idx" ON "produit"("actif");
