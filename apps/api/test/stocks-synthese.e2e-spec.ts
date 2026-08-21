// E2E — synthèse stock intelligente (KPI, valorisation CMP, couverture,
// suggestions de transfert). RBAC périmètre. Zéro mock : PostgreSQL Testcontainers.
// Couvre l'extension « stock avancé » au socle MCD §6.5.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import type { StockSyntheseDto } from '../src/stocks/stock-synthese';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Stocks synthèse (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const tokens: Record<string, string> = {};
  let boutiqueAId: string;
  let boutiqueBId: string;
  let entrepotSourceId: string;
  let entrepotDestId: string;
  let entrepotBId: string;
  let produitId: string;
  let userSiId: string;
  let mouvementVenteId: string;

  async function login(loginValue: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    const body = response.body as { accessToken: string };
    return body.accessToken;
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
      data: { nomZone: 'Zone Synthèse Stocks' },
    });

    const boutiqueA = await env.prisma.boutique.create({
      data: { nom: 'Magasin Synthèse A', adresse: 'Adr A', zoneId: zone.id },
    });
    boutiqueAId = boutiqueA.id;
    const boutiqueB = await env.prisma.boutique.create({
      data: { nom: 'Magasin Synthèse B', adresse: 'Adr B', zoneId: zone.id },
    });
    boutiqueBId = boutiqueB.id;

    const source = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal A',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutiqueAId,
      },
    });
    entrepotSourceId = source.id;
    const dest = await env.prisma.entrepot.create({
      data: {
        nom: 'Réserve A',
        code: 'RESERVE',
        type: 'SECONDAIRE',
        boutiqueId: boutiqueAId,
      },
    });
    entrepotDestId = dest.id;
    const entrepotB = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutiqueBId,
      },
    });
    entrepotBId = entrepotB.id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Coque synthèse',
        prixUnitaire: '2500.00',
        stock: 20,
        seuilReappro: 5,
        coutMoyenPondere: '100.50',
      },
    });
    produitId = produit.id;

    await env.prisma.stockQuant.createMany({
      data: [
        { produitId, entrepotId: entrepotSourceId, quantite: 20 },
        { produitId, entrepotId: entrepotDestId, quantite: 0 },
      ],
    });

    const inactif = await env.prisma.produit.create({
      data: {
        designation: 'Ancien modèle inactif',
        prixUnitaire: '500.00',
        stock: 0,
        seuilReappro: 5,
        coutMoyenPondere: '100.00',
        actif: false,
      },
    });
    await env.prisma.stockQuant.create({
      data: {
        produitId: inactif.id,
        entrepotId: entrepotDestId,
        quantite: 0,
      },
    });

    userSiId = await creerUtilisateur('respsi-syn', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur(
      'caissier-a-syn',
      'CAISSIER_BOUTIQUE',
      boutiqueAId,
      4,
    );
    await creerUtilisateur(
      'caissier-b-syn',
      'CAISSIER_BOUTIQUE',
      boutiqueBId,
      4,
    );
    await creerUtilisateur('respcrm-syn', 'RESPONSABLE_CRM', null, 1);

    const vente = await env.prisma.mouvementStock.create({
      data: {
        produitId,
        entrepotId: entrepotSourceId,
        type: 'VENTE',
        quantite: -14,
        stockApres: 20,
        utilisateurId: userSiId,
        dateHeure: new Date(),
      },
    });
    mouvementVenteId = vente.id;

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

    tokens.respsi = await login('respsi-syn');
    tokens.caissierA = await login('caissier-a-syn');
    tokens.caissierB = await login('caissier-b-syn');
    tokens.respcrm = await login('respcrm-syn');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it('refuse (403) RESPONSABLE_CRM sur GET /stocks/synthese', async () => {
    await request(app.getHttpServer())
      .get('/stocks/synthese')
      .set(auth(tokens.respcrm))
      .expect(403);
  });

  it('refuse (403) caissier A hors périmètre (entrepôt boutique B)', async () => {
    await request(app.getHttpServer())
      .get(`/stocks/synthese?entrepotId=${entrepotBId}`)
      .set(auth(tokens.caissierA))
      .expect(403);
  });

  it('calcule KPI, valorisation CMP, couverture 14 j et suggestion de transfert', async () => {
    const response = await request(app.getHttpServer())
      .get('/stocks/synthese')
      .set(auth(tokens.respsi))
      .expect(200);

    const body = response.body as StockSyntheseDto;
    expect(body.fenetreVentesJours).toBe(14);
    expect(body.sante).toBe('CRITIQUE');
    expect(body.kpis.skuDistincts).toBe(1);
    expect(body.kpis.unitesTotales).toBe(20);
    expect(body.kpis.valeurStock).toBe('2010.00');
    expect(body.kpis.ruptures).toBe(1);
    expect(body.kpis.sousSeuil).toBe(0);
    expect(body.kpis.couvertureJoursMediane).toBe(20);

    const ligne = body.lignes.find((l) => l.produitId === produitId);
    expect(ligne?.statut).toBe('RUPTURE');
    expect(ligne?.actif).toBe(true);
    expect(ligne?.ventesUnites14j).toBe(14);
    expect(ligne?.couvertureJours).toBe(20);
    expect(ligne?.valeur).toBe('2010.00');

    expect(body.lignes.some((l) => l.actif === false)).toBe(true);
    expect(body.suggestionsReappro).toEqual([]);

    expect(body.suggestionsTransfert).toHaveLength(1);
    const suggestion = body.suggestionsTransfert[0];
    expect(suggestion.produitId).toBe(produitId);
    expect(suggestion.entrepotSourceId).toBe(entrepotSourceId);
    expect(suggestion.entrepotDestId).toBe(entrepotDestId);
    expect(suggestion.quantiteSuggeree).toBe(5);
    expect(suggestion.destStatut).toBe('RUPTURE');
  });

  it('restreint la synthèse du caissier A à sa boutique (pas l’entrepôt B)', async () => {
    const response = await request(app.getHttpServer())
      .get('/stocks/synthese')
      .set(auth(tokens.caissierA))
      .expect(200);
    const body = response.body as StockSyntheseDto;
    expect(body.parEntrepot.every((e) => e.boutiqueId === boutiqueAId)).toBe(
      true,
    );
    expect(body.parEntrepot.some((e) => e.entrepotId === entrepotBId)).toBe(
      false,
    );
  });

  describe('GET /stocks/mouvements/:id', () => {
    it('refuse (403) RESPONSABLE_CRM', async () => {
      await request(app.getHttpServer())
        .get(`/stocks/mouvements/${mouvementVenteId}`)
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('refuse (403) caissier hors périmètre boutique', async () => {
      await request(app.getHttpServer())
        .get(`/stocks/mouvements/${mouvementVenteId}`)
        .set(auth(tokens.caissierB))
        .expect(403);
    });

    it('retourne le mouvement pour un rôle structure du périmètre', async () => {
      const response = await request(app.getHttpServer())
        .get(`/stocks/mouvements/${mouvementVenteId}`)
        .set(auth(tokens.caissierA))
        .expect(200);
      const body = response.body as {
        id: string;
        type: string;
        produitId: string;
      };
      expect(body.id).toBe(mouvementVenteId);
      expect(body.type).toBe('VENTE');
      expect(body.produitId).toBe(produitId);
    });

    it('répond 404 pour un id inconnu', async () => {
      await request(app.getHttpServer())
        .get('/stocks/mouvements/00000000-0000-0000-0000-000000000000')
        .set(auth(tokens.respsi))
        .expect(404);
    });
  });
});
