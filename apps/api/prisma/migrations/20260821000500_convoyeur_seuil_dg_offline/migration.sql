-- Seuil exceptionnel DG (§4) + clé d'idempotence hors-ligne (§6.7).
ALTER TABLE "societe" ADD COLUMN "seuilValidationDg" DECIMAL(14,2) NOT NULL DEFAULT 5000000;

ALTER TABLE "transaction_caisse" ADD COLUMN "clientOperationId" TEXT;

CREATE UNIQUE INDEX "transaction_caisse_clientOperationId_key" ON "transaction_caisse"("clientOperationId");
