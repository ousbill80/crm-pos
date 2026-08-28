-- Pack SYSCOHADA : registre d’immobilisations + rôles d’écriture 6813/28.
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'AMORTISSEMENT_IMMO';
ALTER TYPE "RoleLigneComptable" ADD VALUE IF NOT EXISTS 'AMORTISSEMENT';

CREATE TYPE "StatutImmobilisation" AS ENUM ('EN_SERVICE', 'SORTI');

CREATE TABLE "immobilisation" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateMiseEnService" TIMESTAMP(3) NOT NULL,
    "valeurBrute" DECIMAL(18,2) NOT NULL,
    "dureeMois" INTEGER NOT NULL,
    "valeurResiduelle" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "statut" "StatutImmobilisation" NOT NULL DEFAULT 'EN_SERVICE',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT NOT NULL,
    "dateSortie" TIMESTAMP(3),
    "motifSortie" TEXT,

    CONSTRAINT "immobilisation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dotation_immobilisation" (
    "id" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dotation_immobilisation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dotation_immobilisation_ecritureId_key" ON "dotation_immobilisation"("ecritureId");
CREATE UNIQUE INDEX "dotation_immobilisation_immobilisationId_periodeId_key" ON "dotation_immobilisation"("immobilisationId", "periodeId");
CREATE INDEX "immobilisation_societeId_statut_idx" ON "immobilisation"("societeId", "statut");
CREATE INDEX "dotation_immobilisation_periodeId_idx" ON "dotation_immobilisation"("periodeId");

ALTER TABLE "immobilisation" ADD CONSTRAINT "immobilisation_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "immobilisation" ADD CONSTRAINT "immobilisation_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "compte_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "immobilisation" ADD CONSTRAINT "immobilisation_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dotation_immobilisation" ADD CONSTRAINT "dotation_immobilisation_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dotation_immobilisation" ADD CONSTRAINT "dotation_immobilisation_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periode_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dotation_immobilisation" ADD CONSTRAINT "dotation_immobilisation_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecriture_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
