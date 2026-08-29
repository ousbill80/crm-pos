// Checkout shop — PREPAYE, différé, rupture stock (PLAN-E-COMMERCE Lot 2).
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

process.env.JWT_SECRET ??= 'test-secret-shop-e2e';

jest.setTimeout(120_000);

describe('Shop checkout (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let produitId: string;
  let entrepotId: string;
  let boutiqueRetraitId: string;
  let zoneId: string;

  beforeAll(async () => {
    await env.start();

    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'Shop E2E', adresse: 'Abidjan' },
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
    const zoneLiv = await env.prisma.zoneLivraison.create({
      data: {
        libelle: 'Abidjan',
        tarifForfait: 1000,
        actif: true,
      },
    });
    zoneId = zoneLiv.id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Coque test',
        prixUnitaire: 5000,
        prixWeb: 5500,
        visibleWeb: true,
        slug: 'coque-test',
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
        login: 'shop-audit-si',
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'SI',
        prenom: 'Shop',
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

  function extractCookie(res: request.Response): string {
    return shopPanierCookie(res);
  }

  async function panierAvecLigne(quantite: number) {
    const create = await request(app.getHttpServer())
      .post('/shop/panier')
      .expect(201);
    const cookie = extractCookie(create);
    await request(app.getHttpServer())
      .patch('/shop/panier/lignes')
      .set('Cookie', cookie)
      .send({ lignes: [{ produitId, quantite }] })
      .expect(200);
    return cookie;
  }

  it('checkout PREPAYE → EN_ATTENTE_PAIEMENT', async () => {
    const cookie = await panierAvecLigne(1);
    const res = await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: '11111111-1111-4111-8111-111111111111',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        providerPsp: 'PAYSTACK',
        zoneLivraisonId: zoneId,
        adresseLivraison: { ville: 'Abidjan', ligne1: 'Rue 1' },
        emailInvite: 'guest@test.local',
      })
      .expect(201);

    const checkout = body<{
      id: string;
      statut: string;
      montantTotal: string | number;
    }>(res);
    expect(checkout.statut).toBe('EN_ATTENTE_PAIEMENT');
    expect(Number(checkout.montantTotal)).toBeGreaterThan(5500);
    const lignes = await env.prisma.ligneCommandeWeb.findMany({
      where: { commandeWebId: checkout.id },
    });
    expect(lignes[0].prixUnitaireHt.toString()).toBe('5500');
  });

  it('expose les modes de règlement publics (espèces livraison / retrait)', async () => {
    const res = await request(app.getHttpServer())
      .get('/shop/reglements')
      .expect(200);
    const modes = body<{
      paiementLivraisonActif: boolean;
      paiementRetraitActif: boolean;
    }>(res);
    expect(modes.paiementLivraisonActif).toBe(true);
    expect(modes.paiementRetraitActif).toBe(true);
  });

  it('checkout différé retrait → PREPARATION', async () => {
    const cookie = await panierAvecLigne(1);
    const res = await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: '22222222-2222-4222-8222-222222222222',
        modeFulfillment: 'RETRAIT_BOUTIQUE',
        modeReglement: 'PAIEMENT_RETRAIT',
        boutiqueRetraitId,
        emailInvite: 'guest2@test.local',
      })
      .expect(201);

    expect(body<{ statut: string }>(res).statut).toBe('PREPARATION');
  });

  it('checkout paiement à la livraison → PREPARATION (pas EN_ATTENTE_PAIEMENT)', async () => {
    const cookie = await panierAvecLigne(1);
    const res = await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: '44444444-4444-4444-8444-444444444444',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PAIEMENT_LIVRAISON',
        zoneLivraisonId: zoneId,
        adresseLivraison: { ville: 'Abidjan', ligne1: 'Cocody' },
        emailInvite: 'guest-cod@test.local',
        telephoneInvite: '+2250700000000',
      })
      .expect(201);

    const checkout = body<{ statut: string; modeReglement: string }>(res);
    expect(checkout.statut).toBe('PREPARATION');
    expect(checkout.modeReglement).toBe('PAIEMENT_LIVRAISON');
  });

  it('rupture stock → 400', async () => {
    const cookie = await panierAvecLigne(100);
    await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: '33333333-3333-4333-8333-333333333333',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        providerPsp: 'PAYSTACK',
        zoneLivraisonId: zoneId,
        adresseLivraison: { ville: 'Abidjan' },
      })
      .expect(400);
  });
});
