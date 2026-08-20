-- CreateTable
CREATE TABLE "fournisseur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "contact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_stock" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "dateReception" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,

    CONSTRAINT "reception_stock_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reception_stock" ADD CONSTRAINT "reception_stock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_stock" ADD CONSTRAINT "reception_stock_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_stock" ADD CONSTRAINT "reception_stock_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
