-- Snapshot des tickets POS en attente (file de caisse), pour reprise après
-- refresh. Pas une vente : aucun encaissement.

CREATE TABLE "ticket_attente" (
    "id" TEXT NOT NULL,
    "sessionCaisseId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "clientId" TEXT,
    "remisePanier" TEXT NOT NULL DEFAULT '',
    "panier" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_attente_sessionCaisseId_idx" ON "ticket_attente"("sessionCaisseId");

ALTER TABLE "ticket_attente" ADD CONSTRAINT "ticket_attente_sessionCaisseId_fkey" FOREIGN KEY ("sessionCaisseId") REFERENCES "session_caisse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
