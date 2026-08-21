// E2E — inventaire physique (sécurité du stock).
// Comptage sans écriture stock, validation par un tiers, 403 auto-validation,
// 403 ajustement libre boutique. Zéro mock : PostgreSQL Testcontainers.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Inventaire physique (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let entrepotId: string;
  let produitId: string;
  let sessionId: string;

  async function login(loginValue: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function creerUtilisateur(
    loginValue: string,
    roleLibelle: string,
    boutiqueId: string | null,
    niveauHabilitation: number,
  ): Promise<string> {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation },
    });
    const utilisateur = await env.prisma.utilisateur.create({
      data: {
        login: loginValue,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: loginValue,
        actif: true,
        roleId: role.id,
        boutiqueId,
      },
    });
    return utilisateur.id;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Inventaire' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Magasin INV', adresse: 'Adr', zoneId: zone.id },
    });
    const entrepot = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal INV',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });
    entrepotId = entrepot.id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Article inventorié',
        prixUnitaire: '1000.00',
        stock: 10,
        coutMoyenPondere: '400.00',
        seuilReappro: 5,
      },
    });
    produitId = produit.id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId, quantite: 10 },
    });

    await creerUtilisateur('caissier-inv', 'CAISSIER_BOUTIQUE', boutique.id, 4);
    await creerUtilisateur(
      'responsable-inv',
      'RESPONSABLE_BOUTIQUE',
      boutique.id,
      3,
    );
    await creerUtilisateur('respsi-inv', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('respcrm-inv', 'RESPONSABLE_CRM', null, 1);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(env.prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    tokens.caissier = await login('caissier-inv');
    tokens.responsable = await login('responsable-inv');
    tokens.respsi = await login('respsi-inv');
    tokens.respcrm = await login('respcrm-inv');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it('refuse (403) RESPONSABLE_CRM', async () => {
    await request(app.getHttpServer())
      .get('/inventaires')
      .set(auth(tokens.respcrm))
      .expect(403);
  });

  it('refuse (403) un ajustement libre au caissier boutique', async () => {
    await request(app.getHttpServer())
      .post('/stocks/ajustements')
      .set(auth(tokens.caissier))
      .send({
        produitId,
        entrepotId,
        quantiteComptee: 99,
      })
      .expect(403);

    const quant = await env.prisma.stockQuant.findUniqueOrThrow({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    expect(quant.quantite).toBe(10);
  });

  it('ouvre un inventaire avec snapshot théorique, sans toucher le stock', async () => {
    const response = await request(app.getHttpServer())
      .post('/inventaires')
      .set(auth(tokens.caissier))
      .send({ entrepotId, motif: 'Inventaire mensuel' })
      .expect(201);

    const body = response.body as {
      id: string;
      statut: string;
      lignes: Array<{
        produitId: string;
        quantiteTheorique: number;
        quantiteComptee: number | null;
      }>;
    };
    sessionId = body.id;
    expect(body.statut).toBe('EN_COURS');
    expect(body.lignes).toHaveLength(1);
    expect(body.lignes[0].quantiteTheorique).toBe(10);
    expect(body.lignes[0].quantiteComptee).toBeNull();

    const quant = await env.prisma.stockQuant.findUniqueOrThrow({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    expect(quant.quantite).toBe(10);
  });

  it('refuse un second inventaire EN_COURS sur le même entrepôt', async () => {
    await request(app.getHttpServer())
      .post('/inventaires')
      .set(auth(tokens.responsable))
      .send({ entrepotId })
      .expect(400);
  });

  it('enregistre un comptage sans écrire StockQuant', async () => {
    await request(app.getHttpServer())
      .patch(`/inventaires/${sessionId}/lignes`)
      .set(auth(tokens.caissier))
      .send({ produitId, quantiteComptee: 8 })
      .expect(200);

    const quant = await env.prisma.stockQuant.findUniqueOrThrow({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    expect(quant.quantite).toBe(10);
  });

  it('refuse (403) l’auto-validation par le compteur', async () => {
    await request(app.getHttpServer())
      .post(`/inventaires/${sessionId}/valider`)
      .set(auth(tokens.caissier))
      .expect(403);
  });

  it('valide par un tiers : AJUSTEMENT + stock = quantité comptée', async () => {
    const response = await request(app.getHttpServer())
      .post(`/inventaires/${sessionId}/valider`)
      .set(auth(tokens.responsable))
      .expect(201);

    const body = response.body as { statut: string };
    expect(body.statut).toBe('VALIDE');

    const quant = await env.prisma.stockQuant.findUniqueOrThrow({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    expect(quant.quantite).toBe(8);

    const produit = await env.prisma.produit.findUniqueOrThrow({
      where: { id: produitId },
    });
    expect(produit.stock).toBe(8);

    const mouvement = await env.prisma.mouvementStock.findFirst({
      where: { produitId, type: 'AJUSTEMENT', entrepotId },
      orderBy: { dateHeure: 'desc' },
    });
    expect(mouvement?.quantite).toBe(-2);
    expect(mouvement?.stockApres).toBe(8);
    expect(mouvement?.reference).toMatch(/^INV-/);

    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'INVENTAIRE_VALIDE', entiteId: sessionId },
    });
    expect(audit).not.toBeNull();
  });
});
