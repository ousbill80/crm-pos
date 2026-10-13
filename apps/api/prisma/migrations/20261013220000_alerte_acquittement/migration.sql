-- CreateTable
CREATE TABLE "alerte_acquittement" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerte_acquittement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerte_acquittement_type_entiteId_utilisateurId_key" ON "alerte_acquittement"("type", "entiteId", "utilisateurId");

-- AddForeignKey
ALTER TABLE "alerte_acquittement" ADD CONSTRAINT "alerte_acquittement_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
