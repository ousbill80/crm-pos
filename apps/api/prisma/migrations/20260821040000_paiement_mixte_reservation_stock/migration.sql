-- Paiement mixte (plusieurs modes sur une vente) + réservation de stock
-- sur ticket en attente (pas un mouvement de grand livre).

CREATE TABLE "paiement_vente" (
    "id" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "modePaiement" "ModePaiement" NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "paiement_vente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paiement_vente_venteId_modePaiement_key" ON "paiement_vente"("venteId", "modePaiement");

ALTER TABLE "paiement_vente" ADD CONSTRAINT "paiement_vente_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rétrocompatibilité : une ligne de paiement = l'ancien mode unique.
INSERT INTO "paiement_vente" ("id", "venteId", "modePaiement", "montant")
SELECT gen_random_uuid()::text, v."id", v."modePaiement", v."montantTotal"
FROM "vente" v;

CREATE TABLE "reservation_stock" (
    "id" TEXT NOT NULL,
    "sessionCaisseId" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "entrepotId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservation_stock_sessionCaisseId_holdId_produitId_key" ON "reservation_stock"("sessionCaisseId", "holdId", "produitId");
CREATE INDEX "reservation_stock_entrepotId_produitId_idx" ON "reservation_stock"("entrepotId", "produitId");

ALTER TABLE "reservation_stock" ADD CONSTRAINT "reservation_stock_sessionCaisseId_fkey" FOREIGN KEY ("sessionCaisseId") REFERENCES "session_caisse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservation_stock" ADD CONSTRAINT "reservation_stock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_stock" ADD CONSTRAINT "reservation_stock_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_quant" ADD COLUMN IF NOT EXISTS "consignation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mouvement_stock" ADD COLUMN IF NOT EXISTS "lotId" TEXT;
