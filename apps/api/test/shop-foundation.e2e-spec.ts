// Fondation e-commerce — migration, ParametreShop, résolution prix (PLAN-E-COMMERCE Lot 1).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { resoudrePrixProduitShop } from '../src/shop/prix-shop.calculator';
import { ModeAffichagePrixShop } from '@caisse-crm/shared';

jest.setTimeout(120_000);

describe('Shop foundation (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await env.start();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const societe = await prisma.societe.create({
      data: {
        raisonSociale: 'Shop Test SA',
        adresse: 'Abidjan',
      },
    });
    const zone = await prisma.zone.create({ data: { nomZone: 'Z Shop' } });
    const boutique = await prisma.boutique.create({
      data: {
        nom: 'B Shop',
        adresse: 'Addr',
        zoneId: zone.id,
      },
    });
    const entrepot = await prisma.entrepot.create({
      data: {
        nom: 'Stock web',
        code: 'WEB',
        boutiqueId: boutique.id,
      },
    });
    await prisma.parametreShop.create({
      data: {
        societeId: societe.id,
        shopActif: true,
        entrepotWebDefautId: entrepot.id,
        modeAffichagePrix: 'TTC',
        tauxTvaDefaut: 18,
        fallbackPrixMagasin: false,
      },
    });
    await prisma.produit.create({
      data: {
        designation: 'Produit web test',
        prixUnitaire: 5000,
        prixWeb: 6000,
        visibleWeb: true,
        slug: 'produit-web-test',
        tauxTva: 18,
        stock: 10,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('résout le prix TTC depuis la base', async () => {
    const produit = await prisma.produit.findFirstOrThrow({
      where: { slug: 'produit-web-test' },
    });
    const params = await prisma.parametreShop.findFirstOrThrow();
    const prix = resoudrePrixProduitShop(
      {
        prixWeb: Number(produit.prixWeb),
        prixUnitaire: Number(produit.prixUnitaire),
        visibleWeb: produit.visibleWeb,
        tauxTva: produit.tauxTva ? Number(produit.tauxTva) : null,
        designation: produit.designation,
      },
      {
        modeAffichagePrix: ModeAffichagePrixShop.TTC,
        tauxTvaDefaut: Number(params.tauxTvaDefaut),
        fallbackPrixMagasin: params.fallbackPrixMagasin,
      },
    );
    expect(prix).not.toBeNull();
    expect(prix!.prixUnitaireHt).toBe(6000);
    expect(prix!.prixAffiche).toBe(7080);
  });

  it('persiste ReservationWeb distincte de ReservationStock', async () => {
    const produit = await prisma.produit.findFirstOrThrow({
      where: { slug: 'produit-web-test' },
    });
    const entrepot = await prisma.entrepot.findFirstOrThrow();
    const commande = await prisma.commandeWeb.create({
      data: {
        clientOperationId: '00000000-0000-4000-8000-000000000099',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        entrepotId: entrepot.id,
        statut: 'EN_ATTENTE_PAIEMENT',
      },
    });
    await prisma.reservationWeb.create({
      data: {
        holdId: 'hold-web-1',
        commandeWebId: commande.id,
        produitId: produit.id,
        entrepotId: entrepot.id,
        quantite: 2,
        expireAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const count = await prisma.reservationWeb.count();
    expect(count).toBe(1);
  });
});
