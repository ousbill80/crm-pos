// Initiation paiement shop — sandbox hors production, jamais de 500 (cœur encaissement).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body, shopPanierCookie } from './utils/http';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-shop-payer-e2e';
delete process.env.PAYSTACK_SECRET_KEY;
process.env.PAYSTACK_SECRET_KEY = '';
process.env.ORANGE_MONEY_ENABLED = '0';
process.env.WAVE_ENABLED = '0';
process.env.SHOP_PSP_SANDBOX = '1';
process.env.EMAIL_PROVIDER = 'mock';
process.env.SHOP_PUBLIC_URL = 'http://127.0.0.1:5174';

jest.setTimeout(120_000);

describe('Shop payer sandbox (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let produitId: string;
  let entrepotId: string;
  let boutiqueRetraitId: string;

  beforeAll(async () => {
    await env.start();

    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'Payer E2E', adresse: 'Abidjan' },
    });
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z' } });
    const boutique = await env.prisma.boutique.create({
      data: {
        nom: 'B1',
        adresse: 'A',
        zoneId: zone.id,
        retraitWebActif: true,
      },
    });
    boutiqueRetraitId = boutique.id;
    const entrepot = await env.prisma.entrepot.create({
      data: { nom: 'Stock', code: 'ST', boutiqueId: boutique.id },
    });
    entrepotId = entrepot.id;
    await env.prisma.parametreShop.create({
      data: {
        societeId: societe.id,
        shopActif: true,
        entrepotWebDefautId: entrepotId,
        retraitActif: true,
        livraisonActive: true,
        fallbackPrixMagasin: true,
      },
    });

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Filtre payer',
        prixUnitaire: 4000,
        prixWeb: 4500,
        visibleWeb: true,
        slug: 'filtre-payer',
        stock: 10,
      },
    });
    produitId = produit.id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId, quantite: 5 },
    });

    const role = await env.prisma.role.upsert({
      where: { libelle: 'RESPONSABLE_SI' },
      update: {},
      create: { libelle: 'RESPONSABLE_SI', niveauHabilitation: 1 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: 'payer-audit-si',
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'SI',
        prenom: 'Payer',
        actif: true,
        roleId: role.id,
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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

  async function checkoutPrepaye(clientOperationId: string, provider: string) {
    const create = await request(app.getHttpServer())
      .post('/shop/panier')
      .expect(201);
    const cookie = shopPanierCookie(create);
    await request(app.getHttpServer())
      .patch('/shop/panier/lignes')
      .set('Cookie', cookie)
      .send({ lignes: [{ produitId, quantite: 1 }] })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId,
        modeFulfillment: 'RETRAIT_BOUTIQUE',
        modeReglement: 'PREPAYE_PSP',
        providerPsp: provider,
        boutiqueRetraitId,
        emailInvite: 'payer@test.local',
        telephoneInvite: '+2250700000000',
      })
      .expect(201);
    return res.body as {
      id: string;
      statut: string;
      authorizationUrl?: string;
      sandbox?: boolean;
      suiviToken?: string;
    };
  }

  it('checkout PREPAYE sans clé Paystack → URL sandbox, pas de 500', async () => {
    const cmd = await checkoutPrepaye(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'PAYSTACK',
    );
    expect(cmd.statut).toBe('EN_ATTENTE_PAIEMENT');
    expect(cmd.authorizationUrl).toMatch(/sandbox=1/);
    expect(cmd.authorizationUrl).toContain(cmd.id);
    expect(cmd.sandbox).toBe(true);
  });

  it('POST /payer est idempotent et ne renvoie jamais Internal server error', async () => {
    const cmd = await checkoutPrepaye(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'PAYSTACK',
    );
    const pay = await request(app.getHttpServer())
      .post(`/shop/commandes/${cmd.id}/payer`)
      .send({ provider: 'PAYSTACK' })
      .expect(201);
    const payBody = body<{ authorizationUrl: string; message?: string }>(pay);
    expect(payBody.authorizationUrl).toMatch(/sandbox=1/);
    expect(payBody.message).not.toBe('Internal server error');
  });

  it('sandbox-confirmer → PREPARATION (paiement local abouti)', async () => {
    const cmd = await checkoutPrepaye(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'PAYSTACK',
    );
    const conf = await request(app.getHttpServer())
      .post(`/shop/commandes/${cmd.id}/sandbox-confirmer`)
      .send({})
      .expect(201);
    expect(body<{ statut: string }>(conf).statut).toBe('PREPARATION');

    const encore = await request(app.getHttpServer())
      .post(`/shop/commandes/${cmd.id}/sandbox-confirmer`)
      .send({})
      .expect(201);
    expect(body<{ statut: string }>(encore).statut).toBe('PREPARATION');

    const statut = await request(app.getHttpServer())
      .get(`/shop/commandes/${cmd.id}/statut`)
      .expect(200);
    expect(body<{ statut: string }>(statut).statut).toBe('PREPARATION');
  });

  it('Orange Money sans activation → sandbox local (pas de 500)', async () => {
    const cmd = await checkoutPrepaye(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
      'ORANGE_MONEY',
    );
    expect(cmd.authorizationUrl).toMatch(/sandbox=1/);
    const conf = await request(app.getHttpServer())
      .post(`/shop/commandes/${cmd.id}/sandbox-confirmer`)
      .send({})
      .expect(201);
    expect(body<{ statut: string }>(conf).statut).toBe('PREPARATION');
  });
});
