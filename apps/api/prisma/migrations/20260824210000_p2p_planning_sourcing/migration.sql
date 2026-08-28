-- P2P planning/sourcing : enveloppes et engagements budgétaires append-only,
-- consultations/offres fournisseurs et idempotence des créations sensibles.

CREATE TYPE "TypeMouvementBudgetAchat" AS ENUM ('ENGAGEMENT', 'LIBERATION');
CREATE TYPE "StatutConsultationFournisseur" AS ENUM ('OUVERTE', 'CLOTUREE', 'ANNULEE');

ALTER TABLE "demande_achat"
  ADD COLUMN "clientOperationId" TEXT,
  ADD COLUMN "budgetId" TEXT;

CREATE TABLE "budget_achat" (
  "id" TEXT NOT NULL,
  "centreCoutId" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "devise" TEXT NOT NULL,
  "montantAlloue" DECIMAL(14,2) NOT NULL,
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin" TIMESTAMP(3) NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "budget_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mouvement_budget_achat" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "demandeId" TEXT NOT NULL,
  "type" "TypeMouvementBudgetAchat" NOT NULL,
  "montant" DECIMAL(14,2) NOT NULL,
  "utilisateurId" TEXT NOT NULL,
  "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "motif" TEXT,
  CONSTRAINT "mouvement_budget_achat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consultation_fournisseur" (
  "id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "demandeId" TEXT NOT NULL,
  "statut" "StatutConsultationFournisseur" NOT NULL DEFAULT 'OUVERTE',
  "dateLimite" TIMESTAMP(3),
  "notes" TEXT,
  "clientOperationId" TEXT,
  "createurId" TEXT NOT NULL,
  "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consultation_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitation_consultation_fournisseur" (
  "id" TEXT NOT NULL,
  "consultationId" TEXT NOT NULL,
  "fournisseurId" TEXT NOT NULL,
  CONSTRAINT "invitation_consultation_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offre_fournisseur" (
  "id" TEXT NOT NULL,
  "consultationId" TEXT NOT NULL,
  "fournisseurId" TEXT NOT NULL,
  "devise" TEXT NOT NULL,
  "transport" DECIMAL(14,2) NOT NULL,
  "assurance" DECIMAL(14,2) NOT NULL,
  "douane" DECIMAL(14,2) NOT NULL,
  "taxes" DECIMAL(14,2) NOT NULL,
  "autresCouts" DECIMAL(14,2) NOT NULL,
  "delaiLivraisonJours" INTEGER NOT NULL,
  "conditionsPaiement" TEXT,
  "validiteJusquAu" TIMESTAMP(3),
  "clientOperationId" TEXT,
  "saisieParId" TEXT NOT NULL,
  "dateSoumission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offre_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ligne_offre_fournisseur" (
  "id" TEXT NOT NULL,
  "offreId" TEXT NOT NULL,
  "ligneDemandeId" TEXT NOT NULL,
  "produitId" TEXT,
  "quantite" INTEGER NOT NULL,
  "prixUnitaire" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "ligne_offre_fournisseur_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demande_achat_clientOperationId_key" ON "demande_achat"("clientOperationId");
CREATE INDEX "demande_achat_budgetId_statut_idx" ON "demande_achat"("budgetId", "statut");
CREATE INDEX "budget_achat_centreCoutId_actif_devise_dateDebut_dateFin_idx"
  ON "budget_achat"("centreCoutId", "actif", "devise", "dateDebut", "dateFin");
CREATE INDEX "mouvement_budget_achat_budgetId_dateHeure_idx"
  ON "mouvement_budget_achat"("budgetId", "dateHeure");
CREATE INDEX "mouvement_budget_achat_demandeId_dateHeure_idx"
  ON "mouvement_budget_achat"("demandeId", "dateHeure");
CREATE UNIQUE INDEX "consultation_fournisseur_numero_key" ON "consultation_fournisseur"("numero");
CREATE UNIQUE INDEX "consultation_fournisseur_clientOperationId_key"
  ON "consultation_fournisseur"("clientOperationId");
CREATE INDEX "consultation_fournisseur_demandeId_statut_idx"
  ON "consultation_fournisseur"("demandeId", "statut");
CREATE UNIQUE INDEX "invitation_consultation_fournisseur_consultationId_fournisseurId_key"
  ON "invitation_consultation_fournisseur"("consultationId", "fournisseurId");
CREATE UNIQUE INDEX "offre_fournisseur_clientOperationId_key" ON "offre_fournisseur"("clientOperationId");
CREATE UNIQUE INDEX "offre_fournisseur_consultationId_fournisseurId_key"
  ON "offre_fournisseur"("consultationId", "fournisseurId");
CREATE INDEX "offre_fournisseur_consultationId_dateSoumission_idx"
  ON "offre_fournisseur"("consultationId", "dateSoumission");
CREATE UNIQUE INDEX "ligne_offre_fournisseur_offreId_ligneDemandeId_key"
  ON "ligne_offre_fournisseur"("offreId", "ligneDemandeId");

ALTER TABLE "demande_achat"
  ADD CONSTRAINT "demande_achat_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budget_achat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_achat"
  ADD CONSTRAINT "budget_achat_centreCoutId_fkey"
  FOREIGN KEY ("centreCoutId") REFERENCES "centre_cout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvement_budget_achat"
  ADD CONSTRAINT "mouvement_budget_achat_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budget_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvement_budget_achat"
  ADD CONSTRAINT "mouvement_budget_achat_demandeId_fkey"
  FOREIGN KEY ("demandeId") REFERENCES "demande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvement_budget_achat"
  ADD CONSTRAINT "mouvement_budget_achat_utilisateurId_fkey"
  FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_fournisseur"
  ADD CONSTRAINT "consultation_fournisseur_demandeId_fkey"
  FOREIGN KEY ("demandeId") REFERENCES "demande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_fournisseur"
  ADD CONSTRAINT "consultation_fournisseur_createurId_fkey"
  FOREIGN KEY ("createurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_consultation_fournisseur"
  ADD CONSTRAINT "invitation_consultation_fournisseur_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultation_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_consultation_fournisseur"
  ADD CONSTRAINT "invitation_consultation_fournisseur_fournisseurId_fkey"
  FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_fournisseur"
  ADD CONSTRAINT "offre_fournisseur_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultation_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_fournisseur"
  ADD CONSTRAINT "offre_fournisseur_fournisseurId_fkey"
  FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offre_fournisseur"
  ADD CONSTRAINT "offre_fournisseur_saisieParId_fkey"
  FOREIGN KEY ("saisieParId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_offre_fournisseur"
  ADD CONSTRAINT "ligne_offre_fournisseur_offreId_fkey"
  FOREIGN KEY ("offreId") REFERENCES "offre_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_offre_fournisseur"
  ADD CONSTRAINT "ligne_offre_fournisseur_ligneDemandeId_fkey"
  FOREIGN KEY ("ligneDemandeId") REFERENCES "ligne_demande_achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_offre_fournisseur"
  ADD CONSTRAINT "ligne_offre_fournisseur_produitId_fkey"
  FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
