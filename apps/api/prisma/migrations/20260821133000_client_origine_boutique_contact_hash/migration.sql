-- AlterTable
ALTER TABLE "client" ADD COLUMN     "boutiqueOrigineId" TEXT,
ADD COLUMN     "contactHash" TEXT;

-- CreateIndex
CREATE INDEX "client_boutiqueOrigineId_idx" ON "client"("boutiqueOrigineId");

-- CreateIndex
CREATE INDEX "client_contactHash_idx" ON "client"("contactHash");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_boutiqueOrigineId_fkey" FOREIGN KEY ("boutiqueOrigineId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill : boutique de la première vente rattachée (fiche déjà réseau).
UPDATE "client" AS c
SET "boutiqueOrigineId" = sub."boutiqueId"
FROM (
  SELECT DISTINCT ON (v."clientId") v."clientId", ca."boutiqueId"
  FROM "vente" AS v
  INNER JOIN "caisse" AS ca ON ca."id" = v."caisseId"
  WHERE v."clientId" IS NOT NULL AND ca."boutiqueId" IS NOT NULL
  ORDER BY v."clientId", v."dateVente" ASC
) AS sub
WHERE c."id" = sub."clientId";
