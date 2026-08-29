import type { PrismaClient } from '@prisma/client';
import { CATALOGUE_AUTO } from './catalogue-auto.data';

export async function seedCatalogueWeb(
  prisma: PrismaClient,
  opts: { hubId: string },
): Promise<{ familles: number; skus: number }> {
  let skus = 0;
  for (const famille of CATALOGUE_AUTO) {
    let parentId: string | null = null;
    for (const [i, v] of famille.variants.entries()) {
      const imageUrl = `/catalogue/${v.image}`;
      await prisma.produit.updateMany({
        where: { slug: v.slug, NOT: { reference: v.ref } },
        data: { slug: null },
      });
      const existing = await prisma.produit.findFirst({
        where: { reference: v.ref },
      });
      const data = {
        designation: v.designation,
        reference: v.ref,
        categorie: famille.categorie,
        description: famille.description,
        prixUnitaire: v.prixWeb,
        prixWeb: v.prixWeb,
        visibleWeb: true,
        actif: true,
        slug: v.slug,
        tauxTva: 18,
        attributs: v.attributs,
        imageUrl,
        parentId: i === 0 ? null : parentId,
      };
      const row = existing
        ? await prisma.produit.update({ where: { id: existing.id }, data })
        : await prisma.produit.create({ data });
      if (i === 0) parentId = row.id;
      else if (parentId && row.parentId !== parentId) {
        await prisma.produit.update({
          where: { id: row.id },
          data: { parentId },
        });
      }

      await prisma.stockQuant.upsert({
        where: {
          produitId_entrepotId: {
            produitId: row.id,
            entrepotId: opts.hubId,
          },
        },
        update: { quantite: v.stockWeb },
        create: {
          produitId: row.id,
          entrepotId: opts.hubId,
          quantite: v.stockWeb,
        },
      });
      const somme = await prisma.stockQuant.aggregate({
        where: { produitId: row.id },
        _sum: { quantite: true },
      });
      await prisma.produit.update({
        where: { id: row.id },
        data: { stock: somme._sum.quantite ?? v.stockWeb },
      });
      skus += 1;
    }
  }

  const refsAuto = CATALOGUE_AUTO.flatMap((f) => f.variants.map((v) => v.ref));
  await prisma.produit.updateMany({
    where: { visibleWeb: true, reference: { notIn: refsAuto } },
    data: { visibleWeb: false },
  });
  await prisma.produit.updateMany({
    where: { visibleWeb: true, reference: null },
    data: { visibleWeb: false },
  });

  return { familles: CATALOGUE_AUTO.length, skus };
}
