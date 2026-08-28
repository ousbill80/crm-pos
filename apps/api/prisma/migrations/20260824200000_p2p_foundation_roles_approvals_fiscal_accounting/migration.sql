-- Socle P2P additif : demandes et approbations achats, cycle international,
-- référentiel fiscal versionné et références comptables SYSCOHADA.
-- Les rôles spécialisés sont des données de référence créées par le seed ;
-- aucun de ces rôles n'est relié au circuit de caisse §6.4.

ALTER TYPE "StatutCommandeAchat" ADD VALUE 'SOUMISE_APPROBATION';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'APPROUVEE';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'REJETEE';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'EN_PRODUCTION';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'EXPEDIEE';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'EN_TRANSIT';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'EN_DOUANE';
ALTER TYPE "StatutCommandeAchat" ADD VALUE 'DEDOUANEE';

CREATE TYPE "StatutDemandeAchat" AS ENUM (
  'BROUILLON',
  'SOUMISE',
  'APPROUVEE',
  'REJETEE',
  'CONVERTIE',
  'ANNULEE'
);

CREATE TYPE "TypeTaxeAchat" AS ENUM (
  'TVA',
  'RETENUE',
  'DROIT_DOUANE',
  'AUTRE'
);

CREATE TYPE "TypeJournalComptable" AS ENUM (
  'ACHATS',
  'BANQUE',
  'CAISSE',
  'OPERATIONS_DIVERSES'
);

ALTER TABLE "fournisseur"
  ADD COLUMN "identifiantFiscal" TEXT,
  ADD COLUMN "pays" TEXT,
  ADD COLUMN "devise" TEXT,
  ADD COLUMN "conditionsPaiementJours" INTEGER;

ALTER TABLE "commande_achat"
  ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'XOF',
  ADD COLUMN "dateSoumission" TIMESTAMP(3),
  ADD COLUMN "dateApprobation" TIMESTAMP(3),
  ADD COLUMN "approbateurId" TEXT,
  ADD COLUMN "centreCoutId" TEXT,
  ADD COLUMN "demandeId" TEXT;

CREATE TABLE "centre_cout" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "boutiqueId" TEXT,
  CONSTRAINT "centre_cout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "regle_approbation_achat" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "niveau" INTEGER NOT NULL,
  "montantMin" DECIMAL(14,2) NOT NULL,
  "montantMax" DECIMAL(14,2),
  "devise" TEXT NOT NULL DEFAULT 'XOF',
  "roleId" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "valideDu" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valideAu" TIMESTAMP(3),
  CONSTRAINT "regle_approbation_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delegation_approbation_achat" (
  "id" TEXT NOT NULL,
  "delegantId" TEXT NOT NULL,
  "delegataireId" TEXT NOT NULL,
  "roleLibelle" TEXT NOT NULL,
  "valideDu" TIMESTAMP(3) NOT NULL,
  "valideAu" TIMESTAMP(3) NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "motif" TEXT,
  CONSTRAINT "delegation_approbation_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demande_achat" (
  "id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "statut" "StatutDemandeAchat" NOT NULL DEFAULT 'BROUILLON',
  "objet" TEXT NOT NULL,
  "justification" TEXT,
  "montantEstime" DECIMAL(14,2),
  "devise" TEXT NOT NULL DEFAULT 'XOF',
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateSoumission" TIMESTAMP(3),
  "dateDecision" TIMESTAMP(3),
  "motifDecision" TEXT,
  "initiateurId" TEXT NOT NULL,
  "approbateurId" TEXT,
  "boutiqueId" TEXT,
  "centreCoutId" TEXT,
  CONSTRAINT "demande_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_demande_achat" (
  "id" TEXT NOT NULL,
  "demandeId" TEXT NOT NULL,
  "produitId" TEXT,
  "designation" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "prixEstime" DECIMAL(14,2),
  "dateBesoin" TIMESTAMP(3),
  CONSTRAINT "ligne_demande_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referentiel_fiscal" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "pays" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "valideDu" TIMESTAMP(3) NOT NULL,
  "valideAu" TIMESTAMP(3),
  "actif" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "referentiel_fiscal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "taux_fiscal_achat" (
  "id" TEXT NOT NULL,
  "referentielId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "type" "TypeTaxeAchat" NOT NULL,
  "taux" DECIMAL(7,4) NOT NULL,
  "compteComptableCode" TEXT,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "taux_fiscal_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exercice_comptable" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin" TIMESTAMP(3) NOT NULL,
  "cloture" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "exercice_comptable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compte_comptable" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "intitule" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "parentId" TEXT,
  CONSTRAINT "compte_comptable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_comptable" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "exerciceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "type" "TypeJournalComptable" NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "journal_comptable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "centre_cout_societeId_code_key"
  ON "centre_cout"("societeId", "code");
CREATE INDEX "centre_cout_boutiqueId_actif_idx"
  ON "centre_cout"("boutiqueId", "actif");
CREATE INDEX "regle_approbation_achat_societeId_actif_devise_idx"
  ON "regle_approbation_achat"("societeId", "actif", "devise");
CREATE INDEX "delegation_approbation_achat_delegantId_actif_valideDu_valideAu_idx"
  ON "delegation_approbation_achat"("delegantId", "actif", "valideDu", "valideAu");
CREATE INDEX "delegation_approbation_achat_delegataireId_actif_valideDu_valideAu_idx"
  ON "delegation_approbation_achat"("delegataireId", "actif", "valideDu", "valideAu");
CREATE UNIQUE INDEX "demande_achat_numero_key" ON "demande_achat"("numero");
CREATE INDEX "demande_achat_statut_dateCreation_idx"
  ON "demande_achat"("statut", "dateCreation");
CREATE INDEX "demande_achat_boutiqueId_statut_idx"
  ON "demande_achat"("boutiqueId", "statut");
CREATE INDEX "ligne_demande_achat_demandeId_idx"
  ON "ligne_demande_achat"("demandeId");
CREATE INDEX "commande_achat_demandeId_idx" ON "commande_achat"("demandeId");
CREATE INDEX "commande_achat_centreCoutId_idx" ON "commande_achat"("centreCoutId");
CREATE UNIQUE INDEX "referentiel_fiscal_societeId_code_version_key"
  ON "referentiel_fiscal"("societeId", "code", "version");
CREATE INDEX "referentiel_fiscal_societeId_pays_actif_idx"
  ON "referentiel_fiscal"("societeId", "pays", "actif");
CREATE UNIQUE INDEX "taux_fiscal_achat_referentielId_code_key"
  ON "taux_fiscal_achat"("referentielId", "code");
CREATE UNIQUE INDEX "exercice_comptable_societeId_code_key"
  ON "exercice_comptable"("societeId", "code");
CREATE UNIQUE INDEX "compte_comptable_societeId_numero_key"
  ON "compte_comptable"("societeId", "numero");
CREATE INDEX "compte_comptable_parentId_idx" ON "compte_comptable"("parentId");
CREATE UNIQUE INDEX "journal_comptable_exerciceId_code_key"
  ON "journal_comptable"("exerciceId", "code");
CREATE INDEX "journal_comptable_societeId_type_actif_idx"
  ON "journal_comptable"("societeId", "type", "actif");

ALTER TABLE "centre_cout"
  ADD CONSTRAINT "centre_cout_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "centre_cout"
  ADD CONSTRAINT "centre_cout_boutiqueId_fkey"
  FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "regle_approbation_achat"
  ADD CONSTRAINT "regle_approbation_achat_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regle_approbation_achat"
  ADD CONSTRAINT "regle_approbation_achat_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delegation_approbation_achat"
  ADD CONSTRAINT "delegation_approbation_achat_delegantId_fkey"
  FOREIGN KEY ("delegantId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delegation_approbation_achat"
  ADD CONSTRAINT "delegation_approbation_achat_delegataireId_fkey"
  FOREIGN KEY ("delegataireId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demande_achat"
  ADD CONSTRAINT "demande_achat_initiateurId_fkey"
  FOREIGN KEY ("initiateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demande_achat"
  ADD CONSTRAINT "demande_achat_approbateurId_fkey"
  FOREIGN KEY ("approbateurId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demande_achat"
  ADD CONSTRAINT "demande_achat_boutiqueId_fkey"
  FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demande_achat"
  ADD CONSTRAINT "demande_achat_centreCoutId_fkey"
  FOREIGN KEY ("centreCoutId") REFERENCES "centre_cout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ligne_demande_achat"
  ADD CONSTRAINT "ligne_demande_achat_demandeId_fkey"
  FOREIGN KEY ("demandeId") REFERENCES "demande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_demande_achat"
  ADD CONSTRAINT "ligne_demande_achat_produitId_fkey"
  FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_achat"
  ADD CONSTRAINT "commande_achat_approbateurId_fkey"
  FOREIGN KEY ("approbateurId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_achat"
  ADD CONSTRAINT "commande_achat_centreCoutId_fkey"
  FOREIGN KEY ("centreCoutId") REFERENCES "centre_cout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_achat"
  ADD CONSTRAINT "commande_achat_demandeId_fkey"
  FOREIGN KEY ("demandeId") REFERENCES "demande_achat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referentiel_fiscal"
  ADD CONSTRAINT "referentiel_fiscal_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "taux_fiscal_achat"
  ADD CONSTRAINT "taux_fiscal_achat_referentielId_fkey"
  FOREIGN KEY ("referentielId") REFERENCES "referentiel_fiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercice_comptable"
  ADD CONSTRAINT "exercice_comptable_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compte_comptable"
  ADD CONSTRAINT "compte_comptable_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compte_comptable"
  ADD CONSTRAINT "compte_comptable_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "compte_comptable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_comptable"
  ADD CONSTRAINT "journal_comptable_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_comptable"
  ADD CONSTRAINT "journal_comptable_exerciceId_fkey"
  FOREIGN KEY ("exerciceId") REFERENCES "exercice_comptable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
