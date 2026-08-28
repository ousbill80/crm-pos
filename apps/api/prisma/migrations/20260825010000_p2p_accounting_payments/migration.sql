-- P2P accounting/payments: immutable balanced GL, controlled treasury and reconciliation.
ALTER TYPE "ModePaiementFournisseur" ADD VALUE IF NOT EXISTS 'CHEQUE';
ALTER TYPE "ModePaiementFournisseur" ADD VALUE IF NOT EXISTS 'CAISSE_CENTRALE';
ALTER TYPE "ModePaiementFournisseur" ADD VALUE IF NOT EXISTS 'DEPOT';
ALTER TYPE "ModePaiementFournisseur" ADD VALUE IF NOT EXISTS 'COMPENSATION';
ALTER TYPE "ModePaiementFournisseur" ADD VALUE IF NOT EXISTS 'LETTRE_CREDIT';

CREATE TYPE "TypeSourceComptable" AS ENUM ('FACTURE_FOURNISSEUR','AVOIR_FOURNISSEUR','PAIEMENT_FOURNISSEUR','RETENUE_FISCALE','COUT_LOGISTIQUE','AVANCE_FOURNISSEUR','ECART_CHANGE');
CREATE TYPE "RoleLigneComptable" AS ENUM ('ACHAT','STOCK','COUT_LOGISTIQUE','TAXE','RETENUE','FOURNISSEUR','TRESORERIE','AVANCE','GAIN_CHANGE','PERTE_CHANGE');
CREATE TYPE "TypeCompteTresorerie" AS ENUM ('BANK','CENTRAL_CASH','MOBILE_MONEY');
CREATE TYPE "StatutPropositionPaiement" AS ENUM ('PREPAREE','APPROUVEE','APPROUVEE_EXCEPTION','EXECUTEE','REJETEE');
CREATE TYPE "SensMouvementTresorerie" AS ENUM ('ENTREE','SORTIE');

CREATE TABLE "periode_comptable" (
  "id" TEXT PRIMARY KEY, "societeId" TEXT NOT NULL, "exerciceId" TEXT NOT NULL,
  "code" TEXT NOT NULL, "dateDebut" TIMESTAMP(3) NOT NULL, "dateFin" TIMESTAMP(3) NOT NULL,
  "cloture" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "periode_comptable_dates_check" CHECK ("dateDebut" <= "dateFin")
);
CREATE UNIQUE INDEX "periode_comptable_exerciceId_code_key" ON "periode_comptable"("exerciceId","code");
CREATE INDEX "periode_comptable_societe_dates_idx" ON "periode_comptable"("societeId","dateDebut","dateFin","cloture");

CREATE TABLE "modele_comptabilisation" (
  "id" TEXT PRIMARY KEY, "societeId" TEXT NOT NULL, "journalId" TEXT NOT NULL,
  "code" TEXT NOT NULL, "version" INTEGER NOT NULL, "sourceType" "TypeSourceComptable" NOT NULL,
  "valideDu" TIMESTAMP(3) NOT NULL, "valideAu" TIMESTAMP(3), "actif" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "modele_comptabilisation_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "modele_comptabilisation_societe_code_version_key" ON "modele_comptabilisation"("societeId","code","version");
CREATE INDEX "modele_comptabilisation_source_idx" ON "modele_comptabilisation"("societeId","sourceType","actif","valideDu");

CREATE TABLE "ligne_modele_comptabilisation" (
  "id" TEXT PRIMARY KEY, "modeleId" TEXT NOT NULL, "role" "RoleLigneComptable" NOT NULL,
  "compteId" TEXT NOT NULL, "ordre" INTEGER NOT NULL, "libelle" TEXT
);
CREATE UNIQUE INDEX "ligne_modele_modeleId_role_key" ON "ligne_modele_comptabilisation"("modeleId","role");
CREATE INDEX "ligne_modele_compteId_idx" ON "ligne_modele_comptabilisation"("compteId");

CREATE TABLE "ecriture_comptable" (
  "id" TEXT PRIMARY KEY, "numero" TEXT NOT NULL, "societeId" TEXT NOT NULL,
  "exerciceId" TEXT NOT NULL, "periodeId" TEXT NOT NULL, "journalId" TEXT NOT NULL,
  "modeleId" TEXT NOT NULL, "modeleCodeSnapshot" TEXT NOT NULL, "modeleVersionSnapshot" INTEGER NOT NULL,
  "sourceType" "TypeSourceComptable" NOT NULL, "sourceId" TEXT NOT NULL, "factureId" TEXT,
  "libelle" TEXT NOT NULL, "dateComptable" TIMESTAMP(3) NOT NULL, "devise" TEXT NOT NULL DEFAULT 'XOF',
  "tauxChangeSnapshot" DECIMAL(18,6), "clientOperationId" TEXT NOT NULL,
  "auteurId" TEXT NOT NULL, "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ecriture_comptable_numero_key" ON "ecriture_comptable"("numero");
CREATE UNIQUE INDEX "ecriture_comptable_operation_key" ON "ecriture_comptable"("clientOperationId");
CREATE UNIQUE INDEX "ecriture_comptable_source_key" ON "ecriture_comptable"("sourceType","sourceId");
CREATE INDEX "ecriture_comptable_journal_date_idx" ON "ecriture_comptable"("journalId","dateComptable");
CREATE INDEX "ecriture_comptable_factureId_idx" ON "ecriture_comptable"("factureId");

CREATE TABLE "ligne_ecriture_comptable" (
  "id" TEXT PRIMARY KEY, "ecritureId" TEXT NOT NULL, "numeroLigne" INTEGER NOT NULL,
  "compteId" TEXT NOT NULL, "roleSnapshot" "RoleLigneComptable" NOT NULL, "libelle" TEXT NOT NULL,
  "debit" DECIMAL(18,2) NOT NULL DEFAULT 0, "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "fournisseurId" TEXT, "lettrage" TEXT, "dateLettrage" TIMESTAMP(3),
  CONSTRAINT "ligne_ecriture_montants_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)))
);
CREATE UNIQUE INDEX "ligne_ecriture_numero_key" ON "ligne_ecriture_comptable"("ecritureId","numeroLigne");
CREATE INDEX "ligne_ecriture_compte_idx" ON "ligne_ecriture_comptable"("compteId","ecritureId");
CREATE INDEX "ligne_ecriture_fournisseur_lettrage_idx" ON "ligne_ecriture_comptable"("fournisseurId","lettrage");

CREATE TABLE "compte_tresorerie" (
  "id" TEXT PRIMARY KEY, "societeId" TEXT NOT NULL, "code" TEXT NOT NULL, "libelle" TEXT NOT NULL,
  "type" "TypeCompteTresorerie" NOT NULL, "devise" TEXT NOT NULL DEFAULT 'XOF',
  "compteComptableId" TEXT NOT NULL, "actif" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "compte_tresorerie_societe_code_key" ON "compte_tresorerie"("societeId","code");
CREATE INDEX "compte_tresorerie_type_idx" ON "compte_tresorerie"("societeId","type","actif");

CREATE TABLE "echeance_paiement_fournisseur" (
  "id" TEXT PRIMARY KEY, "factureId" TEXT NOT NULL, "dateEcheance" TIMESTAMP(3) NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL, "devise" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  CONSTRAINT "echeance_montant_check" CHECK ("montant" > 0)
);
CREATE UNIQUE INDEX "echeance_facture_sequence_key" ON "echeance_paiement_fournisseur"("factureId","sequence");
CREATE INDEX "echeance_date_idx" ON "echeance_paiement_fournisseur"("dateEcheance");

CREATE TABLE "proposition_paiement_fournisseur" (
  "id" TEXT PRIMARY KEY, "numero" TEXT NOT NULL, "societeId" TEXT NOT NULL,
  "statut" "StatutPropositionPaiement" NOT NULL DEFAULT 'PREPAREE', "montant" DECIMAL(14,2) NOT NULL,
  "devise" TEXT NOT NULL, "mode" "ModePaiementFournisseur" NOT NULL, "compteTresorerieId" TEXT NOT NULL,
  "dateExecutionPrevue" TIMESTAMP(3) NOT NULL, "referenceInstruction" TEXT, "clientOperationId" TEXT NOT NULL,
  "preparateurId" TEXT NOT NULL, "approbateurId" TEXT, "dateApprobation" TIMESTAMP(3),
  "approbateurExceptionId" TEXT, "dateApprobationException" TIMESTAMP(3),
  "executeurId" TEXT, "dateExecution" TIMESTAMP(3),
  CONSTRAINT "proposition_paiement_montant_check" CHECK ("montant" > 0)
);
CREATE UNIQUE INDEX "proposition_paiement_numero_key" ON "proposition_paiement_fournisseur"("numero");
CREATE UNIQUE INDEX "proposition_paiement_operation_key" ON "proposition_paiement_fournisseur"("clientOperationId");
CREATE INDEX "proposition_paiement_statut_idx" ON "proposition_paiement_fournisseur"("societeId","statut","dateExecutionPrevue");

CREATE TABLE "allocation_paiement_fournisseur" (
  "id" TEXT PRIMARY KEY, "propositionId" TEXT NOT NULL, "paiementId" TEXT,
  "factureId" TEXT NOT NULL, "montant" DECIMAL(14,2) NOT NULL, "montantDevise" DECIMAL(14,2), "lettrage" TEXT,
  CONSTRAINT "allocation_paiement_montant_check" CHECK ("montant" > 0)
);
CREATE UNIQUE INDEX "allocation_proposition_facture_key" ON "allocation_paiement_fournisseur"("propositionId","factureId");
CREATE INDEX "allocation_facture_idx" ON "allocation_paiement_fournisseur"("factureId");

CREATE TABLE "mouvement_tresorerie" (
  "id" TEXT PRIMARY KEY, "compteId" TEXT NOT NULL, "paiementId" TEXT,
  "sens" "SensMouvementTresorerie" NOT NULL, "montant" DECIMAL(14,2) NOT NULL,
  "devise" TEXT NOT NULL, "dateValeur" TIMESTAMP(3) NOT NULL, "reference" TEXT,
  "clientOperationId" TEXT NOT NULL, "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mouvement_tresorerie_montant_check" CHECK ("montant" > 0)
);
CREATE UNIQUE INDEX "mouvement_tresorerie_operation_key" ON "mouvement_tresorerie"("clientOperationId");
CREATE INDEX "mouvement_tresorerie_compte_date_idx" ON "mouvement_tresorerie"("compteId","dateValeur");

CREATE TABLE "import_releve_bancaire" (
  "id" TEXT PRIMARY KEY, "societeId" TEXT NOT NULL, "compteId" TEXT NOT NULL,
  "nomFichier" TEXT NOT NULL, "hashSha256" TEXT NOT NULL, "format" TEXT NOT NULL,
  "periodeDebut" TIMESTAMP(3), "periodeFin" TIMESTAMP(3), "metadata" JSONB,
  "clientOperationId" TEXT NOT NULL, "dateImport" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "import_releve_hash_key" ON "import_releve_bancaire"("hashSha256");
CREATE UNIQUE INDEX "import_releve_operation_key" ON "import_releve_bancaire"("clientOperationId");
CREATE INDEX "import_releve_compte_date_idx" ON "import_releve_bancaire"("compteId","dateImport");

CREATE TABLE "ligne_releve_bancaire" (
  "id" TEXT PRIMARY KEY, "importReleveId" TEXT NOT NULL, "numeroLigne" INTEGER NOT NULL,
  "dateOperation" TIMESTAMP(3) NOT NULL, "dateValeur" TIMESTAMP(3), "libelle" TEXT NOT NULL,
  "reference" TEXT, "montant" DECIMAL(14,2) NOT NULL, "devise" TEXT NOT NULL, "metadata" JSONB,
  CONSTRAINT "ligne_releve_montant_check" CHECK ("montant" <> 0)
);
CREATE UNIQUE INDEX "ligne_releve_numero_key" ON "ligne_releve_bancaire"("importReleveId","numeroLigne");
CREATE INDEX "ligne_releve_date_montant_idx" ON "ligne_releve_bancaire"("dateOperation","montant");

CREATE TABLE "rapprochement_bancaire" (
  "id" TEXT PRIMARY KEY, "ligneReleveId" TEXT NOT NULL, "mouvementId" TEXT NOT NULL,
  "paiementId" TEXT, "auteurId" TEXT NOT NULL, "clientOperationId" TEXT NOT NULL,
  "dateRapprochement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "rapprochement_ligne_key" ON "rapprochement_bancaire"("ligneReleveId");
CREATE UNIQUE INDEX "rapprochement_mouvement_key" ON "rapprochement_bancaire"("mouvementId");
CREATE UNIQUE INDEX "rapprochement_operation_key" ON "rapprochement_bancaire"("clientOperationId");

ALTER TABLE "paiement_fournisseur"
  ADD COLUMN "propositionId" TEXT, ADD COLUMN "compteTresorerieId" TEXT,
  ADD COLUMN "ecritureComptableId" TEXT, ADD COLUMN "montantDevise" DECIMAL(14,2),
  ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'XOF', ADD COLUMN "tauxChangeSnapshot" DECIMAL(18,6),
  ADD COLUMN "clientOperationId" TEXT;
CREATE UNIQUE INDEX "paiement_fournisseur_propositionId_key" ON "paiement_fournisseur"("propositionId");
CREATE UNIQUE INDEX "paiement_fournisseur_ecritureComptableId_key" ON "paiement_fournisseur"("ecritureComptableId");
CREATE UNIQUE INDEX "paiement_fournisseur_clientOperationId_key" ON "paiement_fournisseur"("clientOperationId");

ALTER TABLE "periode_comptable" ADD CONSTRAINT "periode_societe_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "periode_comptable" ADD CONSTRAINT "periode_exercice_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercice_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modele_comptabilisation" ADD CONSTRAINT "modele_societe_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modele_comptabilisation" ADD CONSTRAINT "modele_journal_fkey" FOREIGN KEY ("journalId") REFERENCES "journal_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_modele_comptabilisation" ADD CONSTRAINT "ligne_modele_modele_fkey" FOREIGN KEY ("modeleId") REFERENCES "modele_comptabilisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_modele_comptabilisation" ADD CONSTRAINT "ligne_modele_compte_fkey" FOREIGN KEY ("compteId") REFERENCES "compte_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_societe_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_exercice_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercice_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_periode_fkey" FOREIGN KEY ("periodeId") REFERENCES "periode_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_journal_fkey" FOREIGN KEY ("journalId") REFERENCES "journal_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_modele_fkey" FOREIGN KEY ("modeleId") REFERENCES "modele_comptabilisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_facture_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecriture_comptable" ADD CONSTRAINT "ecriture_auteur_fkey" FOREIGN KEY ("auteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_ecriture_comptable" ADD CONSTRAINT "ligne_ecriture_ecriture_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecriture_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_ecriture_comptable" ADD CONSTRAINT "ligne_ecriture_compte_fkey" FOREIGN KEY ("compteId") REFERENCES "compte_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compte_tresorerie" ADD CONSTRAINT "compte_tresorerie_societe_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compte_tresorerie" ADD CONSTRAINT "compte_tresorerie_compte_fkey" FOREIGN KEY ("compteComptableId") REFERENCES "compte_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "echeance_paiement_fournisseur" ADD CONSTRAINT "echeance_facture_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposition_paiement_fournisseur" ADD CONSTRAINT "proposition_societe_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposition_paiement_fournisseur" ADD CONSTRAINT "proposition_compte_fkey" FOREIGN KEY ("compteTresorerieId") REFERENCES "compte_tresorerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposition_paiement_fournisseur" ADD CONSTRAINT "proposition_preparateur_fkey" FOREIGN KEY ("preparateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposition_paiement_fournisseur" ADD CONSTRAINT "proposition_approbateur_fkey" FOREIGN KEY ("approbateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposition_paiement_fournisseur" ADD CONSTRAINT "proposition_exception_fkey" FOREIGN KEY ("approbateurExceptionId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposition_paiement_fournisseur" ADD CONSTRAINT "proposition_executeur_fkey" FOREIGN KEY ("executeurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_paiement_fournisseur" ADD CONSTRAINT "allocation_proposition_fkey" FOREIGN KEY ("propositionId") REFERENCES "proposition_paiement_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_paiement_fournisseur" ADD CONSTRAINT "allocation_paiement_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiement_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_paiement_fournisseur" ADD CONSTRAINT "allocation_facture_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvement_tresorerie" ADD CONSTRAINT "mouvement_compte_fkey" FOREIGN KEY ("compteId") REFERENCES "compte_tresorerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvement_tresorerie" ADD CONSTRAINT "mouvement_paiement_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiement_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_releve_bancaire" ADD CONSTRAINT "import_societe_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_releve_bancaire" ADD CONSTRAINT "import_compte_fkey" FOREIGN KEY ("compteId") REFERENCES "compte_tresorerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_releve_bancaire" ADD CONSTRAINT "ligne_releve_import_fkey" FOREIGN KEY ("importReleveId") REFERENCES "import_releve_bancaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rapprochement_bancaire" ADD CONSTRAINT "rapprochement_ligne_fkey" FOREIGN KEY ("ligneReleveId") REFERENCES "ligne_releve_bancaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rapprochement_bancaire" ADD CONSTRAINT "rapprochement_mouvement_fkey" FOREIGN KEY ("mouvementId") REFERENCES "mouvement_tresorerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rapprochement_bancaire" ADD CONSTRAINT "rapprochement_paiement_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiement_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rapprochement_bancaire" ADD CONSTRAINT "rapprochement_auteur_fkey" FOREIGN KEY ("auteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement_fournisseur" ADD CONSTRAINT "paiement_proposition_fkey" FOREIGN KEY ("propositionId") REFERENCES "proposition_paiement_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement_fournisseur" ADD CONSTRAINT "paiement_compte_tresorerie_fkey" FOREIGN KEY ("compteTresorerieId") REFERENCES "compte_tresorerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement_fournisseur" ADD CONSTRAINT "paiement_ecriture_fkey" FOREIGN KEY ("ecritureComptableId") REFERENCES "ecriture_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Facts are immutable at the database boundary.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'modele_comptabilisation','ligne_modele_comptabilisation',
    'ecriture_comptable','ligne_ecriture_comptable','mouvement_tresorerie',
    'allocation_paiement_fournisseur','import_releve_bancaire','ligne_releve_bancaire',
    'rapprochement_bancaire','echeance_paiement_fournisseur'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_p2p_accounting_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION p2p_reject_fact_mutation()', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION p2p_assert_balanced_entry() RETURNS trigger AS $$
DECLARE d DECIMAL(18,2); c DECIMAL(18,2); n INTEGER;
BEGIN
  SELECT COALESCE(SUM("debit"),0), COALESCE(SUM("credit"),0), COUNT(*)
    INTO d,c,n FROM "ligne_ecriture_comptable" WHERE "ecritureId" = NEW."ecritureId";
  IF n < 2 OR d = 0 OR d <> c THEN
    RAISE EXCEPTION 'Ecriture comptable déséquilibrée %: débit %, crédit %, lignes %', NEW."ecritureId", d, c, n;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "ecriture_comptable_balance"
AFTER INSERT ON "ligne_ecriture_comptable" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION p2p_assert_balanced_entry();

CREATE OR REPLACE FUNCTION p2p_guard_invoice_posting() RETURNS trigger AS $$
DECLARE paid DECIMAL(14,2); due DECIMAL(14,2);
BEGIN
  IF NEW."statut" = 'COMPTABILISEE' AND OLD."statut" <> 'COMPTABILISEE'
     AND NOT EXISTS (
       SELECT 1 FROM "ecriture_comptable"
       WHERE "factureId" = NEW."id"
         AND "sourceType" IN ('FACTURE_FOURNISSEUR','AVOIR_FOURNISSEUR')
     ) THEN
    RAISE EXCEPTION 'COMPTABILISEE exige une écriture équilibrée atomique';
  END IF;
  IF NEW."statut" IN ('PARTIELLEMENT_PAYEE','PAYEE') AND NEW."statut" <> OLD."statut" THEN
    SELECT COALESCE(SUM(a."montant"), 0) INTO paid
      FROM "allocation_paiement_fournisseur" a
      JOIN "paiement_fournisseur" p ON p."propositionId" = a."propositionId"
      WHERE a."factureId" = NEW."id";
    due := COALESCE(NEW."netAPayer", NEW."montant");
    IF paid <= 0 OR paid > due THEN
      RAISE EXCEPTION 'Statut paiement incohérent: payé %, dû %', paid, due;
    END IF;
    IF NEW."statut" = 'PAYEE' AND paid <> due THEN
      RAISE EXCEPTION 'PAYEE exige un règlement intégral: payé %, dû %', paid, due;
    END IF;
    IF NEW."statut" = 'PARTIELLEMENT_PAYEE' AND paid >= due THEN
      RAISE EXCEPTION 'PARTIELLEMENT_PAYEE exige un solde restant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "facture_comptabilisation_requires_gl"
BEFORE UPDATE OF "statut" ON "facture_fournisseur"
FOR EACH ROW EXECUTE FUNCTION p2p_guard_invoice_posting();
