-- Grand livre ventes / clients / charges 6xx + file si période fermée.
-- Ce GL n'est pas un plan SYSCOHADA complet : le RAF complète le plan à l'écran.

ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'VENTE_POS';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'AVOIR_CLIENT';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'COMMANDE_WEB';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'ENCAISSEMENT_CLIENT';
ALTER TYPE "TypeSourceComptable" ADD VALUE IF NOT EXISTS 'FACTURE_CHARGE';

ALTER TYPE "RoleLigneComptable" ADD VALUE IF NOT EXISTS 'CLIENT';
ALTER TYPE "RoleLigneComptable" ADD VALUE IF NOT EXISTS 'VENTE';
ALTER TYPE "RoleLigneComptable" ADD VALUE IF NOT EXISTS 'TVA_COLLECTEE';
ALTER TYPE "RoleLigneComptable" ADD VALUE IF NOT EXISTS 'CHARGE';

CREATE TYPE "NatureFactureFournisseur" AS ENUM ('MARCHANDISE', 'CHARGE');
CREATE TYPE "StatutFileEcritureComptable" AS ENUM ('EN_ATTENTE', 'POSTEE', 'ERREUR');

ALTER TABLE "facture_fournisseur" ADD COLUMN "societeId" TEXT;
ALTER TABLE "facture_fournisseur" ADD COLUMN "nature" "NatureFactureFournisseur" NOT NULL DEFAULT 'MARCHANDISE';

-- Factures historiques sans commande / sans société : créer un fallback
-- avant SET NOT NULL (ex. p2p-legacy-migration.e2e-spec).
INSERT INTO "societe" ("id", "raisonSociale", "adresse")
SELECT gen_random_uuid()::text, 'Société (migration)', '—'
WHERE NOT EXISTS (SELECT 1 FROM "societe")
  AND EXISTS (SELECT 1 FROM "facture_fournisseur" WHERE "societeId" IS NULL);

UPDATE "facture_fournisseur" f
SET "societeId" = COALESCE(
  (
    SELECT ca."societeId"
    FROM "ligne_facture_fournisseur" l
    INNER JOIN "ligne_commande_achat" lc ON lc.id = l."ligneCommandeId"
    INNER JOIN "commande_achat" ca ON ca.id = lc."commandeId"
    WHERE l."factureId" = f.id
    LIMIT 1
  ),
  (SELECT s.id FROM "societe" s ORDER BY s.id LIMIT 1)
);

ALTER TABLE "facture_fournisseur" ALTER COLUMN "societeId" SET NOT NULL;
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "facture_fournisseur_societeId_nature_statut_idx"
  ON "facture_fournisseur"("societeId", "nature", "statut");

ALTER TABLE "ligne_facture_fournisseur" ADD COLUMN "natureDepenseId" TEXT;
ALTER TABLE "ligne_facture_fournisseur" ADD COLUMN "libelle" TEXT;
CREATE INDEX "ligne_facture_fournisseur_natureDepenseId_idx"
  ON "ligne_facture_fournisseur"("natureDepenseId");

CREATE TABLE "nature_depense" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "compteId" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "nature_depense_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nature_depense_societeId_code_key" ON "nature_depense"("societeId", "code");
CREATE INDEX "nature_depense_compteId_idx" ON "nature_depense"("compteId");
ALTER TABLE "nature_depense" ADD CONSTRAINT "nature_depense_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nature_depense" ADD CONSTRAINT "nature_depense_compteId_fkey"
  FOREIGN KEY ("compteId") REFERENCES "compte_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_natureDepenseId_fkey"
  FOREIGN KEY ("natureDepenseId") REFERENCES "nature_depense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ligne_ecriture_comptable" ADD COLUMN "clientId" TEXT;
CREATE INDEX "ligne_ecriture_comptable_clientId_lettrage_idx"
  ON "ligne_ecriture_comptable"("clientId", "lettrage");
ALTER TABLE "ligne_ecriture_comptable" ADD CONSTRAINT "ligne_ecriture_comptable_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "file_ecriture_comptable" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "sourceType" "TypeSourceComptable" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "auteurId" TEXT NOT NULL,
  "dateComptable" TIMESTAMP(3) NOT NULL,
  "statut" "StatutFileEcritureComptable" NOT NULL DEFAULT 'EN_ATTENTE',
  "motif" TEXT,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateTraitement" TIMESTAMP(3),
  "ecritureId" TEXT,
  CONSTRAINT "file_ecriture_comptable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "file_ecriture_comptable_sourceType_sourceId_key"
  ON "file_ecriture_comptable"("sourceType", "sourceId");
CREATE UNIQUE INDEX "file_ecriture_comptable_ecritureId_key"
  ON "file_ecriture_comptable"("ecritureId");
CREATE INDEX "file_ecriture_comptable_societeId_statut_dateCreation_idx"
  ON "file_ecriture_comptable"("societeId", "statut", "dateCreation");
ALTER TABLE "file_ecriture_comptable" ADD CONSTRAINT "file_ecriture_comptable_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_ecriture_comptable" ADD CONSTRAINT "file_ecriture_comptable_auteurId_fkey"
  FOREIGN KEY ("auteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "file_ecriture_comptable" ADD CONSTRAINT "file_ecriture_comptable_ecritureId_fkey"
  FOREIGN KEY ("ecritureId") REFERENCES "ecriture_comptable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION p2p_guard_ligne_lettrage() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: suppression interdite sur ligne_ecriture_comptable';
  END IF;
  IF ROW(
       NEW."id", NEW."ecritureId", NEW."numeroLigne", NEW."compteId",
       NEW."roleSnapshot", NEW."libelle", NEW."debit", NEW."credit",
       NEW."fournisseurId", NEW."clientId"
     ) IS DISTINCT FROM ROW(
       OLD."id", OLD."ecritureId", OLD."numeroLigne", OLD."compteId",
       OLD."roleSnapshot", OLD."libelle", OLD."debit", OLD."credit",
       OLD."fournisseurId", OLD."clientId"
     ) THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: seuls lettrage et dateLettrage peuvent être mis à jour';
  END IF;
  IF OLD."lettrage" IS NOT NULL AND NEW."lettrage" IS DISTINCT FROM OLD."lettrage" THEN
    RAISE EXCEPTION 'P2P accounting fact append-only: un lettrage déjà posé est immuable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
