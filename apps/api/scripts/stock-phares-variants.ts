import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.parametreShop.findFirst({
    where: { shopActif: true },
  });
  if (!shop?.entrepotWebDefautId) {
    console.log('no entrepot web');
    return;
  }
  const refs = ['LED-H7-W', 'LED-H4-W', 'LED-H11-W', 'LED-H7-Y'];
  for (const ref of refs) {
    const p = await prisma.produit.findFirst({ where: { reference: ref } });
    if (!p) continue;
    const existing = await prisma.stockQuant.findFirst({
      where: { produitId: p.id, entrepotId: shop.entrepotWebDefautId },
    });
    if (existing) {
      await prisma.stockQuant.update({
        where: { id: existing.id },
        data: { quantite: 25 },
      });
    } else {
      await prisma.stockQuant.create({
        data: {
          produitId: p.id,
          entrepotId: shop.entrepotWebDefautId,
          quantite: 25,
        },
      });
    }
    await prisma.produit.update({
      where: { id: p.id },
      data: { stock: 25 },
    });
  }
  console.log('stock OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
