// Pagination catalogue shop — milliers de références (PLAN-E-COMMERCE).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body } from './utils/http';

jest.setTimeout(120_000);

describe('Shop catalogue pagination (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    await env.start();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const societe = await prisma.societe.create({
      data: { raisonSociale: 'Cat Page SA', adresse: 'Abidjan' },
    });
    const zone = await prisma.zone.create({ data: { nomZone: 'Z Cat' } });
    const boutique = await prisma.boutique.create({
      data: { nom: 'B Cat', adresse: 'Addr', zoneId: zone.id },
    });
    const entrepot = await prisma.entrepot.create({
      data: {
        nom: 'Stock web cat',
        code: 'WEBCAT',
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

    await prisma.produit.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        designation: `Piece catalogue ${String(i + 1).padStart(2, '0')}`,
        prixUnitaire: 1000,
        prixWeb: 1000 + i * 100,
        visibleWeb: true,
        slug: `piece-catalogue-${i + 1}`,
        categorie: i % 2 === 0 ? 'Mécanique' : 'Éclairage',
        tauxTva: 18,
        stock: 5,
      })),
    });
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('pagine le catalogue (limit + total + page)', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/shop/catalogue?limit=10&page=1&tri=designation')
      .expect(200);

    const catalogue1 = body<{
      pagination: {
        page: number;
        limit: number;
        total: number;
        pageCount: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
      items: Array<{ id: string }>;
    }>(page1);
    expect(catalogue1.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 30,
      pageCount: 3,
      hasNext: true,
      hasPrev: false,
    });
    expect(catalogue1.items).toHaveLength(10);

    const page2 = await request(app.getHttpServer())
      .get('/shop/catalogue?limit=10&page=2&tri=designation')
      .expect(200);
    const catalogue2 = body<typeof catalogue1>(page2);
    expect(catalogue2.pagination.page).toBe(2);
    expect(catalogue2.items).toHaveLength(10);
    expect(catalogue2.items[0].id).not.toBe(catalogue1.items[0].id);
  });

  it('plafonne limit à 48', async () => {
    const res = await request(app.getHttpServer())
      .get('/shop/catalogue?limit=200')
      .expect(200);
    const capped = body<{
      pagination: { limit: number };
      items: unknown[];
    }>(res);
    expect(capped.pagination.limit).toBe(48);
    expect(capped.items.length).toBeLessThanOrEqual(48);
  });
});
