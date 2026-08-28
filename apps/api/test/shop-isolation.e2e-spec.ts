// Isolation api-shop — routes staff absentes (PLAN-E-COMMERCE Lot 3, Option A).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { ShopAppModule } from '../src/shop-app.module';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body } from './utils/http';

jest.setTimeout(120_000);

describe('Shop isolation (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  beforeAll(async () => {
    await env.start();
    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'Iso', adresse: 'X' },
    });
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'B', adresse: 'A', zoneId: zone.id },
    });
    const entrepot = await env.prisma.entrepot.create({
      data: { nom: 'E', code: 'E1', boutiqueId: boutique.id },
    });
    await env.prisma.parametreShop.create({
      data: {
        societeId: societe.id,
        shopActif: true,
        entrepotWebDefautId: entrepot.id,
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ShopAppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('GET /health → api-shop', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(body<{ service: string }>(res).service).toBe('api-shop');
  });

  it('GET /transactions → 404 (route staff absente)', async () => {
    await request(app.getHttpServer()).get('/transactions').expect(404);
  });

  it('GET /caisses → 404', async () => {
    await request(app.getHttpServer()).get('/caisses').expect(404);
  });

  it('GET /shop/catalogue → 200 public', async () => {
    await request(app.getHttpServer()).get('/shop/catalogue').expect(200);
  });
});
