// Tests d'intégration réels (zéro mock) — module Fournisseurs & réception de
// stock (extension au socle MCD §6.5, portée validée avec l'utilisateur :
// fiche fournisseur simple + réception de stock, pas de bon de commande ni
// de facturation fournisseur). RBAC identique au catalogue Produit
// (ROLES_ADMIN_STRUCTURE en écriture, ROLES_LECTURE_STRUCTURE en lecture),
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

interface FournisseurDto {
  id: string;
  nom: string;
  contact: string | null;
}

interface ReceptionStockDto {
  id: string;
  produitId: string;
  fournisseurId: string;
  quantite: number;
  prixAchat: string;
  utilisateurId: string;
}

describe('Fournisseurs & réception de stock (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const tokens: Record<string, string> = {};
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

    await creerUtilisateur('respsi-fourn', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('direction-fourn', 'DIRECTION_GENERALE', null, 0);
    await creerUtilisateur('daf-fourn', 'DAF', null, 1);
    await creerUtilisateur('caissier-fourn', 'CAISSIER_BOUTIQUE', null, 4);
    await creerUtilisateur('respcrm-fourn', 'RESPONSABLE_CRM', null, 1);

    const produit = await env.prisma.produit.create({
      data: { designation: 'Câble USB-C', prixUnitaire: '2000.00', stock: 5 },
    });
    produitId = produit.id;

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

    tokens.respsi = await login('respsi-fourn');
    tokens.direction = await login('direction-fourn');
    tokens.daf = await login('daf-fourn');
    tokens.caissierBoutique = await login('caissier-fourn');
    tokens.respcrm = await login('respcrm-fourn');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  describe('Création fournisseur (ROLES_ADMIN_STRUCTURE uniquement)', () => {
    it('refuse (403) la création par un rôle non admin (CAISSIER_BOUTIQUE)', () => {
      return request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.caissierBoutique))
        .send({ nom: 'Grossiste Accessoires SARL' })
        .expect(403);
    });

    it('refuse (403) la création par DAF (lecture structure, pas admin)', () => {
      return request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.daf))
        .send({ nom: 'Grossiste Accessoires SARL' })
        .expect(403);
    });

    it("autorise RESPONSABLE_SI à créer un fournisseur et journalise une entrée d'audit", async () => {
      const response = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({
          nom: 'Grossiste Accessoires SARL',
          contact: '+225 07 00 00 00 00',
        })
        .expect(201);

      const body = response.body as FournisseurDto;
      expect(body.id).toEqual(expect.any(String));
      expect(body.nom).toBe('Grossiste Accessoires SARL');

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: { entite: 'Fournisseur', entiteId: body.id },
      });
      expect(entreeAudit).not.toBeNull();
      expect(entreeAudit?.action).toBe('FOURNISSEUR_CREATED');
    });

    it('autorise DIRECTION_GENERALE à créer un fournisseur', async () => {
      await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.direction))
        .send({ nom: 'Import Téléphonie CI' })
        .expect(201);
    });

    it('refuse (400) un nom vide', () => {
      return request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: '' })
        .expect(400);
    });
  });

  describe('Lecture fournisseurs (ROLES_LECTURE_STRUCTURE)', () => {
    let fournisseurId: string;

    beforeAll(async () => {
      const fournisseur = await env.prisma.fournisseur.create({
        data: { nom: 'Distributeur Lecture Test' },
      });
      fournisseurId = fournisseur.id;
    });

    it('autorise un CAISSIER_BOUTIQUE à lister les fournisseurs', async () => {
      const response = await request(app.getHttpServer())
        .get('/fournisseurs')
        .set(auth(tokens.caissierBoutique))
        .expect(200);
      const body = response.body as FournisseurDto[];
      expect(body.map((f) => f.id)).toContain(fournisseurId);
    });

    it('refuse (403) la lecture par RESPONSABLE_CRM (hors périmètre structure)', () => {
      return request(app.getHttpServer())
        .get('/fournisseurs')
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('renvoie 404 pour un fournisseur inexistant', () => {
      return request(app.getHttpServer())
        .get('/fournisseurs/00000000-0000-0000-0000-000000000000')
        .set(auth(tokens.daf))
        .expect(404);
    });
  });

  describe('Réception de stock (ROLES_ADMIN_STRUCTURE uniquement)', () => {
    let fournisseurId: string;

    beforeAll(async () => {
      const fournisseur = await env.prisma.fournisseur.create({
        data: { nom: 'Fournisseur Réception Test' },
      });
      fournisseurId = fournisseur.id;
    });

    it('refuse (403) la réception par un rôle non admin (CAISSIER_BOUTIQUE)', () => {
      return request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.caissierBoutique))
        .send({ produitId, quantite: 10, prixAchat: 1500 })
        .expect(403);
    });

    it("autorise RESPONSABLE_SI à enregistrer une réception, incrémente le stock et journalise l'audit", async () => {
      const avant = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });

      const response = await request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 15, prixAchat: 1500 })
        .expect(201);

      const body = response.body as ReceptionStockDto;
      expect(body.quantite).toBe(15);
      expect(body.produitId).toBe(produitId);
      expect(body.fournisseurId).toBe(fournisseurId);
      expect(Number(body.prixAchat)).toBe(1500);

      const apres = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      expect(apres.stock).toBe(avant.stock + 15);

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: { entite: 'ReceptionStock', entiteId: body.id },
      });
      expect(entreeAudit).not.toBeNull();
      expect(entreeAudit?.action).toBe('RECEPTION_STOCK_CREATED');

      const mouvement = await env.prisma.mouvementStock.findFirst({
        where: { reference: body.id },
      });
      expect(mouvement).not.toBeNull();
      expect(mouvement?.type).toBe('RECEPTION');
      expect(mouvement?.quantite).toBe(15);
      expect(mouvement?.stockApres).toBe(avant.stock + 15);
    });

    it('refuse (400) une quantité négative ou nulle', () => {
      return request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 0, prixAchat: 1500 })
        .expect(400);
    });

    it('refuse (400) un prixAchat absent', () => {
      return request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 5 })
        .expect(400);
    });

    it('refuse (404) une réception sur un fournisseur inexistant', () => {
      return request(app.getHttpServer())
        .post('/fournisseurs/00000000-0000-0000-0000-000000000000/receptions')
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 5, prixAchat: 1500 })
        .expect(404);
    });

    it('refuse (404) une réception sur un produit inexistant', () => {
      return request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({
          produitId: '00000000-0000-0000-0000-000000000000',
          quantite: 5,
          prixAchat: 1500,
        })
        .expect(404);
    });
  });

  describe('Coût moyen pondéré (CMP)', () => {
    let fournisseurId: string;
    let produitCmpId: string;

    beforeAll(async () => {
      const fournisseur = await env.prisma.fournisseur.create({
        data: { nom: 'Fournisseur CMP Test' },
      });
      fournisseurId = fournisseur.id;

      const produit = await env.prisma.produit.create({
        data: {
          designation: 'Produit CMP Test',
          prixUnitaire: '5000.00',
          stock: 0,
        },
      });
      produitCmpId = produit.id;
    });

    it('recalcule le CMP à chaque réception, pondéré par la quantité', async () => {
      // 10 unités à 1000 -> CMP = 1000
      await request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId: produitCmpId, quantite: 10, prixAchat: 1000 })
        .expect(201);

      let produit = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitCmpId },
      });
      expect(produit.coutMoyenPondere.toNumber()).toBeCloseTo(1000, 2);

      // +10 unités à 2000 -> CMP = (10*1000 + 10*2000) / 20 = 1500
      await request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId: produitCmpId, quantite: 10, prixAchat: 2000 })
        .expect(201);

      produit = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitCmpId },
      });
      expect(produit.coutMoyenPondere.toNumber()).toBeCloseTo(1500, 2);
      expect(produit.stock).toBe(20);
    });
  });

  describe('Authentification obligatoire', () => {
    it('refuse (401) toute requête sans JWT', () => {
      return request(app.getHttpServer()).get('/fournisseurs').expect(401);
    });
  });
});
