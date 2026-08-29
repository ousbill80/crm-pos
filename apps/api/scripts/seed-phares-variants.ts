import { PrismaClient } from '@prisma/client';
import { seedCatalogueWeb } from '../prisma/seed-catalogue-web';

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.parametreShop.findFirst({
    where: { shopActif: true },
  });
  if (!shop?.entrepotWebDefautId) {
    console.log('no entrepot web');
    return;
  }
  const result = await seedCatalogueWeb(prisma, {
    hubId: shop.entrepotWebDefautId,
  });
  console.log(
    `Catalogue web OK — ${result.familles} familles / ${result.skus} SKUs`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
