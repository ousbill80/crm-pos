-- E-commerce shop foundation (PLAN-E-COMMERCE Lot 1)
-- ParametreShop, CommandeWeb, extensions Produit/Boutique, réservations web.

CREATE TYPE "ModeAffichagePrixShop" AS ENUM ('HT', 'TTC');
CREATE TYPE "ModeReglementCommandeWeb" AS ENUM ('PREPAYE_PSP', 'PAIEMENT_RETRAIT', 'PAIEMENT_LIVRAISON');
CREATE TYPE "ProviderPspShop" AS ENUM ('PAYSTACK', 'ORANGE_MONEY', 'WAVE');
CREATE TYPE "ModeFulfillmentCommandeWeb" AS ENUM ('RETRAIT_BOUTIQUE', 'LIVRAISON');
CREATE TYPE "StatutCommandeWeb" AS ENUM (
  'PANIER',
  'EN_ATTENTE_PAIEMENT',
  'PAYEE',
  'PREPARATION',
  'PRETE',
  'EXPEDIEE',
  'LIVREE',
  'REMISE',
  'ANNULEE',
  'REMBOURSEE',
  'LITIGE'
);
CREATE TYPE "TypePaiementCommandeWeb" AS ENUM ('INITIE', 'CAPTURE', 'REMBOURSEMENT', 'ECHEC');
CREATE TYPE "StatutPaiementCommandeWeb" AS ENUM ('EN_COURS', 'REUSSI', 'ECHEC', 'REMBOURSE');

ALTER TABLE "produit" ADD COLUMN "prixWeb" DECIMAL(14,2);
ALTER TABLE "produit" ADD COLUMN "visibleWeb" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "produit" ADD COLUMN "tauxTva" DECIMAL(5,2);
ALTER TABLE "produit" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "produit_slug_key" ON "produit"("slug");
CREATE INDEX "produit_visibleWeb_idx" ON "produit"("visibleWeb");

ALTER TABLE "boutique" ADD COLUMN "retraitWebActif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "boutique" ADD COLUMN "entrepotWebId" TEXT;
ALTER TABLE "boutique" ADD COLUMN "delaiRetraitHeures" INTEGER;

CREATE TABLE "parametre_shop" (
  "id" TEXT NOT NULL,
  "societeId" TEXT NOT NULL,
  "shopActif" BOOLEAN NOT NULL DEFAULT false,
  "entrepotWebDefautId" TEXT,
  "dureeReservationPanierMin" INTEGER NOT NULL DEFAULT 15,
  "retraitActif" BOOLEAN NOT NULL DEFAULT true,
  "livraisonActive" BOOLEAN NOT NULL DEFAULT true,
  "deviseAffichage" TEXT NOT NULL DEFAULT 'XOF',
  "modeAffichagePrix" "ModeAffichagePrixShop" NOT NULL DEFAULT 'HT',
  "tauxTvaDefaut" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "afficherDetailTvaPanier" BOOLEAN NOT NULL DEFAULT true,
  "fallbackPrixMagasin" BOOLEAN NOT NULL DEFAULT true,
  "paiementRetraitActif" BOOLEAN NOT NULL DEFAULT true,
  "paiementLivraisonActif" BOOLEAN NOT NULL DEFAULT true,
  "modesPaiementRetrait" "ModePaiement"[] DEFAULT ARRAY['ESPECES']::"ModePaiement"[],
  "modesPaiementLivraison" "ModePaiement"[] DEFAULT ARRAY['ESPECES']::"ModePaiement"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "parametre_shop_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "parametre_shop_societeId_key" ON "parametre_shop"("societeId");

CREATE TABLE "compte_client" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "emailVerifie" BOOLEAN NOT NULL DEFAULT false,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "refreshTokenHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compte_client_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "compte_client_email_key" ON "compte_client"("email");
CREATE UNIQUE INDEX "compte_client_clientId_key" ON "compte_client"("clientId");

CREATE TABLE "adresse_client" (
  "id" TEXT NOT NULL,
  "compteClientId" TEXT,
  "clientId" TEXT,
  "libelle" TEXT NOT NULL,
  "ligne1" TEXT NOT NULL,
  "ligne2" TEXT,
  "ville" TEXT NOT NULL,
  "region" TEXT,
  "codePostal" TEXT,
  "pays" TEXT NOT NULL DEFAULT 'SN',
  "telephone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "adresse_client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "zone_livraison" (
  "id" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "tarifForfait" DECIMAL(14,2) NOT NULL,
  "delaiJoursMin" INTEGER NOT NULL DEFAULT 1,
  "delaiJoursMax" INTEGER NOT NULL DEFAULT 3,
  "villesJson" JSONB,
  "codesPostauxJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "zone_livraison_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commande_web" (
  "id" TEXT NOT NULL,
  "clientOperationId" TEXT NOT NULL,
  "statut" "StatutCommandeWeb" NOT NULL DEFAULT 'PANIER',
  "modeFulfillment" "ModeFulfillmentCommandeWeb" NOT NULL,
  "modeReglement" "ModeReglementCommandeWeb" NOT NULL,
  "providerPsp" "ProviderPspShop",
  "canal" TEXT NOT NULL DEFAULT 'WEB',
  "clientId" TEXT,
  "compteClientId" TEXT,
  "emailInvite" TEXT,
  "telephoneInvite" TEXT,
  "boutiqueRetraitId" TEXT,
  "entrepotId" TEXT NOT NULL,
  "zoneLivraisonId" TEXT,
  "adresseLivraisonJson" JSONB,
  "montantArticlesHt" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "montantTva" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "montantArticlesTtc" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remiseFidelite" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "fraisLivraison" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "montantTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "numeroSuivi" TEXT,
  "noteClient" TEXT,
  "suiviToken" TEXT,
  "payeeAt" TIMESTAMP(3),
  "expireAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commande_web_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commande_web_clientOperationId_key" ON "commande_web"("clientOperationId");
CREATE UNIQUE INDEX "commande_web_suiviToken_key" ON "commande_web"("suiviToken");
CREATE INDEX "commande_web_statut_idx" ON "commande_web"("statut");
CREATE INDEX "commande_web_compteClientId_idx" ON "commande_web"("compteClientId");
CREATE INDEX "commande_web_clientId_idx" ON "commande_web"("clientId");

CREATE TABLE "ligne_commande_web" (
  "id" TEXT NOT NULL,
  "commandeWebId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "prixUnitaireHt" DECIMAL(14,2) NOT NULL,
  "tauxTva" DECIMAL(5,2) NOT NULL,
  "montantTvaLigne" DECIMAL(14,2) NOT NULL,
  "prixUnitaireTtc" DECIMAL(14,2) NOT NULL,
  "designationSnapshot" TEXT NOT NULL,
  "referenceSnapshot" TEXT,
  CONSTRAINT "ligne_commande_web_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservation_web" (
  "id" TEXT NOT NULL,
  "holdId" TEXT NOT NULL,
  "commandeWebId" TEXT NOT NULL,
  "produitId" TEXT NOT NULL,
  "entrepotId" TEXT NOT NULL,
  "quantite" INTEGER NOT NULL,
  "expireAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservation_web_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reservation_web_holdId_key" ON "reservation_web"("holdId");
CREATE INDEX "reservation_web_produitId_entrepotId_idx" ON "reservation_web"("produitId", "entrepotId");
CREATE INDEX "reservation_web_expireAt_idx" ON "reservation_web"("expireAt");

CREATE TABLE "paiement_commande_web" (
  "id" TEXT NOT NULL,
  "commandeWebId" TEXT NOT NULL,
  "provider" "ProviderPspShop" NOT NULL,
  "type" "TypePaiementCommandeWeb" NOT NULL,
  "referenceExterne" TEXT,
  "referenceProvider" TEXT,
  "montant" DECIMAL(14,2) NOT NULL,
  "devise" TEXT NOT NULL DEFAULT 'XOF',
  "statut" "StatutPaiementCommandeWeb" NOT NULL,
  "payloadWebhookJson" JSONB,
  "webhookEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paiement_commande_web_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "paiement_commande_web_provider_webhookEventId_key" ON "paiement_commande_web"("provider", "webhookEventId");
CREATE INDEX "paiement_commande_web_commandeWebId_idx" ON "paiement_commande_web"("commandeWebId");

CREATE TABLE "conversion_commande_vente" (
  "id" TEXT NOT NULL,
  "commandeWebId" TEXT NOT NULL,
  "venteId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversion_commande_vente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversion_commande_vente_commandeWebId_key" ON "conversion_commande_vente"("commandeWebId");
CREATE UNIQUE INDEX "conversion_commande_vente_venteId_key" ON "conversion_commande_vente"("venteId");

CREATE TABLE "webhook_journal" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "traite" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_journal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_journal_provider_eventId_key" ON "webhook_journal"("provider", "eventId");

ALTER TABLE "boutique" ADD CONSTRAINT "boutique_entrepotWebId_fkey" FOREIGN KEY ("entrepotWebId") REFERENCES "entrepot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "parametre_shop" ADD CONSTRAINT "parametre_shop_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parametre_shop" ADD CONSTRAINT "parametre_shop_entrepotWebDefautId_fkey" FOREIGN KEY ("entrepotWebDefautId") REFERENCES "entrepot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compte_client" ADD CONSTRAINT "compte_client_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "adresse_client" ADD CONSTRAINT "adresse_client_compteClientId_fkey" FOREIGN KEY ("compteClientId") REFERENCES "compte_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adresse_client" ADD CONSTRAINT "adresse_client_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_web" ADD CONSTRAINT "commande_web_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_web" ADD CONSTRAINT "commande_web_compteClientId_fkey" FOREIGN KEY ("compteClientId") REFERENCES "compte_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_web" ADD CONSTRAINT "commande_web_boutiqueRetraitId_fkey" FOREIGN KEY ("boutiqueRetraitId") REFERENCES "boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commande_web" ADD CONSTRAINT "commande_web_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commande_web" ADD CONSTRAINT "commande_web_zoneLivraisonId_fkey" FOREIGN KEY ("zoneLivraisonId") REFERENCES "zone_livraison"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ligne_commande_web" ADD CONSTRAINT "ligne_commande_web_commandeWebId_fkey" FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ligne_commande_web" ADD CONSTRAINT "ligne_commande_web_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_web" ADD CONSTRAINT "reservation_web_commandeWebId_fkey" FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservation_web" ADD CONSTRAINT "reservation_web_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_web" ADD CONSTRAINT "reservation_web_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement_commande_web" ADD CONSTRAINT "paiement_commande_web_commandeWebId_fkey" FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversion_commande_vente" ADD CONSTRAINT "conversion_commande_vente_commandeWebId_fkey" FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversion_commande_vente" ADD CONSTRAINT "conversion_commande_vente_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
