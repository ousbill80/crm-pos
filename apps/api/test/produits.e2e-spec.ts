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
  reference: string | null;
  categorie: string | null;
  description: string | null;
  actif: boolean;
  statutStock: 'RUPTURE' | 'SOUS_SEUIL' | 'OK';
  margeUnitaire: string;
  tauxMarge: string;
  valeurStock: string;
}

interface MouvementStockDto {
  id: string;
  produitId: string;
  type: string;
  quantite: number;
  stockApres: number;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

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

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Test Produits' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Test Produits', adresse: 'Adr', zoneId: zone.id },
    });
    await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Test',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });

    await creerUtilisateur('respsi', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('direction', 'DIRECTION_GENERALE', null, 0);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('caissier-boutique', 'CAISSIER_BOUTIQUE', boutique.id, 4);
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
      expect(body.actif).toBe(true);
      expect(body.statutStock).toBe('OK');

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

    it('expose au caissier le stock de sa boutique, pas le cache réseau', async () => {
      const zone = await env.prisma.zone.findFirstOrThrow();
      const boutiqueA = await env.prisma.boutique.findFirstOrThrow({
        where: { nom: 'Boutique Test Produits' },
      });
      const boutiqueB = await env.prisma.boutique.create({
        data: {
          nom: 'Boutique Test Produits B',
          adresse: 'Adr B',
          zoneId: zone.id,
        },
      });
      const entrepotA = await env.prisma.entrepot.findFirstOrThrow({
        where: { boutiqueId: boutiqueA.id },
      });
      const entrepotB = await env.prisma.entrepot.create({
        data: {
          nom: 'Principal B',
          code: 'PRINCIPAL',
          type: 'PRINCIPAL',
          boutiqueId: boutiqueB.id,
        },
      });
      const sku = await env.prisma.produit.create({
        data: {
          designation: 'Coque périmètre stock',
          prixUnitaire: '2000.00',
          stock: 30,
        },
      });
      await env.prisma.stockQuant.createMany({
        data: [
          { produitId: sku.id, entrepotId: entrepotA.id, quantite: 10 },
          { produitId: sku.id, entrepotId: entrepotB.id, quantite: 20 },
        ],
      });

      const caissier = await request(app.getHttpServer())
        .get('/produits')
        .set(auth(tokens.caissierBoutique))
        .expect(200);
      const ligneCaissier = (caissier.body as ProduitDto[]).find(
        (p) => p.id === sku.id,
      );
      expect(ligneCaissier?.stock).toBe(10);

      const daf = await request(app.getHttpServer())
        .get('/produits')
        .set(auth(tokens.daf))
        .expect(200);
      const ligneDaf = (daf.body as ProduitDto[]).find((p) => p.id === sku.id);
      expect(ligneDaf?.stock).toBe(30);
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

    it('refuse (400) la mise à jour directe du stock (via PATCH produit)', async () => {
      await request(app.getHttpServer())
        .patch(`/produits/${produitId}`)
        .set(auth(tokens.respsi))
        .send({ stock: 12 })
        .expect(400);
    });

    it("autorise RESPONSABLE_SI à mettre à jour le prix et journalise une entrée d'audit", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/produits/${produitId}`)
        .set(auth(tokens.respsi))
        .send({ prixUnitaire: 3200 })
        .expect(200);

      const body = response.body as ProduitDto;
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

      const entrepot = await env.prisma.entrepot.findFirstOrThrow({
        where: { boutique: { nom: 'Boutique Test Produits' } },
      });
      await env.prisma.mouvementStock.create({
        data: {
          produitId,
          entrepotId: entrepot.id,
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

  describe('Catalogue avancé (référence, filtres, synthèse, analyse)', () => {
    let skuProduitId: string;
    let ruptureId: string;
    let inactifId: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.respsi))
        .send({
          designation: 'Coque MagSafe',
          reference: 'COQ-MS-01',
          categorie: 'Protection',
          prixUnitaire: 4500,
          stock: 20,
          seuilReappro: 5,
        })
        .expect(201);
      skuProduitId = (created.body as ProduitDto).id;

      const rupture = await env.prisma.produit.create({
        data: {
          designation: 'Anneau support',
          reference: 'ACC-ANN-01',
          categorie: 'Accessoires',
          prixUnitaire: '2000.00',
          stock: 0,
          seuilReappro: 4,
          coutMoyenPondere: '500.00',
        },
      });
      ruptureId = rupture.id;

      const inactif = await env.prisma.produit.create({
        data: {
          designation: 'Coque iPhone 8',
          reference: 'COQ-IP8',
          categorie: 'Protection',
          prixUnitaire: '1000.00',
          stock: 2,
          seuilReappro: 5,
          actif: false,
        },
      });
      inactifId = inactif.id;
    });

    it('refuse (409) une référence déjà attribuée', async () => {
      await request(app.getHttpServer())
        .post('/produits')
        .set(auth(tokens.respsi))
        .send({
          designation: 'Doublon SKU',
          reference: 'COQ-MS-01',
          prixUnitaire: 1000,
          stock: 0,
        })
        .expect(409);
    });

    it('filtre par recherche (désignation ou référence)', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits?q=COQ-MS-01')
        .set(auth(tokens.daf))
        .expect(200);
      const body = response.body as ProduitDto[];
      expect(body.map((p) => p.id)).toContain(skuProduitId);
      expect(
        body.every(
          (p) =>
            p.reference === 'COQ-MS-01' || p.designation.includes('MagSafe'),
        ),
      ).toBe(true);
    });

    it('filtre par catégorie et par statutStock=RUPTURE', async () => {
      const parCat = await request(app.getHttpServer())
        .get('/produits?categorie=Accessoires')
        .set(auth(tokens.daf))
        .expect(200);
      expect((parCat.body as ProduitDto[]).map((p) => p.id)).toContain(
        ruptureId,
      );

      const ruptures = await request(app.getHttpServer())
        .get('/produits?statutStock=RUPTURE')
        .set(auth(tokens.daf))
        .expect(200);
      const ids = (ruptures.body as ProduitDto[]).map((p) => p.id);
      expect(ids).toContain(ruptureId);
      expect(ids).not.toContain(skuProduitId);
    });

    it('filtre actif=false et exclut les inactifs de actif=true', async () => {
      const inactifs = await request(app.getHttpServer())
        .get('/produits?actif=false')
        .set(auth(tokens.daf))
        .expect(200);
      expect((inactifs.body as ProduitDto[]).map((p) => p.id)).toContain(
        inactifId,
      );

      const actifs = await request(app.getHttpServer())
        .get('/produits?actif=true')
        .set(auth(tokens.daf))
        .expect(200);
      expect((actifs.body as ProduitDto[]).map((p) => p.id)).not.toContain(
        inactifId,
      );
    });

    it('expose la synthèse catalogue (KPIs sur les produits actifs)', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits/synthese')
        .set(auth(tokens.daf))
        .expect(200);
      const body = response.body as {
        nombreProduits: number;
        actifs: number;
        inactifs: number;
        ruptures: number;
        valeurStock: string;
      };
      expect(body.nombreProduits).toBeGreaterThanOrEqual(3);
      expect(body.inactifs).toBeGreaterThanOrEqual(1);
      expect(body.ruptures).toBeGreaterThanOrEqual(1);
      expect(body.valeurStock).toEqual(expect.any(String));
    });

    it('refuse (403) la synthèse au RESPONSABLE_CRM', () => {
      return request(app.getHttpServer())
        .get('/produits/synthese')
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('liste les catégories distinctes', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits/categories')
        .set(auth(tokens.daf))
        .expect(200);
      const body = response.body as string[];
      expect(body).toEqual(
        expect.arrayContaining(['Protection', 'Accessoires']),
      );
    });

    it("renvoie l'analyse 30 j, la répartition stock et la suggestion d'écart au seuil", async () => {
      const response = await request(app.getHttpServer())
        .get(`/produits/${ruptureId}/analyse`)
        .set(auth(tokens.daf))
        .expect(200);
      const body = response.body as {
        produit: ProduitDto;
        repartitionStock: unknown[];
        performance30j: { quantiteVendue: number; chiffreAffaires: string };
        suggestionReappro: { necessaire: boolean; quantiteSuggeree: number };
      };
      expect(body.produit.id).toBe(ruptureId);
      expect(body.produit.statutStock).toBe('RUPTURE');
      expect(body.suggestionReappro.necessaire).toBe(true);
      expect(body.suggestionReappro.quantiteSuggeree).toBe(5);
      expect(body.performance30j.quantiteVendue).toBe(0);
    });

    it('autorise la désactivation (sans suppression) et journalise PRODUIT_UPDATED', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/produits/${skuProduitId}`)
        .set(auth(tokens.respsi))
        .send({ actif: false })
        .expect(200);
      expect((response.body as ProduitDto).actif).toBe(false);

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'Produit',
          entiteId: skuProduitId,
          action: 'PRODUIT_UPDATED',
        },
        orderBy: { dateHeure: 'desc' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('Export, classement 30 j et historique des ventes', () => {
    let venduId: string;
    let margeNegId: string;

    beforeAll(async () => {
      const user = await env.prisma.utilisateur.findUniqueOrThrow({
        where: { login: 'respsi' },
      });
      const boutique = await env.prisma.boutique.findFirstOrThrow();
      const caisse = await env.prisma.caisse.create({
        data: { type: 'MAGASIN', boutiqueId: boutique.id },
      });
      const session = await env.prisma.sessionCaisse.create({
        data: {
          caisseId: caisse.id,
          fondInitial: 1000,
          ouvertureUtilisateurId: user.id,
          ouvertureTemoinId: user.id,
        },
      });

      const vendu = await env.prisma.produit.create({
        data: {
          designation: 'Câble test ventes',
          reference: 'CAB-TEST-V',
          categorie: 'Câbles',
          prixUnitaire: '2000.00',
          stock: 10,
          coutMoyenPondere: '600.00',
        },
      });
      venduId = vendu.id;

      await env.prisma.vente.create({
        data: {
          caisseId: caisse.id,
          sessionCaisseId: session.id,
          montantTotal: 4000,
          modePaiement: 'ESPECES',
          lignes: {
            create: {
              produitId: venduId,
              quantite: 2,
              prixUnitaire: 2000,
              remise: 0,
            },
          },
        },
      });

      const margeNeg = await env.prisma.produit.create({
        data: {
          designation: 'Promo sous CMP',
          reference: 'PROMO-CMP',
          categorie: 'Accessoires',
          prixUnitaire: '500.00',
          stock: 8,
          coutMoyenPondere: '2000.00',
        },
      });
      margeNegId = margeNeg.id;
    });

    it('exporte le catalogue en CSV (mêmes filtres que la liste)', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits/export.csv')
        .set(auth(tokens.daf))
        .expect(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.text).toContain('Désignation');
      expect(response.text).toContain('Câble test ventes');
    });

    it('refuse (403) l’export au RESPONSABLE_CRM', () => {
      return request(app.getHttpServer())
        .get('/produits/export.csv')
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('filtre les fiches dont le prix est sous le CMP', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits?margeNegative=true')
        .set(auth(tokens.daf))
        .expect(200);
      const ids = (response.body as ProduitDto[]).map((p) => p.id);
      expect(ids).toContain(margeNegId);
      expect(ids).not.toContain(venduId);
    });

    it('classe les meilleures ventes 30 j et les dormants (stock sans vente)', async () => {
      const response = await request(app.getHttpServer())
        .get('/produits/classement')
        .set(auth(tokens.daf))
        .expect(200);
      const body = response.body as {
        fenetreJours: number;
        meilleuresVentes: Array<{
          produit: ProduitDto;
          quantiteVendue: number;
        }>;
        dormants: Array<{ produit: ProduitDto; stock: number }>;
      };
      expect(body.fenetreJours).toBe(30);
      expect(body.meilleuresVentes.map((r) => r.produit.id)).toContain(venduId);
      expect(body.meilleuresVentes[0]?.quantiteVendue).toBeGreaterThanOrEqual(
        2,
      );
      expect(body.dormants.map((r) => r.produit.id)).toContain(margeNegId);
      expect(body.dormants.map((r) => r.produit.id)).not.toContain(venduId);
    });

    it('refuse (403) le classement au RESPONSABLE_CRM', () => {
      return request(app.getHttpServer())
        .get('/produits/classement')
        .set(auth(tokens.respcrm))
        .expect(403);
    });

    it('liste l’historique des ventes du produit (réseau)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/produits/${venduId}/ventes`)
        .set(auth(tokens.caissierBoutique))
        .expect(200);
      const body = response.body as Array<{
        quantite: number;
        boutique: string | null;
        montant: string;
      }>;
      expect(body).toHaveLength(1);
      expect(body[0].quantite).toBe(2);
      expect(body[0].boutique).toBe('Boutique Test Produits');
      expect(Number(body[0].montant)).toBe(4000);
    });

    it('renvoie 404 pour l’historique d’un produit inexistant', () => {
      return request(app.getHttpServer())
        .get('/produits/00000000-0000-0000-0000-000000000000/ventes')
        .set(auth(tokens.daf))
        .expect(404);
    });
  });

  describe('Import catalogue CSV/Excel (ROLES_ADMIN_STRUCTURE)', () => {
    it('refuse (403) l’aperçu à un Caissier boutique', () => {
      return request(app.getHttpServer())
        .post('/produits/import/apercu')
        .set(auth(tokens.caissierBoutique))
        .send({ csv: 'Désignation,Prix unitaire\nCoque,2500\n' })
        .expect(403);
    });

    it('refuse (403) l’import au DAF (lecture, pas admin structure)', () => {
      return request(app.getHttpServer())
        .post('/produits/import')
        .set(auth(tokens.daf))
        .send({ csv: 'Désignation,Prix unitaire\nCoque,2500\n' })
        .expect(403);
    });

    it('détecte les colonnes d’un CSV point-virgule et crée les fiches', async () => {
      const csv = [
        'SKU;Nom;PV;Famille;Seuil',
        'IMP-CBL-01;Câble import;2 500,00;Câbles;4',
        'IMP-COQ-01;Coque import;1500;Protection;2',
      ].join('\n');

      const apercu = await request(app.getHttpServer())
        .post('/produits/import/apercu')
        .set(auth(tokens.respsi))
        .send({ csv, nomFichier: 'fournisseur.csv' })
        .expect(201);

      const body = apercu.body as {
        aCreer: number;
        aMettreAJour: number;
        enErreur: number;
        mapping: {
          reference: string;
          designation: string;
          prixUnitaire: string;
        };
      };
      expect(body.aCreer).toBe(2);
      expect(body.aMettreAJour).toBe(0);
      expect(body.enErreur).toBe(0);
      expect(body.mapping.reference).toBe('SKU');
      expect(body.mapping.designation).toBe('Nom');
      expect(body.mapping.prixUnitaire).toBe('PV');

      const applique = await request(app.getHttpServer())
        .post('/produits/import')
        .set(auth(tokens.respsi))
        .send({ csv, nomFichier: 'fournisseur.csv', mode: 'UPSERT' })
        .expect(201);

      expect(applique.body).toMatchObject({ crees: 2, misAJour: 0 });

      const liste = await request(app.getHttpServer())
        .get('/produits?q=IMP-CBL-01')
        .set(auth(tokens.daf))
        .expect(200);
      const cable = (liste.body as ProduitDto[]).find(
        (p) => p.reference === 'IMP-CBL-01',
      );
      expect(cable).toBeDefined();
      expect(Number(cable!.prixUnitaire)).toBe(2500);
      expect(cable!.stock).toBe(0);

      const audit = await env.prisma.journalAudit.findFirst({
        where: { action: 'PRODUIT_IMPORT' },
        orderBy: { dateHeure: 'desc' },
      });
      expect(audit).not.toBeNull();
    });

    it('mappe des en-têtes longs et importe les lignes valides malgré une erreur', async () => {
      const csv = [
        'Code article,Libellé produit,Prix de vente TTC',
        'IMP-FZ-01,Coque fuzzy,3500',
        'IMP-FZ-BAD,,0',
        ',,',
      ].join('\n');

      const apercu = await request(app.getHttpServer())
        .post('/produits/import/apercu')
        .set(auth(tokens.respsi))
        .send({ csv })
        .expect(201);
      const body = apercu.body as {
        aCreer: number;
        enErreur: number;
        aIgnorer: number;
        mapping: {
          reference: string;
          designation: string;
          prixUnitaire: string;
        };
      };
      expect(body.mapping.reference).toBe('Code article');
      expect(body.mapping.designation).toBe('Libellé produit');
      expect(body.mapping.prixUnitaire).toBe('Prix de vente TTC');
      expect(body.aCreer).toBe(1);
      expect(body.enErreur).toBeGreaterThanOrEqual(1);

      const applique = await request(app.getHttpServer())
        .post('/produits/import')
        .set(auth(tokens.respsi))
        .send({ csv, ignorerLignesEnErreur: true })
        .expect(201);
      expect(applique.body).toMatchObject({ crees: 1 });
    });

    it('met à jour le prix d’une fiche existante sans toucher au stock', async () => {
      await env.prisma.produit.create({
        data: {
          designation: 'Article déjà en base',
          reference: 'IMP-UPD-01',
          prixUnitaire: '1000.00',
          stock: 12,
        },
      });

      const csv =
        'Référence,Désignation,Prix unitaire,Stock réseau\nIMP-UPD-01,Article déjà en base,1800,99\n';
      await request(app.getHttpServer())
        .post('/produits/import')
        .set(auth(tokens.respsi))
        .send({ csv, importerStockInitial: true })
        .expect(201);

      const produit = await env.prisma.produit.findUnique({
        where: { reference: 'IMP-UPD-01' },
      });
      expect(Number(produit?.prixUnitaire)).toBe(1800);
      expect(produit?.stock).toBe(12);
    });

    it('crée un stock initial uniquement pour un nouveau produit si demandé', async () => {
      const csv =
        'Référence,Désignation,Prix unitaire,Stock initial\nIMP-STK-01,Nouveau avec stock,3000,7\n';
      await request(app.getHttpServer())
        .post('/produits/import')
        .set(auth(tokens.respsi))
        .send({ csv, importerStockInitial: true })
        .expect(201);

      const produit = await env.prisma.produit.findUnique({
        where: { reference: 'IMP-STK-01' },
      });
      expect(produit?.stock).toBe(7);
      const mvt = await env.prisma.mouvementStock.findFirst({
        where: { produitId: produit!.id, reference: 'STOCK_INITIAL' },
      });
      expect(mvt).not.toBeNull();
    });
  });

  describe('Authentification obligatoire', () => {
    it('refuse (401) toute requête sans JWT', () => {
      return request(app.getHttpServer()).get('/produits').expect(401);
    });
  });
});
