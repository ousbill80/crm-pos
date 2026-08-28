// Paystack webhook simulé — capture, idempotence, montant incorrect (PLAN-E-COMMERCE Lot 4a).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { shopPanierCookie } from './utils/http';

const PAYSTACK_SECRET = 'test-paystack-secret-e2e';
const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-paystack-e2e';
process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;
process.env.EMAIL_PROVIDER = 'mock';

jest.setTimeout(120_000);

describe('Shop Paystack (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let produitId: string;
  let entrepotId: string;
  let zoneId: string;

  beforeAll(async () => {
    await env.start();

    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'Paystack E2E', adresse: 'Abidjan' },
    });
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'B1', adresse: 'A', zoneId: zone.id },
    });
    const entrepot = await env.prisma.entrepot.create({
      data: { nom: 'Stock', code: 'ST', boutiqueId: boutique.id },
    });
    entrepotId = entrepot.id;
    await env.prisma.parametreShop.create({
      data: {
        societeId: societe.id,
        shopActif: true,
        entrepotWebDefautId: entrepotId,
        livraisonActive: true,
      },
    });
    zoneId = (
      await env.prisma.zoneLivraison.create({
        data: { libelle: 'Abidjan', tarifForfait: 1000, actif: true },
      })
    ).id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Coque PSP',
        prixUnitaire: 5000,
        prixWeb: 5500,
        visibleWeb: true,
        slug: 'coque-psp',
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
        login: 'psp-audit-si',
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'SI',
        prenom: 'PSP',
        actif: true,
        roleId: role.id,
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(
      json({
        verify: (req, _res, buf) => {
          (req as RawBodyRequest<Request>).rawBody = buf;
        },
      }),
    );
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

  async function checkoutPrepaye(clientOperationId: string) {
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
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        providerPsp: 'PAYSTACK',
        zoneLivraisonId: zoneId,
        adresseLivraison: { ville: 'Abidjan', ligne1: 'Rue 1' },
        emailInvite: 'paystack@test.local',
      })
      .expect(201);
    return res.body as {
      id: string;
      statut: string;
      montantTotal: string;
      clientOperationId: string;
    };
  }

  function signPaystack(body: object): { payload: string; signature: string } {
    const payload = JSON.stringify(body);
    const signature = createHmac('sha512', PAYSTACK_SECRET)
      .update(payload)
      .digest('hex');
    return { payload, signature };
  }

  it('webhook charge.success → PREPARATION + idempotence', async () => {
    const opId = '44444444-4444-4444-8444-444444444444';
    const cmd = await checkoutPrepaye(opId);
    expect(cmd.statut).toBe('EN_ATTENTE_PAIEMENT');

    const montant = Math.round(Number(cmd.montantTotal));
    const event = {
      event: 'charge.success',
      data: {
        id: 9001,
        status: 'success',
        reference: opId,
        amount: montant,
        currency: 'XOF',
      },
    };
    const { payload, signature } = signPaystack(event);

    await request(app.getHttpServer())
      .post('/shop/webhooks/paystack')
      .set('x-paystack-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);

    const updated = await env.prisma.commandeWeb.findUnique({
      where: { id: cmd.id },
    });
    expect(updated?.statut).toBe('PREPARATION');

    const dup = await request(app.getHttpServer())
      .post('/shop/webhooks/paystack')
      .set('x-paystack-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);
    expect((dup.body as { duplicate?: boolean }).duplicate).toBe(true);
  });

  it('montant incorrect → commande non payée', async () => {
    const opId = '55555555-5555-5555-8555-555555555555';
    const cmd = await checkoutPrepaye(opId);
    const event = {
      event: 'charge.success',
      data: {
        id: 9002,
        status: 'success',
        reference: opId,
        amount: 1,
        currency: 'XOF',
      },
    };
    const { payload, signature } = signPaystack(event);
    await request(app.getHttpServer())
      .post('/shop/webhooks/paystack')
      .set('x-paystack-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);

    const updated = await env.prisma.commandeWeb.findUnique({
      where: { id: cmd.id },
    });
    expect(updated?.statut).toBe('EN_ATTENTE_PAIEMENT');
  });
});
