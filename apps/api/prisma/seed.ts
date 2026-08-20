// Seed des rôles de référence — cahier des charges §4 (tableau des rôles
// et responsabilités) et §6.2 (droits d'accès). niveauHabilitation reflète
// l'ordre du tableau, du plus large (0) au plus restreint.
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
  console.log(`Seed terminé : ${ROLES.length} rôles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
