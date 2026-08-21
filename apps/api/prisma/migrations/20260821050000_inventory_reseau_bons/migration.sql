-- Inventory réseau : usages d'emplacement, bons de stock, lots, réappro, coûts logistiques.

CREATE TYPE "UsageEmplacement" AS ENUM ('STOCK', 'ENTREE', 'SORTIE', 'PERTE', 'FOURNISSEUR', 'CLIENT');
CREATE TYPE "MethodeCout" AS ENUM ('CMP', 'FIFO', 'STANDARD');
CREATE TYPE "StrategieSortie" AS ENUM ('FIFO', 'FEFO');
CREATE TYPE "TypeOperationStock" AS ENUM ('RECEPTION', 'LIVRAISON', 'TRANSFERT_INTERNE', 'REBUT');
CREATE TYPE "StatutBonStock" AS ENUM ('BROUILLON', 'PRET', 'FAIT', 'ANNULE');
ALTER TYPE "TypeMouvementStock" ADD VALUE IF NOT EXISTS 'SCRAP';

ALTER TABLE "entrepot" ADD COLUMN "usage" "UsageEmplacement" NOT NULL DEFAULT 'STOCK';
ALTER TABLE "entrepot" ADD COLUMN "reseau" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "entrepot" ADD COLUMN "virtuel" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "entrepot_reseau_usage_idx" ON "entrepot"("reseau", "usage");

ALTER TABLE "produit" ADD COLUMN "codeBarres" TEXT;
ALTER TABLE "produit" ADD COLUMN "uniteMesure" TEXT NOT NULL DEFAULT 'UN';
ALTER TABLE "produit" ADD COLUMN "facteurUnite" DECIMAL(12,4) NOT NULL DEFAULT 1;
ALTER TABLE "produit" ADD COLUMN "parentId" TEXT;
ALTER TABLE "produit" ADD COLUMN "attributs" TEXT;
ALTER TABLE "produit" ADD COLUMN "methodeCout" "MethodeCout" NOT NULL DEFAULT 'CMP';
ALTER TABLE "produit" ADD COLUMN "coutStandard" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "produit" ADD COLUMN "strategieSortie" "StrategieSortie" NOT NULL DEFAULT 'FIFO';
CREATE UNIQUE INDEX "produit_codeBarres_key" ON "produit"("codeBarres");
ALTER TABLE "produit" ADD CONSTRAINT "produit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_quant" ADD COLUMN IF NOT EXISTS "consignation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "mouvement_stock" ADD COLUMN IF NOT EXISTS "lotId" TEXT;

CREATE TABLE "lot" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "dateExpiration" TIMESTAMP(3),
    "createurId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lot_produitId_numero_key" ON "lot"("produitId", "numero");

CREATE TABLE "stock_lot" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "entrepotId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_lot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_lot_produitId_entrepotId_lotId_key" ON "stock_lot"("produitId", "entrepotId", "lotId");

CREATE TABLE "bon_stock" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "type" "TypeOperationStock" NOT NULL,
    "statut" "StatutBonStock" NOT NULL DEFAULT 'BROUILLON',
    "entrepotSourceId" TEXT,
    "entrepotDestId" TEXT,
    "notes" TEXT,
    "receptionId" TEXT,
    "initiateurId" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datePret" TIMESTAMP(3),
    "dateFait" TIMESTAMP(3),
    CONSTRAINT "bon_stock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bon_stock_numero_key" ON "bon_stock"("numero");
CREATE INDEX "bon_stock_statut_type_idx" ON "bon_stock"("statut", "type");

CREATE TABLE "ligne_bon_stock" (
    "id" TEXT NOT NULL,
    "bonId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "quantiteOk" INTEGER,
    "quantiteRebut" INTEGER,
    "lotId" TEXT,
    "numeroLot" TEXT,
    "dateExpiration" TIMESTAMP(3),
    CONSTRAINT "ligne_bon_stock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "regle_reappro" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "entrepotId" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    CONSTRAINT "regle_reappro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "regle_reappro_produitId_entrepotId_key" ON "regle_reappro"("produitId", "entrepotId");

CREATE TABLE "cout_logistique" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "receptionId" TEXT,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,
    CONSTRAINT "cout_logistique_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cout_logistique_produitId_idx" ON "cout_logistique"("produitId");

ALTER TABLE "lot" ADD CONSTRAINT "lot_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lot" ADD CONSTRAINT "lot_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvement_stock" ADD CONSTRAINT "mouvement_stock_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bon_stock" ADD CONSTRAINT "bon_stock_entrepotSourceId_fkey" FOREIGN KEY ("entrepotSourceId") REFERENCES "entrepot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bon_stock" ADD CONSTRAINT "bon_stock_entrepotDestId_fkey" FOREIGN KEY ("entrepotDestId") REFERENCES "entrepot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bon_stock" ADD CONSTRAINT "bon_stock_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bon_stock" ADD CONSTRAINT "bon_stock_initiateurId_fkey" FOREIGN KEY ("initiateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_bon_stock" ADD CONSTRAINT "ligne_bon_stock_bonId_fkey" FOREIGN KEY ("bonId") REFERENCES "bon_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_bon_stock" ADD CONSTRAINT "ligne_bon_stock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_bon_stock" ADD CONSTRAINT "ligne_bon_stock_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "regle_reappro" ADD CONSTRAINT "regle_reappro_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regle_reappro" ADD CONSTRAINT "regle_reappro_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cout_logistique" ADD CONSTRAINT "cout_logistique_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cout_logistique" ADD CONSTRAINT "cout_logistique_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "reception_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
