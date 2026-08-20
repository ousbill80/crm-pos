// Tests d'intégration réels (zéro mock) — module Produits (catalogue POS,
// §6.3.2 du cahier des charges). Le paramétrage du catalogue est traité
// comme de l'administration système (même RBAC que zones/boutiques —
// ROLES_ADMIN_STRUCTURE en écriture, ROLES_LECTURE_STRUCTURE en lecture),
// voir apps/api/src/caisses/access-scope.constants.ts. Démarre un vrai
// PostgreSQL via Testcontainers et authentifie chaque profil via le vrai
// endpoint /auth/login.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

interface ProduitDto {
  id: string;
  designation: string;
  prixUnitaire: string;
  stock: number;
  seuilReappro: number | null;
  coutMoyenPondere: string;
}

interface MouvementStockDto {
  id: string;
  produitId: string;
  type: string;
  quantite: number;
  stockApres: number;
}

describe('Produits — catalogue POS §6.3.2 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const tokens: Record<string, string> = {};

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

    await creerUtilisateur('respsi', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('direction', 'DIRECTION_GENERALE', null, 0);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('caissier-boutique', 'CAISSIER_BOUTIQUE', null, 4);
    await creerUtilisateur('respcrm', 'RESPONSABLE_CRM', null, 1);

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

    tokens.respsi = await login('respsi');
    tokens.direction = await login('direction');
    tokens.daf = await login('daf');
    tokens.caissierBoutique = await login('caissier-boutique');
    tokens.respcrm = await login('respcrm');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  describe('Création (ROLES_ADMIN_STRUCTURE uniquement)', () => {
    it('refuse (403) la création par un rôle non admin (CAISSIER_BOUTIQUE)', () => {
      return request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.caissierBoutique))
        .send({ designation: 'Coque téléphone', prixUnitaire: 2500, stock: 10 })
        .expect(403);
    });

    it('refuse (403) la création par DAF (lecture structure, pas admin)', () => {
      return request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.daf))
        .send({ designation: 'Coque téléphone', prixUnitaire: 2500, stock: 10 })
        .expect(403);
    });

    it("autorise RESPONSABLE_SI à créer un produit et journalise une entrée d'audit", async () => {
      const response = await request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.respsi))
        .send({ designation: 'Coque téléphone', prixUnitaire: 2500, stock: 10 })
        .expect(201);

      const body = response.body as ProduitDto;
      expect(body.id).toEqual(expect.any(String));
      expect(Number(body.prixUnitaire)).toBe(2500);
      expect(body.stock).toBe(10);

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: { entite: 'Produit', entiteId: body.id },
      });
      expect(entreeAudit).not.toBeNull();
      expect(entreeAudit?.action).toBe('PRODUIT_CREATED');
    });

    it('autorise DIRECTION_GENERALE à créer un produit', async () => {
      await request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.direction))
        .send({ designation: 'Chargeur USB-C', prixUnitaire: 5000, stock: 20 })
        .expect(201);
    });

    it('refuse (400) une désignation vide', () => {
      return request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.respsi))
        .send({ designation: '', prixUnitaire: 2500, stock: 10 })
        .expect(400);
    });

    it('refuse (400) un prix négatif ou nul', () => {
      return request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.respsi))
        .send({ designation: 'Article invalide', prixUnitaire: -1, stock: 10 })
        .expect(400);
    });
  });

  describe('Lecture (ROLES_LECTURE_STRUCTURE)', () => {
    let produitId: string;

    beforeAll(async () => {
      const produit = await env.prisma.produit.create({
        data: {
          designation: 'Écouteurs filaires',
          prixUnitaire: '1500.00',
          stock: 30,
        },
      });
      produitId = produit.id;
    });

    it('autorise un CAISSIER_BOUTIQUE à lister les produits', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits')
        .set(auth(tokens.caissierBoutique))
        .expect(200);
      const body = response.body as ProduitDto[];
      expect(body.map((p) => p.id)).toContain(produitId);
    });

    it('autorise un CAISSIER_BOUTIQUE à consulter le détail d’un produit', () => {
      return request(app.getHttpServer())
        .get(`/produits/${produitId}`)
        .set(auth(tokens.caissierBoutique))
        .expect(200);
    });

    it('refuse (403) la lecture par RESPONSABLE_CRM (hors périmètre structure)', () => {
      return request(app.getHttpServer())
        .get('/produits')
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('renvoie 404 pour un produit inexistant', () => {
      return request(app.getHttpServer())
        .get('/produits/00000000-0000-0000-0000-000000000000')
        .set(auth(tokens.daf))
        .expect(404);
    });
  });

  describe('Mise à jour (ROLES_ADMIN_STRUCTURE uniquement)', () => {
    let produitId: string;

    beforeAll(async () => {
      const produit = await env.prisma.produit.create({
        data: {
          designation: 'Support téléphone',
          prixUnitaire: '3000.00',
          stock: 5,
        },
      });
      produitId = produit.id;
    });

    it('refuse (403) la mise à jour par un rôle non admin', () => {
      return request(app.getHttpServer())
        .patch(`/produits/${produitId}`)
        .set(auth(tokens.caissierBoutique))
        .send({ stock: 12 })
        .expect(403);
    });

    it("autorise RESPONSABLE_SI à mettre à jour le stock et journalise une entrée d'audit", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/produits/${produitId}`)
        .set(auth(tokens.respsi))
        .send({ stock: 12, prixUnitaire: 3200 })
        .expect(200);

      const body = response.body as ProduitDto;
      expect(body.stock).toBe(12);
      expect(Number(body.prixUnitaire)).toBe(3200);

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'Produit',
          entiteId: produitId,
          action: 'PRODUIT_UPDATED',
        },
      });
      expect(entreeAudit).not.toBeNull();
    });

    it('autorise la mise à jour du seuil de réapprovisionnement', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/produits/${produitId}`)
        .set(auth(tokens.respsi))
        .send({ seuilReappro: 3 })
        .expect(200);

      const body = response.body as ProduitDto;
      expect(body.seuilReappro).toBe(3);
    });
  });

  describe('Mouvements de stock (ROLES_LECTURE_STRUCTURE)', () => {
    let produitId: string;

    beforeAll(async () => {
      const produit = await env.prisma.produit.create({
        data: {
          designation: 'Étui protection',
          prixUnitaire: '2000.00',
          stock: 8,
        },
      });
      produitId = produit.id;

      await env.prisma.mouvementStock.create({
        data: {
          produitId,
          type: 'RECEPTION',
          quantite: 8,
          stockApres: 8,
          utilisateurId: (
            await env.prisma.utilisateur.findUniqueOrThrow({
              where: { login: 'respsi' },
            })
          ).id,
        },
      });
    });

    it('autorise un CAISSIER_BOUTIQUE à consulter l’historique des mouvements', async () => {
      const response = await request(app.getHttpServer())
        .get(`/produits/${produitId}/mouvements`)
        .set(auth(tokens.caissierBoutique))
        .expect(200);

      const body = response.body as MouvementStockDto[];
      expect(body.length).toBe(1);
      expect(body[0].type).toBe('RECEPTION');
      expect(body[0].quantite).toBe(8);
      expect(body[0].stockApres).toBe(8);
    });

    it('refuse (403) la lecture des mouvements par RESPONSABLE_CRM', () => {
      return request(app.getHttpServer())
        .get(`/produits/${produitId}/mouvements`)
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('renvoie 404 pour un produit inexistant', () => {
      return request(app.getHttpServer())
        .get('/produits/00000000-0000-0000-0000-000000000000/mouvements')
        .set(auth(tokens.daf))
        .expect(404);
    });
  });

  describe('Authentification obligatoire', () => {
    it('refuse (401) toute requête sans JWT', () => {
      return request(app.getHttpServer()).get('/produits').expect(401);
    });
  });
});
