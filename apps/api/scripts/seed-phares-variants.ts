import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const phareVariants = [
  {
    ref: 'LED-H7-W',
    slug: 'kit-phares-led-h7',
    designation: 'Kit phares LED H7 blanc 6000K',
    attributs: 'Culot: H7 | Couleur: Blanc | Température: 6000K',
    prixWeb: 28500,
  },
  {
    ref: 'LED-H4-W',
    slug: 'kit-phares-led-h4',
    designation: 'Kit phares LED H4 blanc 6000K',
    attributs: 'Culot: H4 | Couleur: Blanc | Température: 6000K',
    prixWeb: 29500,
  },
  {
    ref: 'LED-H11-W',
    slug: 'kit-phares-led-h11',
    designation: 'Kit phares LED H11 blanc 6000K',
    attributs: 'Culot: H11 | Couleur: Blanc | Température: 6000K',
    prixWeb: 27500,
  },
  {
    ref: 'LED-H7-Y',
    slug: 'kit-phares-led-h7-jaune',
    designation: 'Kit phares LED H7 jaune 3000K',
    attributs: 'Culot: H7 | Couleur: Jaune | Température: 3000K',
    prixWeb: 28900,
  },
] as const;

async function main() {
  await prisma.produit.updateMany({
    where: { slug: 'kit-phares-led-h7', NOT: { reference: 'LED-H7-W' } },
    data: { slug: null },
  });

  let parentId: string | null = null;
  for (const [i, v] of phareVariants.entries()) {
    const existing = await prisma.produit.findFirst({
      where: { reference: v.ref },
    });
    const data = {
      designation: v.designation,
      reference: v.ref,
      categorie: 'Phares',
      description:
        'Kit LED plug & play — faisceau adapté. Vérifier le culot avant montage.',
      prixUnitaire: v.prixWeb,
      prixWeb: v.prixWeb,
      visibleWeb: true,
      actif: true,
      slug: v.slug,
      tauxTva: 18,
      attributs: v.attributs,
      parentId: i === 0 ? null : parentId,
    };
    const row = existing
      ? await prisma.produit.update({ where: { id: existing.id }, data })
      : await prisma.produit.create({ data });
    if (i === 0) parentId = row.id;
  }
  console.log('Phares variants OK parent=', parentId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
