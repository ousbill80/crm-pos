-- Avis post-livraison / post-retrait (fidélité + notation service)
CREATE TABLE "avis_commande_web" (
    "id" TEXT NOT NULL,
    "commandeWebId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "note" INTEGER,
    "commentaire" TEXT,
    "soumisAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avis_commande_web_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "avis_commande_web_commandeWebId_key" ON "avis_commande_web"("commandeWebId");
CREATE UNIQUE INDEX "avis_commande_web_token_key" ON "avis_commande_web"("token");

ALTER TABLE "avis_commande_web" ADD CONSTRAINT "avis_commande_web_commandeWebId_fkey" FOREIGN KEY ("commandeWebId") REFERENCES "commande_web"("id") ON DELETE CASCADE ON UPDATE CASCADE;
