-- Inventaire physique : session de comptage + lignes (snapshot théorique).
-- La quantité en stock n'est jamais écrite ici — uniquement via MouvementStock.

CREATE TYPE "StatutInventaire" AS ENUM ('EN_COURS', 'VALIDE', 'ANNULE');

CREATE TABLE "session_inventaire" (
    "id" TEXT NOT NULL,
    "entrepotId" TEXT NOT NULL,
    "statut" "StatutInventaire" NOT NULL DEFAULT 'EN_COURS',
    "motif" TEXT,
    "dateOuverture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateValidation" TIMESTAMP(3),
    "initiateurId" TEXT NOT NULL,
    "validateurId" TEXT,

    CONSTRAINT "session_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_inventaire" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantiteTheorique" INTEGER NOT NULL,
    "quantiteComptee" INTEGER,
    "dateComptage" TIMESTAMP(3),

    CONSTRAINT "ligne_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_inventaire_entrepotId_statut_idx" ON "session_inventaire"("entrepotId", "statut");

CREATE UNIQUE INDEX "ligne_inventaire_sessionId_produitId_key" ON "ligne_inventaire"("sessionId", "produitId");

ALTER TABLE "session_inventaire" ADD CONSTRAINT "session_inventaire_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "session_inventaire" ADD CONSTRAINT "session_inventaire_initiateurId_fkey" FOREIGN KEY ("initiateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "session_inventaire" ADD CONSTRAINT "session_inventaire_validateurId_fkey" FOREIGN KEY ("validateurId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ligne_inventaire" ADD CONSTRAINT "ligne_inventaire_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session_inventaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ligne_inventaire" ADD CONSTRAINT "ligne_inventaire_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
