-- Inventaire permanent SYSCOHADA : 31 / 408 FNP / 603 CMV.
-- Les écritures déjà postées en 601 restent (append-only) ; les nouvelles
-- factures marchandises passent par le modèle versionné (seed v2 → 408).

ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'MISE_EN_STOCK';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'RETOUR_STOCK_FOURNISSEUR';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'CMV_VENTE';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'CMV_AVOIR';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'VARIATION_STOCK';

INSERT INTO "compte_comptable" ("id", "societeId", "numero", "intitule", "actif")
SELECT gen_random_uuid()::text, s.id, '603', 'Variation des stocks de marchandises', true
FROM "societe" s
WHERE NOT EXISTS (
  SELECT 1 FROM "compte_comptable" c
  WHERE c."societeId" = s.id AND c.numero = '603'
);
