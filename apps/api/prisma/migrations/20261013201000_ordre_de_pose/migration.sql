-- CreateEnum
CREATE TYPE "StatutOrdrePose" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'TERMINEE', 'ANNULEE');

-- AlterTable
ALTER TABLE "ligne_vente" ADD COLUMN     "avecPose" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "necessitePose" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ordre_de_pose" (
    "id" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "statut" "StatutOrdrePose" NOT NULL DEFAULT 'EN_ATTENTE',
    "qrToken" TEXT NOT NULL,
    "technicienId" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "motifAnnulation" TEXT,

    CONSTRAINT "ordre_de_pose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_pose" (
    "id" TEXT NOT NULL,
    "ordreDePoseId" TEXT NOT NULL,
    "ligneVenteId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,

    CONSTRAINT "ligne_pose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordre_de_pose_venteId_key" ON "ordre_de_pose"("venteId");

-- CreateIndex
CREATE UNIQUE INDEX "ordre_de_pose_qrToken_key" ON "ordre_de_pose"("qrToken");

-- CreateIndex
CREATE INDEX "ordre_de_pose_boutiqueId_statut_idx" ON "ordre_de_pose"("boutiqueId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "ligne_pose_ligneVenteId_key" ON "ligne_pose"("ligneVenteId");

-- AddForeignKey
ALTER TABLE "ordre_de_pose" ADD CONSTRAINT "ordre_de_pose_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordre_de_pose" ADD CONSTRAINT "ordre_de_pose_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "boutique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordre_de_pose" ADD CONSTRAINT "ordre_de_pose_technicienId_fkey" FOREIGN KEY ("technicienId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_pose" ADD CONSTRAINT "ligne_pose_ordreDePoseId_fkey" FOREIGN KEY ("ordreDePoseId") REFERENCES "ordre_de_pose"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_pose" ADD CONSTRAINT "ligne_pose_ligneVenteId_fkey" FOREIGN KEY ("ligneVenteId") REFERENCES "ligne_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_pose" ADD CONSTRAINT "ligne_pose_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
