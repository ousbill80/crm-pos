-- Grande surface : TIROIR / MAGASIN / CENTRALE + config tiroirs + TRANSFERT_INTERNE.
-- Backfill : AUXILIAIRE → MAGASIN ; 1 tiroir T01 par boutique.

-- 1) Nouveaux types de caisse (via enum reconstruit)
CREATE TYPE "TypeCaisse_new" AS ENUM ('TIROIR', 'MAGASIN', 'CENTRALE');

ALTER TABLE "caisse"
  ALTER COLUMN "type" TYPE "TypeCaisse_new"
  USING (
    CASE "type"::text
      WHEN 'AUXILIAIRE' THEN 'MAGASIN'
      WHEN 'CENTRALE' THEN 'CENTRALE'
      ELSE 'MAGASIN'
    END
  )::"TypeCaisse_new";

DROP TYPE "TypeCaisse";
ALTER TYPE "TypeCaisse_new" RENAME TO "TypeCaisse";

-- 2) Config tiroirs
ALTER TABLE "caisse" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "caisse" ADD COLUMN IF NOT EXISTS "libelle" TEXT;
ALTER TABLE "caisse" ADD COLUMN IF NOT EXISTS "actif" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "caisse" ADD COLUMN IF NOT EXISTS "ordreAffichage" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "caisse_boutiqueId_code_key"
  ON "caisse"("boutiqueId", "code");

CREATE INDEX IF NOT EXISTS "caisse_boutiqueId_type_idx"
  ON "caisse"("boutiqueId", "type");

-- 3) TRANSFERT_INTERNE
ALTER TYPE "TypeTransaction" ADD VALUE IF NOT EXISTS 'TRANSFERT_INTERNE';

-- 4) Une seule contrepartie miroir par source
DROP INDEX IF EXISTS "transaction_caisse_transactionSourceId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_caisse_transactionSourceId_key"
  ON "transaction_caisse"("transactionSourceId");

-- 5) Un tiroir T01 par boutique qui a une caisse MAGASIN
INSERT INTO "caisse" ("id", "type", "soldeCourant", "boutiqueId", "code", "libelle", "actif", "ordreAffichage")
SELECT
  gen_random_uuid(),
  'TIROIR'::"TypeCaisse",
  0,
  m."boutiqueId",
  'T01',
  'Tiroir 1',
  true,
  1
FROM "caisse" m
WHERE m."type" = 'MAGASIN'::"TypeCaisse"
  AND m."boutiqueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "caisse" t
    WHERE t."boutiqueId" = m."boutiqueId"
      AND t."type" = 'TIROIR'::"TypeCaisse"
  );
