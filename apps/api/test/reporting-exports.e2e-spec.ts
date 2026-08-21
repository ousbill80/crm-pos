// Tests d'intégration réels (zéro mock) — exports États/Reporting §6.3.4 :
// filtrage par période, répartition par mode de paiement, série quotidienne,
// exports CSV et relevé de clôture PDF.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { TypeCaisse } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-reporting-exports-e2e';

describe('Reporting — exports & série temporelle §6.3.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique2Id: string;
  let caisseBoutique1Id: string;
  let caisseBoutique1PosId: string;
  let produitId: string;
  let caissierB1Id: string;
  let temoinB1Id: string;

  const tokens: Record<string, string> = {};

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

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone E' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique Export 1', adresse: 'Adresse 1', zoneId: zone.id },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique Export 2', adresse: 'Adresse 2', zoneId: zone.id },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;

    const caisse1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
    });
    // Caisse dédiée au flux POS réel (ouverture/vente/clôture) du test PDF,
    // distincte de caisse1 qui garde une session OUVERTE en permanence pour
    // les fixtures d'agrégation CA ci-dessous.
    const caisse1Pos = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
    });
    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique2Id },
    });
    caisseBoutique1Id = caisse1.id;
    caisseBoutique1PosId = caisse1Pos.id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Chargeur USB-C',
        prixUnitaire: '2000.00',
        stock: 100,
      },
    });
    produitId = produit.id;

    const entrepot1 = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Export 1',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique1Id,
      },
    });
    await env.prisma.stockQuant.create({
      data: { produitId: produit.id, entrepotId: entrepot1.id, quantite: 100 },
    });

    caissierB1Id = await creerUtilisateur(
      'exp-caissier-b1',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
    );
    temoinB1Id = await creerUtilisateur(
      'exp-temoin-b1',
      'RESPONSABLE_BOUTIQUE',
      boutique1Id,
      3,
    );
    await creerUtilisateur(
      'exp-caissier-b2',
      'CAISSIER_BOUTIQUE',
      boutique2Id,
      4,
    );
    await creerUtilisateur('exp-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('exp-crm', 'RESPONSABLE_CRM', null, 1);

    // Ventes historiques directes (hors POS) pour les agrégations CA / CSV /
    // filtrage période — une du jour en ESPECES, une du jour en CARTE, une
    // ancienne (10 jours) qui doit être exclue par un filtre dateFrom serré.
    const session = await env.prisma.sessionCaisse.create({
      data: {
        caisseId: caisseBoutique1Id,
        fondInitial: 0,
        ouvertureUtilisateurId: caissierB1Id,
        ouvertureTemoinId: temoinB1Id,
      },
    });
    await env.prisma.vente.create({
      data: {
        caisseId: caisseBoutique1Id,
        sessionCaisseId: session.id,
        montantTotal: 5000,
        modePaiement: 'ESPECES',
        dateVente: new Date(),
      },
    });
    await env.prisma.vente.create({
      data: {
        caisseId: caisseBoutique1Id,
        sessionCaisseId: session.id,
        montantTotal: 2000,
        modePaiement: 'CARTE',
        dateVente: new Date(),
      },
    });
    await env.prisma.vente.create({
      data: {
        caisseId: caisseBoutique1Id,
        sessionCaisseId: session.id,
        montantTotal: 1000,
        modePaiement: 'ESPECES',
        dateVente: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
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

    tokens.caissierB1 = await login('exp-caissier-b1');
    tokens.caissierB2 = await login('exp-caissier-b2');
    tokens.central = await login('exp-central');
    tokens.crm = await login('exp-crm');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  describe('GET /reporting/dashboard — filtrage période & répartition par mode', () => {
    it('sans filtre : CA total = 8000, parModePaiement inclut ESPECES et CARTE', async () => {
      const response = await request(app.getHttpServer())
        .get('/reporting/dashboard')
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(200);

      const body = response.body as {
        chiffreAffaires: {
          total: string;
          parModePaiement: Array<{ modePaiement: string; montant: string }>;
        };
      };
      expect(body.chiffreAffaires.total).toBe('8000.00');
      const parMode = body.chiffreAffaires.parModePaiement;
      expect(parMode.find((m) => m.modePaiement === 'ESPECES')?.montant).toBe(
        '6000.00',
      );
      expect(parMode.find((m) => m.modePaiement === 'CARTE')?.montant).toBe(
        '2000.00',
      );
    });

    it('avec dateFrom serré : exclut la vente vieille de 10 jours (CA = 7000)', async () => {
      const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const response = await request(app.getHttpServer())
        .get('/reporting/dashboard')
        .query({ dateFrom })
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(200);

      const body = response.body as { chiffreAffaires: { total: string } };
      expect(body.chiffreAffaires.total).toBe('7000.00');
    });

    it('rejette une dateFrom mal formée (400)', async () => {
      await request(app.getHttpServer())
        .get('/reporting/dashboard')
        .query({ dateFrom: 'pas-une-date' })
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(400);
    });
  });

  describe('GET /reporting/ventes-quotidiennes', () => {
    it('retourne une série de 7 jours incluant le CA du jour (7000)', async () => {
      const response = await request(app.getHttpServer())
        .get('/reporting/ventes-quotidiennes')
        .query({ jours: 7 })
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(200);

      const serie = response.body as Array<{ date: string; total: string }>;
      expect(serie).toHaveLength(7);
      const aujourdHui = new Date().toISOString().slice(0, 10);
      expect(serie[serie.length - 1].date).toBe(aujourdHui);
      expect(serie[serie.length - 1].total).toBe('7000.00');
    });

    it('refuse RESPONSABLE_CRM (403)', async () => {
      await request(app.getHttpServer())
        .get('/reporting/ventes-quotidiennes')
        .set('Authorization', `Bearer ${tokens.crm}`)
        .expect(403);
    });
  });

  describe('Exports CSV', () => {
    it('GET /reporting/dashboard/export.csv renvoie un CSV avec en-têtes', async () => {
      const response = await request(app.getHttpServer())
        .get('/reporting/dashboard/export.csv')
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text.split('\r\n')[0]).toBe(
        'Boutique,Chiffre d’affaires',
      );
      expect(response.text).toContain('Boutique Export 1,8000.00');
    });

    it('GET /reporting/ventes/export.csv renvoie les ventes filtrées par période', async () => {
      const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const response = await request(app.getHttpServer())
        .get('/reporting/ventes/export.csv')
        .query({ dateFrom })
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(200);

      const lignes = response.text.trim().split('\r\n');
      expect(lignes[0]).toBe(
        'ID vente,Date,Montant,Mode de paiement,Caisse,Client',
      );
      expect(lignes).toHaveLength(3); // en-tête + 2 ventes du jour
    });

    it('refuse RESPONSABLE_CRM sur les deux exports (403)', async () => {
      await request(app.getHttpServer())
        .get('/reporting/dashboard/export.csv')
        .set('Authorization', `Bearer ${tokens.crm}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/reporting/ventes/export.csv')
        .set('Authorization', `Bearer ${tokens.crm}`)
        .expect(403);
    });
  });

  describe('GET /ventes/sessions/:id/cloture/pdf', () => {
    let sessionId: string;

    beforeAll(async () => {
      const ouverture = await request(app.getHttpServer())
        .post('/ventes/sessions')
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({
          caisseId: caisseBoutique1PosId,
          fondInitial: 0,
          temoinLogin: 'exp-temoin-b1',
          temoinPassword: MOT_DE_PASSE,
        })
        .expect(201);
      sessionId = (ouverture.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({
          lignes: [{ produitId, quantite: 2 }],
          modePaiement: 'ESPECES',
        })
        .expect(201);
    });

    it('génère un PDF pour une session OUVERTE (relevé live)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/cloture/pdf`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect((response.body as Buffer).length).toBeGreaterThan(100);
    });

    it('refuse une autre boutique (403)', async () => {
      await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/cloture/pdf`)
        .set('Authorization', `Bearer ${tokens.caissierB2}`)
        .expect(403);
    });

    it('génère toujours le PDF après clôture de la session', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/cloture`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({
          fondCompteCloture: 4000,
          temoinLogin: 'exp-temoin-b1',
          temoinPassword: MOT_DE_PASSE,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/cloture/pdf`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('404 sur une session inexistante', async () => {
      await request(app.getHttpServer())
        .get(
          '/ventes/sessions/00000000-0000-0000-0000-000000000000/cloture/pdf',
        )
        .set('Authorization', `Bearer ${tokens.central}`)
        .expect(404);
    });
  });
});
