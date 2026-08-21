// E2E — module Entreprise + Stocks multi-emplacement (fondation POS).
// Couvre création entrepôt, réception → quant, ajustement, transfert A→B,
// RBAC hors périmètre (403). Zéro mock : PostgreSQL Testcontainers.
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

describe('Entreprise + Stocks multi-emplacement (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const tokens: Record<string, string> = {};
  let zoneId: string;
  let boutiqueAId: string;
  let boutiqueBId: string;
  let entrepotAId: string;
  let entrepotBId: string;
  let produitId: string;

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
      data: { nomZone: 'Zone Entreprise Stocks' },
    });
    zoneId = zone.id;

    const boutiqueA = await env.prisma.boutique.create({
      data: { nom: 'Magasin A', adresse: 'Adr A', zoneId },
    });
    boutiqueAId = boutiqueA.id;
    const boutiqueB = await env.prisma.boutique.create({
      data: { nom: 'Magasin B', adresse: 'Adr B', zoneId },
    });
    boutiqueBId = boutiqueB.id;

    const entrepotA = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal A',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutiqueAId,
      },
    });
    entrepotAId = entrepotA.id;
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
        designation: 'Article multi-entrepôt',
        prixUnitaire: '1000.00',
        stock: 0,
      },
    });
    produitId = produit.id;

    await creerUtilisateur('respsi-es', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur(
      'caissier-a-es',
      'CAISSIER_BOUTIQUE',
      boutiqueAId,
      4,
    );
    await creerUtilisateur(
      'caissier-b-es',
      'CAISSIER_BOUTIQUE',
      boutiqueBId,
      4,
    );
    await creerUtilisateur('respcrm-es', 'RESPONSABLE_CRM', null, 1);

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

    tokens.respsi = await login('respsi-es');
    tokens.caissierA = await login('caissier-a-es');
    tokens.caissierB = await login('caissier-b-es');
    tokens.respcrm = await login('respcrm-es');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  describe('Entreprise', () => {
    it('GET /entreprise crée ou retourne la fiche société', async () => {
      const response = await request(app.getHttpServer())
        .get('/entreprise')
        .set(auth(tokens.respsi))
        .expect(200);
      const body = response.body as { raisonSociale: string; devise: string };
      expect(body.raisonSociale).toBeTruthy();
      expect(body.devise).toBe('XOF');
    });

    it('refuse (403) PATCH entreprise hors admin structure', async () => {
      await request(app.getHttpServer())
        .patch('/entreprise')
        .set(auth(tokens.caissierA))
        .send({ raisonSociale: 'Hacker SARL' })
        .expect(403);
    });

    it('autorise RESPONSABLE_SI à PATCH la société', async () => {
      const response = await request(app.getHttpServer())
        .patch('/entreprise')
        .set(auth(tokens.respsi))
        .send({ raisonSociale: 'CaissePOS Demo', telephone: '+221770000000' })
        .expect(200);
      const body = response.body as {
        raisonSociale: string;
        telephone: string;
      };
      expect(body.raisonSociale).toBe('CaissePOS Demo');
      expect(body.telephone).toBe('+221770000000');
    });

    it('enregistre le logo sans le dump base64 dans l’audit', async () => {
      const dataUrl =
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
      const response = await request(app.getHttpServer())
        .patch('/entreprise')
        .set(auth(tokens.respsi))
        .send({ logoUrl: dataUrl })
        .expect(200);
      expect((response.body as { logoUrl: string }).logoUrl).toBe(dataUrl);
      const audit = await env.prisma.journalAudit.findFirst({
        where: { action: 'ENTREPRISE_UPDATED' },
        orderBy: { dateHeure: 'desc' },
      });
      expect(audit?.details).toContain('[image]');
      expect(audit?.details).not.toContain('/9j/');
    });

    it('autorise RESPONSABLE_SI à configurer delaiVersementHeures (§6.3.5)', async () => {
      const response = await request(app.getHttpServer())
        .patch('/entreprise')
        .set(auth(tokens.respsi))
        .send({ delaiVersementHeures: 12 })
        .expect(200);
      const body = response.body as { delaiVersementHeures: number };
      expect(body.delaiVersementHeures).toBe(12);
    });

    it('refuse delaiVersementHeures < 1', async () => {
      await request(app.getHttpServer())
        .patch('/entreprise')
        .set(auth(tokens.respsi))
        .send({ delaiVersementHeures: 0 })
        .expect(400);
    });
  });

  describe('Entrepôts', () => {
    it('crée un entrepôt secondaire via API', async () => {
      const response = await request(app.getHttpServer())
        .post('/entrepots')
        .set(auth(tokens.respsi))
        .send({
          nom: 'Réserve A',
          code: 'RESERVE',
          boutiqueId: boutiqueAId,
          type: 'SECONDAIRE',
        })
        .expect(201);
      const body = response.body as { id: string; code: string };
      expect(body.code).toBe('RESERVE');
    });

    it('refuse (403) lecture entrepôts pour RESPONSABLE_CRM', async () => {
      await request(app.getHttpServer())
        .get('/entrepots')
        .set(auth(tokens.respcrm))
        .expect(403);
    });
  });

  describe('Stocks — ajustement, transfert, périmètre', () => {
    it('ajuste le stock sur entrepôt A et écrit AJUSTEMENT', async () => {
      const response = await request(app.getHttpServer())
        .post('/stocks/ajustements')
        .set(auth(tokens.respsi))
        .send({
          produitId,
          entrepotId: entrepotAId,
          quantiteComptee: 50,
        })
        .expect(201);

      const body = response.body as { type: string; stockApres: number };
      expect(body.type).toBe('AJUSTEMENT');
      expect(body.stockApres).toBe(50);

      const quant = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: {
            produitId,
            entrepotId: entrepotAId,
          },
        },
      });
      expect(quant?.quantite).toBe(50);

      const produit = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      expect(produit.stock).toBe(50);
    });

    it('transfère A → B et écrit TRANSFERT_OUT / TRANSFERT_IN', async () => {
      const response = await request(app.getHttpServer())
        .post('/stocks/transferts')
        .set(auth(tokens.respsi))
        .send({
          produitId,
          entrepotSourceId: entrepotAId,
          entrepotDestId: entrepotBId,
          quantite: 20,
        })
        .expect(201);

      const body = response.body as {
        sortie: { type: string; stockApres: number };
        entree: { type: string; stockApres: number };
      };
      expect(body.sortie.type).toBe('TRANSFERT_OUT');
      expect(body.sortie.stockApres).toBe(30);
      expect(body.entree.type).toBe('TRANSFERT_IN');
      expect(body.entree.stockApres).toBe(20);

      const produit = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      expect(produit.stock).toBe(50);
    });

    it('liste les quants filtrés par entrepôt', async () => {
      const response = await request(app.getHttpServer())
        .get(`/stocks?entrepotId=${entrepotBId}`)
        .set(auth(tokens.respsi))
        .expect(200);
      const body = response.body as { produitId: string; quantite: number }[];
      expect(
        body.some((q) => q.produitId === produitId && q.quantite === 20),
      ).toBe(true);
    });

    it('refuse (403) caissier A hors périmètre sur stocks entrepôt B', async () => {
      await request(app.getHttpServer())
        .get(`/stocks?entrepotId=${entrepotBId}`)
        .set(auth(tokens.caissierA))
        .expect(403);
    });

    it('autorise caissier A à lire stocks de son entrepôt', async () => {
      const response = await request(app.getHttpServer())
        .get(`/stocks?entrepotId=${entrepotAId}`)
        .set(auth(tokens.caissierA))
        .expect(200);
      const body = response.body as { quantite: number }[];
      expect(body[0]?.quantite).toBe(30);
    });
  });
});
