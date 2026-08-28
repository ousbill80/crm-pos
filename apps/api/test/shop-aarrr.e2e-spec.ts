import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body } from './utils/http';

jest.setTimeout(120_000);

describe('Shop AARRR (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let chaudId: string;
  let froidId: string;

  beforeAll(async () => {
    await env.start();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'AARRR SA', adresse: 'Abidjan' },
    });
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z A' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'B A', adresse: 'Addr', zoneId: zone.id },
    });
    const entrepot = await env.prisma.entrepot.create({
      data: {
        nom: 'Web A',
        code: 'WEBA',
        boutiqueId: boutique.id,
      },
    });
    await env.prisma.parametreShop.create({
      data: {
        societeId: societe.id,
        shopActif: true,
        entrepotWebDefautId: entrepot.id,
        modeAffichagePrix: 'TTC',
        tauxTvaDefaut: 18,
        fallbackPrixMagasin: false,
      },
    });
    chaudId = (
      await env.prisma.produit.create({
        data: {
          designation: 'Phare LED tendance',
          prixUnitaire: 10000,
          prixWeb: 10000,
          visibleWeb: true,
          slug: 'phare-led-tendance',
          categorie: 'Éclairage',
          tauxTva: 18,
          stock: 4,
        },
      })
    ).id;
    froidId = (
      await env.prisma.produit.create({
        data: {
          designation: 'Tapis coffre discret',
          prixUnitaire: 3000,
          prixWeb: 3000,
          visibleWeb: true,
          slug: 'tapis-coffre-discret',
          categorie: 'Accessoires',
          tauxTva: 18,
          stock: 20,
        },
      })
    ).id;
    await env.prisma.commandeWeb.create({
      data: {
        clientOperationId: randomUUID(),
        statut: 'PAYEE',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        entrepotId: entrepot.id,
        montantTotal: 11800,
        payeeAt: new Date(),
        lignes: {
          create: {
            produitId: chaudId,
            quantite: 8,
            prixUnitaireHt: 10000,
            tauxTva: 18,
            montantTvaLigne: 1800,
            prixUnitaireTtc: 11800,
            designationSnapshot: 'Phare LED tendance',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse une action serveur depuis le client public', async () => {
    await request(app.getHttpServer())
      .post('/shop/evenements')
      .send({
        sessionId: 'sessiontest01',
        action: 'PURCHASE',
      })
      .expect(400);
  });

  it('journalise VIEW_HOME en append-only (Acquisition)', async () => {
    await request(app.getHttpServer())
      .post('/shop/evenements')
      .send({
        sessionId: 'sessiontest01',
        action: 'VIEW_HOME',
        utmSource: 'whatsapp',
      })
      .expect(201);
    const rows = await env.prisma.shopFunnelEvent.findMany({
      where: { sessionId: 'sessiontest01' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.etape).toBe('ACQUISITION');
    await expect(
      env.prisma.shopFunnelEvent.update({
        where: { id: rows[0]!.id },
        data: { action: 'SEARCH' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('classe le feed sur les ventes réelles, pas l’ordre alphabétique', async () => {
    const res = await request(app.getHttpServer())
      .get('/shop/decouverte?sessionId=sessiontest01')
      .expect(200);
    const feed = body<{
      flash: { id: string; unitesVendues30j: number }[];
      tendances: { id: string }[];
      pourVous: { id: string }[];
    }>(res);
    expect(feed.flash[0]?.id).toBe(chaudId);
    expect(feed.tendances[0]?.id).toBe(chaudId);
    expect(feed.pourVous.some((p) => p.id === froidId || p.id === chaudId)).toBe(
      true,
    );
    expect(feed.flash[0]?.unitesVendues30j).toBe(8);
  });
});
