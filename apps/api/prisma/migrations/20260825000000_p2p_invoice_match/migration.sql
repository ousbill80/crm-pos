-- P2P invoice-match additif : facture détaillée, fiscalité CI versionnée,
-- rapprochement trois voies, litiges/exceptions et avoirs append-only.

CREATE TYPE "TypeDocumentFournisseur" AS ENUM ('FACTURE', 'AVOIR', 'STORNO');
CREATE TYPE "StatutRapprochementFacture" AS ENUM ('A_RAPPROCHER', 'RAPPROCHEE', 'LITIGE', 'EXCEPTEE');
CREATE TYPE "StatutExtractionFacture" AS ENUM ('NON_REQUISE', 'A_EXTRAIRE', 'A_REVOIR', 'REVUE', 'REJETEE');
CREATE TYPE "DimensionLitigeFacture" AS ENUM ('QUANTITE', 'PRIX_UNITAIRE', 'TAXE', 'DEVISE', 'FOURNISSEUR');

ALTER TABLE "ligne_commande_achat"
  ADD COLUMN "tauxFiscalAchatId" TEXT,
  ADD COLUMN "codeTaxeSnapshot" TEXT,
  ADD COLUMN "tauxTaxeSnapshot" DECIMAL(7,4);

ALTER TABLE "facture_fournisseur"
  ADD COLUMN "referenceNormalisee" TEXT,
  ADD COLUMN "statutRapprochement" "StatutRapprochementFacture" NOT NULL DEFAULT 'A_RAPPROCHER',
  ADD COLUMN "statutExtraction" "StatutExtractionFacture" NOT NULL DEFAULT 'NON_REQUISE',
  ADD COLUMN "typeDocument" "TypeDocumentFournisseur" NOT NULL DEFAULT 'FACTURE',
  ADD COLUMN "dateDocument" TIMESTAMP(3),
  ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'XOF',
  ADD COLUMN "tauxChangeSnapshot" DECIMAL(18,6),
  ADD COLUMN "montantBrutHt" DECIMAL(14,2),
  ADD COLUMN "remiseLignes" DECIMAL(14,2),
  ADD COLUMN "remiseGlobale" DECIMAL(14,2),
  ADD COLUMN "totalHt" DECIMAL(14,2),
  ADD COLUMN "totalTaxes" DECIMAL(14,2),
  ADD COLUMN "totalRetenues" DECIMAL(14,2),
  ADD COLUMN "totalTtc" DECIMAL(14,2),
  ADD COLUMN "netAPayer" DECIMAL(14,2),
  ADD COLUMN "documentHash" TEXT,
  ADD COLUMN "documentNomFichier" TEXT,
  ADD COLUMN "documentMimeType" TEXT,
  ADD COLUMN "documentTailleOctets" INTEGER,
  ADD COLUMN "documentUri" TEXT,
  ADD COLUMN "documentMetadata" JSONB,
  ADD COLUMN "extractionPayload" JSONB,
  ADD COLUMN "clientOperationId" TEXT,
  ADD COLUMN "operationComptabilisationId" TEXT,
  ADD COLUMN "factureOrigineId" TEXT,
  ADD COLUMN "motifCompensation" TEXT;

ALTER TABLE "ligne_facture_fournisseur"
  ALTER COLUMN "receptionId" DROP NOT NULL,
  ADD COLUMN "ligneCommandeId" TEXT,
  ADD COLUMN "ligneReceptionId" TEXT,
  ADD COLUMN "ligneQualiteId" TEXT,
  ADD COLUMN "produitId" TEXT,
  ADD COLUMN "montantBrut" DECIMAL(14,2),
  ADD COLUMN "remise" DECIMAL(14,2),
  ADD COLUMN "montantHt" DECIMAL(14,2),
  ADD COLUMN "tauxFiscalAchatId" TEXT,
  ADD COLUMN "referentielCodeSnapshot" TEXT,
  ADD COLUMN "referentielVersionSnapshot" INTEGER,
  ADD COLUMN "codeTaxeSnapshot" TEXT,
  ADD COLUMN "typeTaxeSnapshot" "TypeTaxeAchat",
  ADD COLUMN "tauxTaxeSnapshot" DECIMAL(7,4),
  ADD COLUMN "montantTaxe" DECIMAL(14,2);

CREATE TABLE "taxe_facture_fournisseur" (
  "id" TEXT NOT NULL,
  "factureId" TEXT NOT NULL,
  "ligneId" TEXT,
  "tauxFiscalAchatId" TEXT,
  "referentielCodeSnapshot" TEXT NOT NULL,
  "referentielVersionSnapshot" INTEGER NOT NULL,
  "codeSnapshot" TEXT NOT NULL,
  "libelleSnapshot" TEXT NOT NULL,
  "typeSnapshot" "TypeTaxeAchat" NOT NULL,
  "tauxSnapshot" DECIMAL(7,4) NOT NULL,
  "base" DECIMAL(14,2) NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "taxe_facture_fournisseur_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "taxe_facture_base_check" CHECK ("base" >= 0),
  CONSTRAINT "taxe_facture_montant_check" CHECK ("montant" >= 0)
);

CREATE TABLE "litige_rapprochement_facture" (
  "id" TEXT NOT NULL,
  "factureId" TEXT NOT NULL,
  "ligneId" TEXT,
  "dimension" "DimensionLitigeFacture" NOT NULL,
  "attendu" TEXT NOT NULL,
  "constate" TEXT NOT NULL,
  "bloquant" BOOLEAN NOT NULL DEFAULT true,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "litige_rapprochement_facture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exception_rapprochement_facture" (
  "id" TEXT NOT NULL,
  "factureId" TEXT NOT NULL,
  "decideurId" TEXT NOT NULL,
  "roleSnapshot" TEXT NOT NULL,
  "motif" TEXT NOT NULL,
  "dateDecision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT NOT NULL,
  CONSTRAINT "exception_rapprochement_facture_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exception_facture_motif_check" CHECK (length(trim("motif")) >= 10)
);

CREATE TABLE "revue_extraction_facture" (
  "id" TEXT NOT NULL,
  "factureId" TEXT NOT NULL,
  "auteurId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "commentaire" TEXT,
  "payloadRevise" JSONB,
  "dateRevue" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT NOT NULL,
  CONSTRAINT "revue_extraction_facture_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facture_fournisseur_clientOperationId_key" ON "facture_fournisseur"("clientOperationId");
CREATE UNIQUE INDEX "facture_fournisseur_operationComptabilisationId_key" ON "facture_fournisseur"("operationComptabilisationId");
CREATE UNIQUE INDEX "facture_fournisseur_fournisseurId_referenceNormalisee_key"
  ON "facture_fournisseur"("fournisseurId", "referenceNormalisee");
CREATE UNIQUE INDEX "facture_fournisseur_documentHash_key"
  ON "facture_fournisseur"("documentHash");
CREATE INDEX "facture_fournisseur_fournisseur_date_montant_idx" ON "facture_fournisseur"("fournisseurId", "dateDocument", "montant");
CREATE INDEX "facture_fournisseur_statut_rapprochement_idx" ON "facture_fournisseur"("statutRapprochement", "statut");
CREATE UNIQUE INDEX "ligne_facture_fournisseur_match_key" ON "ligne_facture_fournisseur"("factureId", "ligneCommandeId", "ligneQualiteId");
CREATE INDEX "ligne_facture_fournisseur_ligneCommandeId_idx" ON "ligne_facture_fournisseur"("ligneCommandeId");
CREATE INDEX "ligne_facture_fournisseur_ligneQualiteId_idx" ON "ligne_facture_fournisseur"("ligneQualiteId");
CREATE INDEX "taxe_facture_fournisseur_facture_type_idx" ON "taxe_facture_fournisseur"("factureId", "typeSnapshot");
CREATE INDEX "litige_facture_dimension_idx" ON "litige_rapprochement_facture"("factureId", "dimension");
CREATE UNIQUE INDEX "exception_rapprochement_facture_clientOperationId_key" ON "exception_rapprochement_facture"("clientOperationId");
CREATE INDEX "exception_facture_date_idx" ON "exception_rapprochement_facture"("factureId", "dateDecision");
CREATE UNIQUE INDEX "revue_extraction_facture_clientOperationId_key" ON "revue_extraction_facture"("clientOperationId");
CREATE INDEX "revue_extraction_facture_date_idx" ON "revue_extraction_facture"("factureId", "dateRevue");

ALTER TABLE "ligne_commande_achat" ADD CONSTRAINT "ligne_commande_achat_tauxFiscalAchatId_fkey" FOREIGN KEY ("tauxFiscalAchatId") REFERENCES "taux_fiscal_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture_fournisseur" ADD CONSTRAINT "facture_fournisseur_factureOrigineId_fkey" FOREIGN KEY ("factureOrigineId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "ligne_commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_ligneReceptionId_fkey" FOREIGN KEY ("ligneReceptionId") REFERENCES "ligne_reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_ligneQualiteId_fkey" FOREIGN KEY ("ligneQualiteId") REFERENCES "ligne_decision_qualite_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture_fournisseur" ADD CONSTRAINT "ligne_facture_fournisseur_tauxFiscalAchatId_fkey" FOREIGN KEY ("tauxFiscalAchatId") REFERENCES "taux_fiscal_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "taxe_facture_fournisseur" ADD CONSTRAINT "taxe_facture_fournisseur_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "taxe_facture_fournisseur" ADD CONSTRAINT "taxe_facture_fournisseur_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne_facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "taxe_facture_fournisseur" ADD CONSTRAINT "taxe_facture_fournisseur_tauxFiscalAchatId_fkey" FOREIGN KEY ("tauxFiscalAchatId") REFERENCES "taux_fiscal_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "litige_rapprochement_facture" ADD CONSTRAINT "litige_rapprochement_facture_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exception_rapprochement_facture" ADD CONSTRAINT "exception_rapprochement_facture_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exception_rapprochement_facture" ADD CONSTRAINT "exception_rapprochement_facture_decideurId_fkey" FOREIGN KEY ("decideurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revue_extraction_facture" ADD CONSTRAINT "revue_extraction_facture_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "facture_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revue_extraction_facture" ADD CONSTRAINT "revue_extraction_facture_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les lignes, taxes, litiges, exceptions et revues sont des faits append-only.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ligne_facture_fournisseur', 'taxe_facture_fournisseur',
    'litige_rapprochement_facture', 'exception_rapprochement_facture',
    'revue_extraction_facture'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_invoice_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION p2p_reject_fact_mutation()',
      t, t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION p2p_guard_invoice_header() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Facture fournisseur append-only: suppression interdite';
  END IF;
  IF OLD."statut" IN ('COMPTABILISEE', 'PARTIELLEMENT_PAYEE', 'PAYEE') AND
     ROW(NEW."id", NEW."numero", NEW."referenceFournisseur", NEW."referenceNormalisee",
         NEW."fournisseurId", NEW."dateFacture", NEW."dateDocument", NEW."dateEcheance",
         NEW."notes", NEW."devise", NEW."tauxChangeSnapshot", NEW."montant",
         NEW."montantBrutHt", NEW."remiseLignes", NEW."remiseGlobale", NEW."totalHt",
         NEW."totalTaxes", NEW."totalRetenues", NEW."totalTtc", NEW."netAPayer",
         NEW."documentHash", NEW."documentNomFichier", NEW."documentMimeType",
         NEW."documentTailleOctets", NEW."documentUri", NEW."documentMetadata",
         NEW."extractionPayload", NEW."clientOperationId", NEW."createurId",
         NEW."typeDocument", NEW."factureOrigineId", NEW."motifCompensation")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."numero", OLD."referenceFournisseur", OLD."referenceNormalisee",
         OLD."fournisseurId", OLD."dateFacture", OLD."dateDocument", OLD."dateEcheance",
         OLD."notes", OLD."devise", OLD."tauxChangeSnapshot", OLD."montant",
         OLD."montantBrutHt", OLD."remiseLignes", OLD."remiseGlobale", OLD."totalHt",
         OLD."totalTaxes", OLD."totalRetenues", OLD."totalTtc", OLD."netAPayer",
         OLD."documentHash", OLD."documentNomFichier", OLD."documentMimeType",
         OLD."documentTailleOctets", OLD."documentUri", OLD."documentMetadata",
         OLD."extractionPayload", OLD."clientOperationId", OLD."createurId",
         OLD."typeDocument", OLD."factureOrigineId", OLD."motifCompensation") THEN
    RAISE EXCEPTION 'Facture fournisseur validée append-only: faits immuables';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "facture_fournisseur_immutable"
BEFORE UPDATE OR DELETE ON "facture_fournisseur"
FOR EACH ROW EXECUTE FUNCTION p2p_guard_invoice_header();
