-- Idempotence hors-ligne (§6.7) : UUID généré côté appareil pour rejouer
-- l'ouverture/clôture de session de caisse sans doublon depuis la file offline.
ALTER TABLE "session_caisse" ADD COLUMN "clientOperationId" TEXT;
CREATE UNIQUE INDEX "session_caisse_clientOperationId_key" ON "session_caisse"("clientOperationId");
