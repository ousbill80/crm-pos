-- Contrepartie CENTRALE : lien self-référentiel pour l'écriture miroir
-- d'une SORTIE_FONDS auxiliaire validée / régularisée.
ALTER TABLE "transaction_caisse" ADD COLUMN "transactionSourceId" TEXT;

CREATE INDEX "transaction_caisse_caisseId_idx" ON "transaction_caisse"("caisseId");
CREATE INDEX "transaction_caisse_statut_idx" ON "transaction_caisse"("statut");
CREATE INDEX "transaction_caisse_transactionSourceId_idx" ON "transaction_caisse"("transactionSourceId");

ALTER TABLE "transaction_caisse" ADD CONSTRAINT "transaction_caisse_transactionSourceId_fkey" FOREIGN KEY ("transactionSourceId") REFERENCES "transaction_caisse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
