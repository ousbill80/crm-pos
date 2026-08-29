-- Clôture : lier le bordereau magasin → centrale (point du jour) à la session.
ALTER TABLE "session_caisse"
  ADD COLUMN "transactionSortieCentraleId" TEXT;

CREATE UNIQUE INDEX "session_caisse_transactionSortieCentraleId_key"
  ON "session_caisse"("transactionSortieCentraleId");

ALTER TABLE "session_caisse"
  ADD CONSTRAINT "session_caisse_transactionSortieCentraleId_fkey"
  FOREIGN KEY ("transactionSortieCentraleId") REFERENCES "transaction_caisse"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
