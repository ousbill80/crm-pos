-- Idempotence hors-ligne des encaissements POS (§6.7) : une vente rejouée
-- à la reconnexion ne doit ni doubler le ticket ni redécrémenter le stock.
ALTER TABLE "vente" ADD COLUMN "clientOperationId" TEXT;

CREATE UNIQUE INDEX "vente_clientOperationId_key" ON "vente"("clientOperationId");
