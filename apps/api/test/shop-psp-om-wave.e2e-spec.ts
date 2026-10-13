// Orange Money + Wave webhooks mock (PLAN-E-COMMERCE Lot 4b/c).
import { Test } from '@nestjs/testing';
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

jest.setTimeout(120_000);

process.env.ORANGE_MONEY_ENABLED = '1';
process.env.WAVE_ENABLED = '1';
process.env.ORANGE_MONEY_WEBHOOK_SECRET = 'om-test-secret';
process.env.WAVE_WEBHOOK_SECRET = 'wave-test-secret';

const MOT_DE_PASSE = 'MotDePasse!123';

describe('Shop OM/Wave webhooks (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let produitId: string;
  let entrepotId: string;
  let zoneId: string;

  beforeAll(async () => {
    await env.start();
    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'OM Wave', adresse: 'X' },
    });
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'B', adresse: 'A', zoneId: zone.id },
    });
    entrepotId = (
      await env.prisma.entrepot.create({
        data: { nom: 'E', code: 'E1', boutiqueId: boutique.id },
      })
    ).id;
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
        data: { libelle: 'Ville', tarifForfait: 500, actif: true },
      })
    ).id;
    produitId = (
      await env.prisma.produit.create({
        data: {
          designation: 'P',
          prixUnitaire: 3000,
          prixWeb: 3200,
          visibleWeb: true,
          slug: 'p-om',
          stock: 5,
        },
      })
    ).id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId, quantite: 3 },
    });

    const role = await env.prisma.role.upsert({
      where: { libelle: 'RESPONSABLE_SI' },
      update: {},
      create: { libelle: 'RESPONSABLE_SI', niveauHabilitation: 1 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: 'om-wave-si',
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'SI',
        prenom: 'OM',
        actif: true,
        roleId: role.id,
      },
    });

    const moduleFixture = await Test.createTestingModule({
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

  async function prepaye(opId: string) {
    const create = await request(app.getHttpServer())
      .post('/shop/panier')
      .expect(201);
    const cookie = shopPanierCookie(create);
    await request(app.getHttpServer())
      .patch('/shop/panier/lignes')
      .set('Cookie', cookie)
      .send({ lignes: [{ produitId, quantite: 1 }] });
    return request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: opId,
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        providerPsp: 'ORANGE_MONEY',
        zoneLivraisonId: zoneId,
        adresseLivraison: { ville: 'X' },
        emailInvite: 'om@test.local',
      })
      .expect(201);
  }

  it('webhook Orange Money → PREPARATION', async () => {
    const opId = '66666666-6666-4666-8666-666666666666';
    const cmd = (await prepaye(opId)).body as {
      id: string;
      montantTotal: string;
    };
    const body = {
      event: 'payment.success',
      reference: opId,
      amount: Math.round(Number(cmd.montantTotal)),
      id: 'om-1',
    };
    const payload = JSON.stringify(body);
    const sig = createHmac('sha256', 'om-test-secret')
      .update(payload)
      .digest('hex');
    await request(app.getHttpServer())
      .post('/shop/webhooks/orange-money')
      .set('x-om-signature', sig)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);
    const updated = await env.prisma.commandeWeb.findUnique({
      where: { id: cmd.id },
    });
    expect(updated?.statut).toBe('PREPARATION');
  });

  function signWave(body: object): { payload: string; header: string } {
    const payload = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac('sha256', 'wave-test-secret')
      .update(timestamp + payload)
      .digest('hex');
    return { payload, header: `t=${timestamp},v1=${sig}` };
  }

  async function checkoutWave(opId: string) {
    const create = await request(app.getHttpServer())
      .post('/shop/panier')
      .expect(201);
    const cookie = shopPanierCookie(create);
    await request(app.getHttpServer())
      .patch('/shop/panier/lignes')
      .set('Cookie', cookie)
      .send({ lignes: [{ produitId, quantite: 1 }] });
    const res = await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: opId,
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        providerPsp: 'WAVE',
        zoneLivraisonId: zoneId,
        adresseLivraison: { ville: 'X', ligne1: 'Rue' },
        emailInvite: 'wave@test.local',
      })
      .expect(201);
    return res.body as { id: string; montantTotal: string };
  }

  it('webhook Wave → PREPARATION', async () => {
    const opId = '77777777-7777-4777-8777-777777777777';
    const cmd = await checkoutWave(opId);

    const event = {
      id: 'EV_1',
      type: 'checkout.session.completed',
      data: {
        id: 'cos-wave-1',
        amount: Math.round(Number(cmd.montantTotal)).toString(),
        currency: 'XOF',
        payment_status: 'succeeded',
        checkout_status: 'complete',
        client_reference: opId,
      },
    };
    const { payload, header } = signWave(event);
    await request(app.getHttpServer())
      .post('/shop/webhooks/wave')
      .set('wave-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);
    const updated = await env.prisma.commandeWeb.findUnique({
      where: { id: cmd.id },
    });
    expect(updated?.statut).toBe('PREPARATION');
  });

  it('webhook Wave montant incorrect → commande non payée', async () => {
    const opId = '88888888-8888-4888-8888-888888888888';
    const cmd = await checkoutWave(opId);

    const event = {
      id: 'EV_2',
      type: 'checkout.session.completed',
      data: {
        id: 'cos-wave-2',
        amount: '1',
        currency: 'XOF',
        payment_status: 'succeeded',
        checkout_status: 'complete',
        client_reference: opId,
      },
    };
    const { payload, header } = signWave(event);
    await request(app.getHttpServer())
      .post('/shop/webhooks/wave')
      .set('wave-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);
    const updated = await env.prisma.commandeWeb.findUnique({
      where: { id: cmd.id },
    });
    expect(updated?.statut).toBe('EN_ATTENTE_PAIEMENT');
  });
});
