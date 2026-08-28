-- P2P receipt-stock additif : réception quantitative, qualité indépendante,
-- quarantaine, putaway, retours compensatoires et coûts rendus.

ALTER TYPE "UsageEmplacement" ADD VALUE IF NOT EXISTS 'QUARANTAINE';
ALTER TYPE "TypeMouvementStock" ADD VALUE IF NOT EXISTS 'RETOUR_FOURNISSEUR';

CREATE TYPE "StatutReceptionAchat" AS ENUM ('QUANTITATIVE', 'QUALITE_VALIDEE', 'MISE_EN_STOCK');
CREATE TYPE "TypePreuveReception" AS ENUM ('DOCUMENT', 'PHOTO');
CREATE TYPE "MethodeAllocationCout" AS ENUM ('VALEUR', 'QUANTITE', 'MANUELLE');
CREATE TYPE "StatutRetourFournisseur" AS ENUM ('PREPARE', 'EXPEDIE');

CREATE TABLE "reception_achat" (
  "id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "expeditionId" TEXT,
  "fournisseurId" TEXT NOT NULL,
  "statut" "StatutReceptionAchat" NOT NULL DEFAULT 'QUANTITATIVE',
  "referenceLivraison" TEXT,
  "emplacementQuarantaineId" TEXT NOT NULL,
  "receptionnaireId" TEXT NOT NULL,
  "dateReception" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT NOT NULL,
  CONSTRAINT "reception_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_reception_achat" (
  "id" TEXT NOT NULL,
  "receptionId" TEXT NOT NULL,
  "ligneCommandeId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "quantiteCommandee" INTEGER NOT NULL,
  "quantiteRecue" INTEGER NOT NULL,
  "prixUnitaireSnapshot" DECIMAL(14,2) NOT NULL,
  "codeBarres" TEXT,
  "numeroLot" TEXT,
  "dateExpiration" TIMESTAMP(3),
  "numerosSerie" JSONB,
  "motifEcart" TEXT,
  "lotId" TEXT,
  CONSTRAINT "ligne_reception_achat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ligne_reception_quantite_check" CHECK ("quantiteRecue" > 0)
);

CREATE TABLE "preuve_reception_achat" (
  "id" TEXT NOT NULL,
  "receptionId" TEXT NOT NULL,
  "type" "TypePreuveReception" NOT NULL,
  "nomFichier" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "tailleOctets" INTEGER,
  "empreinteSha256" TEXT,
  "uri" TEXT NOT NULL,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "preuve_reception_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "decision_qualite_achat" (
  "id" TEXT NOT NULL,
  "receptionId" TEXT NOT NULL,
  "controleurId" TEXT NOT NULL,
  "commentaire" TEXT,
  "dateDecision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT NOT NULL,
  CONSTRAINT "decision_qualite_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_decision_qualite_achat" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "ligneReceptionId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "quantiteAcceptee" INTEGER NOT NULL,
  "quantiteRejetee" INTEGER NOT NULL,
  "motifRejet" TEXT,
  CONSTRAINT "ligne_decision_qualite_achat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ligne_qualite_quantites_check" CHECK ("quantiteAcceptee" >= 0 AND "quantiteRejetee" >= 0)
);

CREATE TABLE "mise_en_stock_achat" (
  "id" TEXT NOT NULL,
  "receptionId" TEXT NOT NULL,
  "operateurId" TEXT NOT NULL,
  "dateMiseEnStock" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT NOT NULL,
  CONSTRAINT "mise_en_stock_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_mise_en_stock_achat" (
  "id" TEXT NOT NULL,
  "miseEnStockId" TEXT NOT NULL,
  "ligneQualiteId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "destinationId" TEXT NOT NULL,
  "lotId" TEXT,
  "mouvementId" TEXT NOT NULL,
  "coutUnitaireRendu" DECIMAL(14,4) NOT NULL,
  CONSTRAINT "ligne_mise_en_stock_achat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ligne_putaway_quantite_check" CHECK ("quantite" > 0)
);

CREATE TABLE "charge_cout_reception" (
  "id" TEXT NOT NULL,
  "receptionId" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL,
  "methode" "MethodeAllocationCout" NOT NULL,
  "clientOperationId" TEXT NOT NULL,
  "dateAllocation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charge_cout_reception_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "charge_cout_montant_check" CHECK ("montant" >= 0)
);

CREATE TABLE "allocation_cout_reception" (
  "id" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "ligneQualiteId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "allocation_cout_reception_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "allocation_cout_montant_check" CHECK ("montant" >= 0)
);

CREATE TABLE "retour_fournisseur" (
  "id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "receptionId" TEXT NOT NULL,
  "fournisseurId" TEXT NOT NULL,
  "statut" "StatutRetourFournisseur" NOT NULL DEFAULT 'PREPARE',
  "referenceRma" TEXT,
  "motif" TEXT NOT NULL,
  "reclamationQualite" TEXT,
  "avoirAttendu" BOOLEAN NOT NULL DEFAULT false,
  "montantAvoirAttendu" DECIMAL(14,2),
  "createurId" TEXT NOT NULL,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateExpedition" TIMESTAMP(3),
  "clientOperationId" TEXT NOT NULL,
  "expeditionOperationId" TEXT,
  CONSTRAINT "retour_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_retour_fournisseur" (
  "id" TEXT NOT NULL,
  "retourId" TEXT NOT NULL,
  "ligneQualiteId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "depuisStock" BOOLEAN NOT NULL DEFAULT true,
  "sourceId" TEXT NOT NULL,
  "lotId" TEXT,
  "mouvementId" TEXT,
  CONSTRAINT "ligne_retour_fournisseur_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ligne_retour_quantite_check" CHECK ("quantite" > 0)
);

CREATE TABLE "cloture_courte_achat" (
  "id" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "motif" TEXT NOT NULL,
  "approbateurId" TEXT NOT NULL,
  "roleSnapshot" TEXT NOT NULL,
  "dateApprobation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT NOT NULL,
  CONSTRAINT "cloture_courte_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_cloture_courte_achat" (
  "id" TEXT NOT NULL,
  "clotureId" TEXT NOT NULL,
  "ligneCommandeId" TEXT NOT NULL,
  "quantiteAnnulee" INTEGER NOT NULL,
  "motif" TEXT NOT NULL,
  CONSTRAINT "ligne_cloture_courte_achat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ligne_cloture_courte_quantite_check" CHECK ("quantiteAnnulee" > 0)
);

CREATE UNIQUE INDEX "reception_achat_numero_key" ON "reception_achat"("numero");
CREATE UNIQUE INDEX "reception_achat_clientOperationId_key" ON "reception_achat"("clientOperationId");
CREATE INDEX "reception_achat_commandeId_dateReception_idx" ON "reception_achat"("commandeId", "dateReception");
CREATE INDEX "reception_achat_statut_dateReception_idx" ON "reception_achat"("statut", "dateReception");
CREATE UNIQUE INDEX "ligne_reception_achat_receptionId_ligneCommandeId_key" ON "ligne_reception_achat"("receptionId", "ligneCommandeId");
CREATE INDEX "ligne_reception_achat_ligneCommandeId_idx" ON "ligne_reception_achat"("ligneCommandeId");
CREATE INDEX "preuve_reception_achat_receptionId_type_idx" ON "preuve_reception_achat"("receptionId", "type");
CREATE UNIQUE INDEX "decision_qualite_achat_receptionId_key" ON "decision_qualite_achat"("receptionId");
CREATE UNIQUE INDEX "decision_qualite_achat_clientOperationId_key" ON "decision_qualite_achat"("clientOperationId");
CREATE UNIQUE INDEX "ligne_decision_qualite_achat_ligneReceptionId_key" ON "ligne_decision_qualite_achat"("ligneReceptionId");
CREATE UNIQUE INDEX "mise_en_stock_achat_receptionId_key" ON "mise_en_stock_achat"("receptionId");
CREATE UNIQUE INDEX "mise_en_stock_achat_clientOperationId_key" ON "mise_en_stock_achat"("clientOperationId");
CREATE UNIQUE INDEX "ligne_mise_en_stock_achat_mouvementId_key" ON "ligne_mise_en_stock_achat"("mouvementId");
CREATE UNIQUE INDEX "ligne_mise_en_stock_achat_miseEnStockId_ligneQualiteId_key" ON "ligne_mise_en_stock_achat"("miseEnStockId", "ligneQualiteId");
CREATE UNIQUE INDEX "charge_cout_reception_clientOperationId_key" ON "charge_cout_reception"("clientOperationId");
CREATE INDEX "charge_cout_reception_receptionId_idx" ON "charge_cout_reception"("receptionId");
CREATE UNIQUE INDEX "allocation_cout_reception_chargeId_ligneQualiteId_key" ON "allocation_cout_reception"("chargeId", "ligneQualiteId");
CREATE UNIQUE INDEX "retour_fournisseur_numero_key" ON "retour_fournisseur"("numero");
CREATE UNIQUE INDEX "retour_fournisseur_clientOperationId_key" ON "retour_fournisseur"("clientOperationId");
CREATE UNIQUE INDEX "retour_fournisseur_expeditionOperationId_key" ON "retour_fournisseur"("expeditionOperationId");
CREATE INDEX "retour_fournisseur_receptionId_statut_idx" ON "retour_fournisseur"("receptionId", "statut");
CREATE UNIQUE INDEX "ligne_retour_fournisseur_mouvementId_key" ON "ligne_retour_fournisseur"("mouvementId");
CREATE UNIQUE INDEX "ligne_retour_fournisseur_retourId_ligneQualiteId_key" ON "ligne_retour_fournisseur"("retourId", "ligneQualiteId");
CREATE UNIQUE INDEX "cloture_courte_achat_clientOperationId_key" ON "cloture_courte_achat"("clientOperationId");
CREATE INDEX "cloture_courte_achat_commandeId_dateApprobation_idx" ON "cloture_courte_achat"("commandeId", "dateApprobation");
CREATE UNIQUE INDEX "ligne_cloture_courte_achat_clotureId_ligneCommandeId_key" ON "ligne_cloture_courte_achat"("clotureId", "ligneCommandeId");

ALTER TABLE "reception_achat" ADD CONSTRAINT "reception_achat_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_achat" ADD CONSTRAINT "reception_achat_expeditionId_fkey" FOREIGN KEY ("expeditionId") REFERENCES "expedition_internationale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reception_achat" ADD CONSTRAINT "reception_achat_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_achat" ADD CONSTRAINT "reception_achat_emplacementQuarantaineId_fkey" FOREIGN KEY ("emplacementQuarantaineId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reception_achat" ADD CONSTRAINT "reception_achat_receptionnaireId_fkey" FOREIGN KEY ("receptionnaireId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_reception_achat" ADD CONSTRAINT "ligne_reception_achat_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_reception_achat" ADD CONSTRAINT "ligne_reception_achat_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "ligne_commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_reception_achat" ADD CONSTRAINT "ligne_reception_achat_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_reception_achat" ADD CONSTRAINT "ligne_reception_achat_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "preuve_reception_achat" ADD CONSTRAINT "preuve_reception_achat_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_qualite_achat" ADD CONSTRAINT "decision_qualite_achat_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_qualite_achat" ADD CONSTRAINT "decision_qualite_achat_controleurId_fkey" FOREIGN KEY ("controleurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_decision_qualite_achat" ADD CONSTRAINT "ligne_decision_qualite_achat_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decision_qualite_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_decision_qualite_achat" ADD CONSTRAINT "ligne_decision_qualite_achat_ligneReceptionId_fkey" FOREIGN KEY ("ligneReceptionId") REFERENCES "ligne_reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_decision_qualite_achat" ADD CONSTRAINT "ligne_decision_qualite_achat_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mise_en_stock_achat" ADD CONSTRAINT "mise_en_stock_achat_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mise_en_stock_achat" ADD CONSTRAINT "mise_en_stock_achat_operateurId_fkey" FOREIGN KEY ("operateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_mise_en_stock_achat" ADD CONSTRAINT "ligne_mise_en_stock_achat_miseEnStockId_fkey" FOREIGN KEY ("miseEnStockId") REFERENCES "mise_en_stock_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_mise_en_stock_achat" ADD CONSTRAINT "ligne_mise_en_stock_achat_ligneQualiteId_fkey" FOREIGN KEY ("ligneQualiteId") REFERENCES "ligne_decision_qualite_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_mise_en_stock_achat" ADD CONSTRAINT "ligne_mise_en_stock_achat_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_mise_en_stock_achat" ADD CONSTRAINT "ligne_mise_en_stock_achat_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_mise_en_stock_achat" ADD CONSTRAINT "ligne_mise_en_stock_achat_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ligne_mise_en_stock_achat" ADD CONSTRAINT "ligne_mise_en_stock_achat_mouvementId_fkey" FOREIGN KEY ("mouvementId") REFERENCES "mouvement_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "charge_cout_reception" ADD CONSTRAINT "charge_cout_reception_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_cout_reception" ADD CONSTRAINT "allocation_cout_reception_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charge_cout_reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_cout_reception" ADD CONSTRAINT "allocation_cout_reception_ligneQualiteId_fkey" FOREIGN KEY ("ligneQualiteId") REFERENCES "ligne_decision_qualite_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_cout_reception" ADD CONSTRAINT "allocation_cout_reception_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_retour_fournisseur" ADD CONSTRAINT "ligne_retour_fournisseur_retourId_fkey" FOREIGN KEY ("retourId") REFERENCES "retour_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_retour_fournisseur" ADD CONSTRAINT "ligne_retour_fournisseur_ligneQualiteId_fkey" FOREIGN KEY ("ligneQualiteId") REFERENCES "ligne_decision_qualite_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_retour_fournisseur" ADD CONSTRAINT "ligne_retour_fournisseur_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_retour_fournisseur" ADD CONSTRAINT "ligne_retour_fournisseur_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_retour_fournisseur" ADD CONSTRAINT "ligne_retour_fournisseur_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ligne_retour_fournisseur" ADD CONSTRAINT "ligne_retour_fournisseur_mouvementId_fkey" FOREIGN KEY ("mouvementId") REFERENCES "mouvement_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cloture_courte_achat" ADD CONSTRAINT "cloture_courte_achat_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cloture_courte_achat" ADD CONSTRAINT "cloture_courte_achat_approbateurId_fkey" FOREIGN KEY ("approbateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_cloture_courte_achat" ADD CONSTRAINT "ligne_cloture_courte_achat_clotureId_fkey" FOREIGN KEY ("clotureId") REFERENCES "cloture_courte_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_cloture_courte_achat" ADD CONSTRAINT "ligne_cloture_courte_achat_ligneCommandeId_fkey" FOREIGN KEY ("ligneCommandeId") REFERENCES "ligne_commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les faits validés sont append-only jusque dans PostgreSQL.
CREATE OR REPLACE FUNCTION p2p_reject_fact_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'P2P receipt fact append-only: mutation interdite sur %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ligne_reception_achat', 'preuve_reception_achat',
    'decision_qualite_achat', 'ligne_decision_qualite_achat',
    'mise_en_stock_achat', 'ligne_mise_en_stock_achat',
    'charge_cout_reception', 'allocation_cout_reception',
    'cloture_courte_achat', 'ligne_cloture_courte_achat'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION p2p_reject_fact_mutation()',
      t, t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION p2p_guard_reception_header() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'P2P receipt fact append-only: suppression interdite';
  END IF;
  IF ROW(NEW."id", NEW."numero", NEW."commandeId", NEW."expeditionId", NEW."fournisseurId",
         NEW."referenceLivraison", NEW."emplacementQuarantaineId", NEW."receptionnaireId",
         NEW."dateReception", NEW."clientOperationId")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."numero", OLD."commandeId", OLD."expeditionId", OLD."fournisseurId",
         OLD."referenceLivraison", OLD."emplacementQuarantaineId", OLD."receptionnaireId",
         OLD."dateReception", OLD."clientOperationId") THEN
    RAISE EXCEPTION 'P2P receipt fact append-only: seul le statut peut progresser';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reception_achat_immutable"
BEFORE UPDATE OR DELETE ON "reception_achat"
FOR EACH ROW EXECUTE FUNCTION p2p_guard_reception_header();

CREATE OR REPLACE FUNCTION p2p_guard_return_validated() RETURNS trigger AS $$
BEGIN
  IF OLD."statut" = 'EXPEDIE' THEN
    RAISE EXCEPTION 'Retour fournisseur EXPEDIE append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Retour fournisseur append-only: suppression interdite';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "retour_fournisseur_validated_immutable"
BEFORE UPDATE OR DELETE ON "retour_fournisseur"
FOR EACH ROW EXECUTE FUNCTION p2p_guard_return_validated();
