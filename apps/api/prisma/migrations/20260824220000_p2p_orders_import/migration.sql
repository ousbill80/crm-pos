-- P2P orders/import additif : commandes versionnées, approbation, change
-- snapshot, numérotation transactionnelle et dossier logistique/douanier.

CREATE TYPE "TypeEcheancePaiementAchat" AS ENUM ('ACOMPTE', 'SOLDE', 'LETTRE_CREDIT', 'AUTRE');
CREATE TYPE "TypeJalonCommandeAchat" AS ENUM ('PRODUCTION_DEBUT', 'PRODUCTION_FIN', 'CHARGEMENT', 'ETA', 'ARRIVEE');
CREATE TYPE "ModeTransportInternational" AS ENUM ('MARITIME', 'AERIEN');
CREATE TYPE "TypeCoutImport" AS ENUM ('DROIT_DOUANE', 'TAXE', 'FRET', 'ASSURANCE', 'SURESTARIE', 'AUTRE');
CREATE TYPE "TypeDocumentImport" AS ENUM ('CONNAISSEMENT', 'CERTIFICAT_ORIGINE', 'DECLARATION_DOUANE', 'PROFORMA', 'AUTRE');

ALTER TABLE "commande_achat"
  ADD COLUMN "societeId" TEXT,
  ADD COLUMN "clientOperationId" TEXT,
  ADD COLUMN "tauxChangeSnapshot" DECIMAL(18,6),
  ADD COLUMN "incoterm" TEXT,
  ADD COLUMN "lieuOrigine" TEXT,
  ADD COLUMN "lieuDestination" TEXT,
  ADD COLUMN "proformaReference" TEXT,
  ADD COLUMN "conditionsPaiement" TEXT,
  ADD COLUMN "versionCourante" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "sequence_document_achat" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "exercice" INTEGER NOT NULL,
  "typeDocument" TEXT NOT NULL,
  "prochaineValeur" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "sequence_document_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commande_achat_version" (
  "id" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "motif" TEXT,
  "snapshot" JSONB NOT NULL,
  "creeParId" TEXT NOT NULL,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT,
  CONSTRAINT "commande_achat_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "decision_approbation_commande" (
  "id" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "motif" TEXT,
  "approbateurId" TEXT NOT NULL,
  "roleSnapshot" TEXT NOT NULL,
  "dateDecision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT,
  CONSTRAINT "decision_approbation_commande_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "echeance_paiement_commande" (
  "id" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "type" "TypeEcheancePaiementAchat" NOT NULL,
  "ordre" INTEGER NOT NULL,
  "pourcentage" DECIMAL(7,4),
  "montant" DECIMAL(14,2),
  "datePrevue" TIMESTAMP(3),
  "conditions" TEXT,
  CONSTRAINT "echeance_paiement_commande_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jalon_commande_achat" (
  "id" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "type" "TypeJalonCommandeAchat" NOT NULL,
  "datePrevue" TIMESTAMP(3),
  "dateReelle" TIMESTAMP(3),
  "notes" TEXT,
  "creeParId" TEXT NOT NULL,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientOperationId" TEXT,
  CONSTRAINT "jalon_commande_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expedition_internationale" (
  "id" TEXT NOT NULL,
  "commandeId" TEXT NOT NULL,
  "mode" "ModeTransportInternational" NOT NULL,
  "referenceTransport" TEXT NOT NULL,
  "transporteur" TEXT,
  "portAeroportDepart" TEXT,
  "portAeroportArrivee" TEXT,
  "dateChargement" TIMESTAMP(3),
  "eta" TIMESTAMP(3),
  "dateArrivee" TIMESTAMP(3),
  "clientOperationId" TEXT,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expedition_internationale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conteneur_import" (
  "id" TEXT NOT NULL,
  "expeditionId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "type" TEXT,
  "plomb" TEXT,
  CONSTRAINT "conteneur_import_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dossier_douane" (
  "id" TEXT NOT NULL,
  "expeditionId" TEXT NOT NULL,
  "numeroDeclaration" TEXT,
  "regimeDouanier" TEXT,
  "bureauDouane" TEXT,
  "dateDeclaration" TIMESTAMP(3),
  "declarant" TEXT,
  CONSTRAINT "dossier_douane_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_import" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "type" "TypeDocumentImport" NOT NULL,
  "reference" TEXT NOT NULL,
  "dateDocument" TIMESTAMP(3),
  "emetteur" TEXT,
  "nomFichier" TEXT,
  "mimeType" TEXT,
  "tailleOctets" INTEGER,
  "empreinteSha256" TEXT,
  "uri" TEXT,
  "clientOperationId" TEXT,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_import_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_cout_import" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "type" "TypeCoutImport" NOT NULL,
  "libelle" TEXT NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL,
  "devise" TEXT NOT NULL,
  "tauxChangeSnapshot" DECIMAL(18,6) NOT NULL,
  "clientOperationId" TEXT,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ligne_cout_import_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commande_achat_clientOperationId_key" ON "commande_achat"("clientOperationId");
CREATE INDEX "commande_achat_societeId_dateCommande_idx" ON "commande_achat"("societeId", "dateCommande");
CREATE UNIQUE INDEX "sequence_document_achat_societeId_exercice_typeDocument_key"
  ON "sequence_document_achat"("societeId", "exercice", "typeDocument");
CREATE UNIQUE INDEX "commande_achat_version_clientOperationId_key" ON "commande_achat_version"("clientOperationId");
CREATE UNIQUE INDEX "commande_achat_version_commandeId_version_key" ON "commande_achat_version"("commandeId", "version");
CREATE UNIQUE INDEX "decision_approbation_commande_clientOperationId_key" ON "decision_approbation_commande"("clientOperationId");
CREATE INDEX "decision_approbation_commande_commandeId_dateDecision_idx" ON "decision_approbation_commande"("commandeId", "dateDecision");
CREATE UNIQUE INDEX "echeance_paiement_commande_commandeId_ordre_key" ON "echeance_paiement_commande"("commandeId", "ordre");
CREATE UNIQUE INDEX "jalon_commande_achat_clientOperationId_key" ON "jalon_commande_achat"("clientOperationId");
CREATE INDEX "jalon_commande_achat_commandeId_type_idx" ON "jalon_commande_achat"("commandeId", "type");
CREATE UNIQUE INDEX "expedition_internationale_clientOperationId_key" ON "expedition_internationale"("clientOperationId");
CREATE INDEX "expedition_internationale_commandeId_dateCreation_idx" ON "expedition_internationale"("commandeId", "dateCreation");
CREATE UNIQUE INDEX "conteneur_import_expeditionId_numero_key" ON "conteneur_import"("expeditionId", "numero");
CREATE UNIQUE INDEX "dossier_douane_expeditionId_key" ON "dossier_douane"("expeditionId");
CREATE UNIQUE INDEX "document_import_clientOperationId_key" ON "document_import"("clientOperationId");
CREATE INDEX "document_import_dossierId_type_idx" ON "document_import"("dossierId", "type");
CREATE UNIQUE INDEX "ligne_cout_import_clientOperationId_key" ON "ligne_cout_import"("clientOperationId");
CREATE INDEX "ligne_cout_import_dossierId_type_idx" ON "ligne_cout_import"("dossierId", "type");

ALTER TABLE "commande_achat" ADD CONSTRAINT "commande_achat_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sequence_document_achat" ADD CONSTRAINT "sequence_document_achat_societeId_fkey"
  FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commande_achat_version" ADD CONSTRAINT "commande_achat_version_commandeId_fkey"
  FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_approbation_commande" ADD CONSTRAINT "decision_approbation_commande_commandeId_fkey"
  FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "echeance_paiement_commande" ADD CONSTRAINT "echeance_paiement_commande_commandeId_fkey"
  FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jalon_commande_achat" ADD CONSTRAINT "jalon_commande_achat_commandeId_fkey"
  FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expedition_internationale" ADD CONSTRAINT "expedition_internationale_commandeId_fkey"
  FOREIGN KEY ("commandeId") REFERENCES "commande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conteneur_import" ADD CONSTRAINT "conteneur_import_expeditionId_fkey"
  FOREIGN KEY ("expeditionId") REFERENCES "expedition_internationale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dossier_douane" ADD CONSTRAINT "dossier_douane_expeditionId_fkey"
  FOREIGN KEY ("expeditionId") REFERENCES "expedition_internationale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_import" ADD CONSTRAINT "document_import_dossierId_fkey"
  FOREIGN KEY ("dossierId") REFERENCES "dossier_douane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_cout_import" ADD CONSTRAINT "ligne_cout_import_dossierId_fkey"
  FOREIGN KEY ("dossierId") REFERENCES "dossier_douane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
