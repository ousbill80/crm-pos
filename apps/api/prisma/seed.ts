// Seed des rôles de référence + société / entrepôts PRINCIPAL.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  { libelle: 'DIRECTION_GENERALE', niveauHabilitation: 0 },
  { libelle: 'DAF', niveauHabilitation: 1 },
  { libelle: 'CAISSIER_CENTRAL', niveauHabilitation: 1 },
  { libelle: 'CONTROLEUR_INTERNE', niveauHabilitation: 1 },
  { libelle: 'SUPERVISEUR_ZONE', niveauHabilitation: 2 },
  { libelle: 'RESPONSABLE_BOUTIQUE', niveauHabilitation: 3 },
  { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
  { libelle: 'RESPONSABLE_SI', niveauHabilitation: 1 },
  { libelle: 'RESPONSABLE_CRM', niveauHabilitation: 1 },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { libelle: role.libelle },
      update: { niveauHabilitation: role.niveauHabilitation },
      create: role,
    });
  }

  const existingSociete = await prisma.societe.findFirst();
  if (!existingSociete) {
    await prisma.societe.create({
      data: {
        raisonSociale: 'CaissePOS',
        adresse: 'Siège',
        devise: 'XOF',
      },
    });
  }

  const boutiques = await prisma.boutique.findMany();
  for (const boutique of boutiques) {
    await prisma.entrepot.upsert({
      where: {
        boutiqueId_code: { boutiqueId: boutique.id, code: 'PRINCIPAL' },
      },
      update: {},
      create: {
        nom: `Principal — ${boutique.nom}`,
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });
  }


  // Migre le cache Produit.stock historique vers StockQuant du PRINCIPAL
  // de la première boutique (données démo / legacy mono-emplacement).
  const premierEntrepot = await prisma.entrepot.findFirst({
    where: { type: 'PRINCIPAL' },
    orderBy: { nom: 'asc' },
  });
  if (premierEntrepot) {
    const produits = await prisma.produit.findMany({ where: { stock: { gt: 0 } } });
    for (const produit of produits) {
      await prisma.stockQuant.upsert({
        where: {
          produitId_entrepotId: {
            produitId: produit.id,
            entrepotId: premierEntrepot.id,
          },
        },
        update: { quantite: produit.stock },
        create: {
          produitId: produit.id,
          entrepotId: premierEntrepot.id,
          quantite: produit.stock,
        },
      });
    }
  }

  console.log(
    `Seed terminé : ${ROLES.length} rôles, société OK, ${boutiques.length} entrepôt(s) PRINCIPAL.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
