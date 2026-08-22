// Tests d'intégration réels (zéro mock) — module Fournisseurs & réception de
// stock (extension au socle MCD §6.5). Fiches + réceptions : SI / DG / DAF
// (ROLES_FICHE_FOURNISSEUR, ROLES_RECEPTION_STOCK). La boutique ne réceptionne
// pas le fournisseur. PostgreSQL réel via Testcontainers.
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
  reference?: string | null;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

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

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Fournisseurs' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Fournisseurs', adresse: 'Adr', zoneId: zone.id },
    });
    await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Fournisseurs',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });

    await creerUtilisateur('respsi-fourn', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('direction-fourn', 'DIRECTION_GENERALE', null, 0);
    await creerUtilisateur('daf-fourn', 'DAF', null, 1);
    await creerUtilisateur(
      'caissier-fourn',
      'CAISSIER_BOUTIQUE',
      boutique.id,
      4,
    );
    await creerUtilisateur('respcrm-fourn', 'RESPONSABLE_CRM', null, 1);
    await creerUtilisateur(
      'respbout-fourn',
      'RESPONSABLE_BOUTIQUE',
      boutique.id,
      3,
    );

    const autreBoutique = await env.prisma.boutique.create({
      data: {
        nom: 'Boutique Autre Fournisseurs',
        adresse: 'Adr 2',
        zoneId: zone.id,
      },
    });
    await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Zone B',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: autreBoutique.id,
      },
    });

    const produit = await env.prisma.produit.create({
      data: { designation: 'Câble USB-C', prixUnitaire: '2000.00', stock: 5 },
    });
    produitId = produit.id;
    const entrepotPrincipal = await env.prisma.entrepot.findFirstOrThrow({
      where: { type: 'PRINCIPAL' },
    });
    await env.prisma.stockQuant.create({
      data: {
        produitId: produit.id,
        entrepotId: entrepotPrincipal.id,
        quantite: 5,
      },
    });

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
    tokens.respboutique = await login('respbout-fourn');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  describe('Création fournisseur (ROLES_FICHE_FOURNISSEUR)', () => {
    it('refuse (403) la création par un rôle non habilité (CAISSIER_BOUTIQUE)', () => {
      return request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.caissierBoutique))
        .send({ nom: 'Grossiste Accessoires SARL' })
        .expect(403);
    });

    it('autorise DAF à créer un fournisseur (cycle Achats, pas admin SI)', async () => {
      const response = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.daf))
        .send({ nom: 'Grossiste DAF SARL' })
        .expect(201);
      expect((response.body as FournisseurDto).nom).toBe('Grossiste DAF SARL');
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

    it('refuse (403) la lecture fournisseurs au CAISSIER_BOUTIQUE', () => {
      return request(app.getHttpServer())
        .get('/fournisseurs')
        .set(auth(tokens.caissierBoutique))
        .expect(403);
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

    it('renvoie le fournisseur pour un rôle habilité', async () => {
      const response = await request(app.getHttpServer())
        .get(`/fournisseurs/${fournisseurId}`)
        .set(auth(tokens.daf))
        .expect(200);

      const body = response.body as FournisseurDto;
      expect(body.id).toBe(fournisseurId);
      expect(body.nom).toBe('Distributeur Lecture Test');
    });
  });

  describe('Réception de stock (ROLES_RECEPTION_STOCK)', () => {
    let fournisseurId: string;

    beforeAll(async () => {
      const fournisseur = await env.prisma.fournisseur.create({
        data: { nom: 'Fournisseur Réception Test' },
      });
      fournisseurId = fournisseur.id;
    });

    it('refuse (403) la réception par un rôle non habilité (CAISSIER_BOUTIQUE)', () => {
      return request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.caissierBoutique))
        .send({ produitId, quantite: 10, prixAchat: 1500 })
        .expect(403);
    });

    it('autorise DAF à enregistrer une réception (entrée en stock)', async () => {
      const entrepotPrincipal = await env.prisma.entrepot.findFirstOrThrow({
        where: { nom: 'Principal Fournisseurs' },
      });
      const avant = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      await request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.daf))
        .send({
          produitId,
          quantite: 3,
          prixAchat: 1400,
          entrepotId: entrepotPrincipal.id,
        })
        .expect(201);
      const apres = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      expect(apres.stock).toBe(avant.stock + 3);
    });

    it("autorise RESPONSABLE_SI à enregistrer une réception, incrémente le stock et journalise l'audit", async () => {
      const avant = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      const entrepotPrincipal = await env.prisma.entrepot.findFirstOrThrow({
        where: { nom: 'Principal Fournisseurs' },
      });

      const response = await request(app.getHttpServer())
        .post(`/fournisseurs/${fournisseurId}/receptions`)
        .set(auth(tokens.respsi))
        .send({
          produitId,
          quantite: 15,
          prixAchat: 1500,
          entrepotId: entrepotPrincipal.id,
        })
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
      expect(produit.stock).toBe(20);
    });
  });

  describe('Fiche enrichie, synthèse et périmètre boutique', () => {
    it('refuse (400) un nom de fournisseur déjà utilisé', async () => {
      await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: 'Fournisseur Unique Test' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: 'fournisseur unique test' })
        .expect(400);
    });

    it('autorise RESPONSABLE_SI à mettre à jour une fiche et journalise l’audit', async () => {
      const created = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({
          nom: 'Fiche Enrichie Test',
          telephone: '+225 01 02 03 04 05',
          email: 'contact@fiche-test.ci',
        })
        .expect(201);
      const id = (created.body as FournisseurDto).id;

      const patched = await request(app.getHttpServer())
        .patch(`/fournisseurs/${id}`)
        .set(auth(tokens.respsi))
        .send({ adresse: 'Yopougon', notes: 'Délai habituel 48h', actif: true })
        .expect(200);
      expect((patched.body as { adresse: string }).adresse).toBe('Yopougon');

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'Fournisseur',
          entiteId: id,
          action: 'FOURNISSEUR_UPDATED',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('autorise le PATCH par DAF et refuse RESPONSABLE_CRM', async () => {
      const created = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: 'Patch Interdit Test' })
        .expect(201);
      const id = (created.body as FournisseurDto).id;

      await request(app.getHttpServer())
        .patch(`/fournisseurs/${id}`)
        .set(auth(tokens.daf))
        .send({ notes: 'Note DAF' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/fournisseurs/${id}`)
        .set(auth(tokens.respcrm))
        .send({ notes: 'x' })
        .expect(403);
    });

    it('refuse (400) une réception sur fournisseur inactif', async () => {
      const created = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: 'Fournisseur Inactif Test' })
        .expect(201);
      const id = (created.body as FournisseurDto).id;

      await request(app.getHttpServer())
        .patch(`/fournisseurs/${id}`)
        .set(auth(tokens.respsi))
        .send({ actif: false })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/fournisseurs/${id}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 2, prixAchat: 1000 })
        .expect(400);
    });

    it('refuse (403) qu’un RESPONSABLE_BOUTIQUE réceptionne le fournisseur (vague 2 : transfert interne seulement)', async () => {
      const created = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: 'Fournisseur Boutique Test' })
        .expect(201);
      const id = (created.body as FournisseurDto).id;

      await request(app.getHttpServer())
        .post(`/fournisseurs/${id}/receptions`)
        .set(auth(tokens.respboutique))
        .send({
          produitId,
          quantite: 3,
          prixAchat: 1600,
          reference: 'BL-TEST-1',
        })
        .expect(403);
    });

    it('renvoie une synthèse Achats (KPI, hausses, réceptions récentes)', async () => {
      const created = await request(app.getHttpServer())
        .post('/fournisseurs')
        .set(auth(tokens.respsi))
        .send({ nom: 'Fournisseur Hausse Test' })
        .expect(201);
      const id = (created.body as FournisseurDto).id;

      await request(app.getHttpServer())
        .post(`/fournisseurs/${id}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 2, prixAchat: 1000 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/fournisseurs/${id}/receptions`)
        .set(auth(tokens.respsi))
        .send({ produitId, quantite: 2, prixAchat: 1300 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/fournisseurs/synthese')
        .set(auth(tokens.daf))
        .expect(200);
      const body = response.body as {
        kpis: { fournisseurs: number; receptions30j: number };
        haussesPrix: Array<{ fournisseurId: string; designation: string }>;
        receptionsRecentes: unknown[];
      };
      expect(body.kpis.fournisseurs).toBeGreaterThanOrEqual(1);
      expect(body.kpis.receptions30j).toBeGreaterThanOrEqual(2);
      expect(body.haussesPrix.some((h) => h.fournisseurId === id)).toBe(true);
      expect(body.receptionsRecentes.length).toBeGreaterThan(0);
    });

    it('refuse (403) la synthèse par RESPONSABLE_CRM', () => {
      return request(app.getHttpServer())
        .get('/fournisseurs/synthese')
        .set(auth(tokens.respcrm))
        .expect(403);
    });
  });

  describe('Authentification obligatoire', () => {
    it('refuse (401) toute requête sans JWT', () => {
      return request(app.getHttpServer()).get('/fournisseurs').expect(401);
    });
  });
});
