// Tests d'intégration réels (zéro mock) — module Transactions, machine à
// états §6.4 du cahier des charges. Démarre un vrai PostgreSQL via
// Testcontainers, seed une organisation minimale (zone/boutiques/caisses/
// utilisateurs) et authentifie chaque profil via le vrai endpoint
// /auth/login (pas de JWT forgé à la main).
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

interface TransactionDto {
  id: string;
  statut: string;
  type: string;
  montant: string;
  caisseId: string;
  initiateurId: string;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Transactions — machine à états §6.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique2Id: string;
  let boutique3Id: string; // zone B — sert à prouver l'étanchéité entre zones
  let caisseBoutique1Id: string; // AUXILIAIRE, boutique 1 (zone A)
  let caisseBoutique2Id: string; // AUXILIAIRE, boutique 2 (zone A)
  let caisseBoutique3Id: string; // AUXILIAIRE, boutique 3 (zone B)
  let caisseCentraleId: string; // CENTRALE

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

  async function initierTransaction(
    token: string,
    caisseId: string,
    montant: number,
    type: 'VENTE' | 'SORTIE_FONDS' = 'VENTE',
  ): Promise<TransactionDto> {
    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ caisseId, type, montant })
      .expect(201);
    return response.body as TransactionDto;
  }

  async function cycleJusquaReceptionnee(
    tokenInit: string,
    caisseId: string,
    montant: number,
    type: 'VENTE' | 'SORTIE_FONDS' = 'VENTE',
  ): Promise<TransactionDto> {
    const transaction = await initierTransaction(
      tokenInit,
      caisseId,
      montant,
      type,
    );
    await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/transit`)
      .set('Authorization', `Bearer ${tokens.respB1}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/receptionner`)
      .set('Authorization', `Bearer ${tokens.caissierCentral}`)
      .expect(200);
    return transaction;
  }

  beforeAll(async () => {
    await env.start();

    const zoneA = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const zoneB = await env.prisma.zone.create({ data: { nomZone: 'Zone B' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneA.id },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 2', adresse: 'Adresse 2', zoneId: zoneA.id },
    });
    const boutique3 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 3', adresse: 'Adresse 3', zoneId: zoneB.id },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;
    boutique3Id = boutique3.id;

    const caisseBoutique1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1Id },
    });
    const caisseBoutique2 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique2Id },
    });
    const caisseBoutique3 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique3Id },
    });
    const caisseCentrale = await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });
    caisseBoutique1Id = caisseBoutique1.id;
    caisseBoutique2Id = caisseBoutique2.id;
    caisseBoutique3Id = caisseBoutique3.id;
    caisseCentraleId = caisseCentrale.id;

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutique1Id, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutique1Id, 3);
    await creerUtilisateur('caissier-b2', 'CAISSIER_BOUTIQUE', boutique2Id, 4);
    await creerUtilisateur('caissier-b3', 'CAISSIER_BOUTIQUE', boutique3Id, 4);
    await creerUtilisateur('caissier-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('controle', 'CONTROLEUR_INTERNE', null, 1);
    await creerUtilisateur('convoyeur-b1', 'CONVOYEUR', boutique1Id, 4);
    await creerUtilisateur('dg-reseau', 'DIRECTION_GENERALE', null, 0);
    // Superviseur de zone rattaché à boutique1 (zone A) : la zone de
    // supervision est résolue via Utilisateur.boutiqueId -> Boutique.zoneId
    // (limite de schéma documentée dans boutique-scope.util.ts).
    await creerUtilisateur('superviseur-a', 'SUPERVISEUR_ZONE', boutique1Id, 2);

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

    tokens.caissierB1 = await login('caissier-b1');
    tokens.respB1 = await login('resp-b1');
    tokens.caissierB2 = await login('caissier-b2');
    tokens.caissierB3 = await login('caissier-b3');
    tokens.caissierCentral = await login('caissier-central');
    tokens.daf = await login('daf');
    tokens.controle = await login('controle');
    tokens.superviseurA = await login('superviseur-a');
    tokens.convoyeurB1 = await login('convoyeur-b1');
    tokens.dg = await login('dg-reseau');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  // ---------------------------------------------------------------------
  // §6.4 — cycle de vie complet, écart nul => VALIDEE, + audit (§6.7)
  // ---------------------------------------------------------------------
  it('exécute le cycle complet INITIEE -> EN_TRANSIT -> RECEPTIONNEE -> VALIDEE sans écart, avec journal d’audit', async () => {
    const transaction = await initierTransaction(
      tokens.caissierB1,
      caisseBoutique1Id,
      1000,
    );
    expect(transaction.statut).toBe('INITIEE');

    const bordereau = await env.prisma.bordereauVersement.findUnique({
      where: { transactionId: transaction.id },
    });
    expect(bordereau).not.toBeNull();
    expect(Number(bordereau!.montantDeclare)).toBe(1000);

    const enTransit = await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/transit`)
      .set('Authorization', `Bearer ${tokens.respB1}`)
      .expect(200);
    expect((enTransit.body as TransactionDto).statut).toBe('EN_TRANSIT');

    const receptionnee = await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/receptionner`)
      .set('Authorization', `Bearer ${tokens.caissierCentral}`)
      .expect(200);
    expect((receptionnee.body as TransactionDto).statut).toBe('RECEPTIONNEE');

    const validee = await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/rapprocher`)
      .set('Authorization', `Bearer ${tokens.caissierCentral}`)
      .send({ montantRecu: 1000 })
      .expect(200);
    expect((validee.body as TransactionDto).statut).toBe('VALIDEE');

    const reception = await env.prisma.receptionValidation.findUnique({
      where: { bordereauId: bordereau!.id },
    });
    expect(reception).not.toBeNull();
    expect(Number(reception!.ecart)).toBe(0);
    expect(reception!.statutFinal).toBe('VALIDEE');

    // Journal d'audit horodaté et append-only (§6.7) : une entrée par
    // transition, toutes rattachées à cette TransactionCaisse.
    const entreesAudit = await env.prisma.journalAudit.findMany({
      where: { entite: 'TransactionCaisse', entiteId: transaction.id },
      orderBy: { dateHeure: 'asc' },
    });
    expect(entreesAudit.map((e) => e.action)).toEqual([
      'TRANSACTION_INITIEE',
      'TRANSACTION_EN_TRANSIT',
      'TRANSACTION_RECEPTIONNEE',
      'TRANSACTION_VALIDEE',
    ]);
  });

  // ---------------------------------------------------------------------
  // §6.4 — écart lors du rapprochement => LITIGE
  // ---------------------------------------------------------------------
  it('déclenche LITIGE quand le montant reçu diffère du montant déclaré', async () => {
    const transaction = await initierTransaction(
      tokens.caissierB1,
      caisseBoutique1Id,
      500,
    );

    await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/transit`)
      .set('Authorization', `Bearer ${tokens.respB1}`)
      .expect(200);

    // Réceptionné par le DAF cette fois — les deux rôles habilités (§6.4).
    await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/receptionner`)
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    const litige = await request(app.getHttpServer())
      .patch(`/transactions/${transaction.id}/rapprocher`)
      .set('Authorization', `Bearer ${tokens.daf}`)
      .send({ montantRecu: 450 })
      .expect(200);
    expect((litige.body as TransactionDto).statut).toBe('LITIGE');

    const bordereau = await env.prisma.bordereauVersement.findUnique({
      where: { transactionId: transaction.id },
    });
    const reception = await env.prisma.receptionValidation.findUnique({
      where: { bordereauId: bordereau!.id },
    });
    expect(Number(reception!.ecart)).toBe(-50);
    expect(reception!.statutFinal).toBe('LITIGE');
  });

  // ---------------------------------------------------------------------
  // §6.4 — transitions illégales explicitement rejetées (400), jamais
  // silencieuses.
  // ---------------------------------------------------------------------
  describe('transitions illégales', () => {
    it('refuse de réceptionner une transaction encore INITIEE (saute EN_TRANSIT)', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        200,
      );

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .expect(400);
    });

    it('refuse de repasser EN_TRANSIT une transaction déjà EN_TRANSIT', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        200,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(400);
    });

    it('refuse toute transition depuis un état terminal VALIDEE', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        150,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 150 })
        .expect(200);

      // VALIDEE est terminal : ni receptionner ni rapprocher ne doivent
      // pouvoir s'appliquer à nouveau.
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 150 })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // §6.4 / §4 / §6.2 — séparation des tâches : une caisse auxiliaire NE PEUT
  // JAMAIS réceptionner ni valider, appliqué côté serveur (403), pas
  // seulement masqué côté UI. C'est le test le plus important du module.
  // ---------------------------------------------------------------------
  describe('séparation des tâches — RBAC serveur non contournable', () => {
    it('refuse (403) qu’un CAISSIER_BOUTIQUE réceptionne une transaction', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        300,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(403);
    });

    it('refuse (403) qu’un CAISSIER_BOUTIQUE valide (rapprochement) une transaction', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        300,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({ montantRecu: 300 })
        .expect(403);
    });

    it('refuse (403) qu’un RESPONSABLE_BOUTIQUE réceptionne une transaction', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        300,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(403);
    });

    it('refuse (403) qu’un CONTROLEUR_INTERNE (lecture/audit seul) réceptionne ou valide', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        300,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.respB1}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.controle}`)
        .expect(403);
    });

    it('refuse (403) qu’un CAISSIER_CENTRAL initie une transaction (réservé caisse auxiliaire)', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ caisseId: caisseBoutique1Id, type: 'VENTE', montant: 100 })
        .expect(403);
    });

    it('refuse (403) qu’un CAISSIER_BOUTIQUE fasse passer une transaction EN_TRANSIT', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        300,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(403);
    });

    it('refuse (401) tout accès sans authentification', async () => {
      await request(app.getHttpServer()).post('/transactions').expect(401);
    });
  });

  // ---------------------------------------------------------------------
  // §6.2 — périmètre de données : un utilisateur boutique n'agit que sur sa
  // propre boutique.
  // ---------------------------------------------------------------------
  describe('périmètre de données (§6.2)', () => {
    it('refuse (403) qu’un caissier initie depuis la caisse d’une autre boutique', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({ caisseId: caisseBoutique2Id, type: 'VENTE', montant: 100 })
        .expect(403);
    });

    it('refuse (400) d’initier une transaction depuis une caisse CENTRALE', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({ caisseId: caisseCentraleId, type: 'VENTE', montant: 100 })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // §6.2 — GET /transactions et GET /transactions/:id : lecture scopée par
  // rôle, même périmètre que la lecture des caisses (réseau trésorerie,
  // superviseur de zone, périmètre boutique).
  // ---------------------------------------------------------------------
  describe('lecture scopée par rôle (§6.2)', () => {
    it('un rôle réseau trésorerie (DAF) voit les transactions des trois boutiques', async () => {
      const t1 = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        111,
      );
      const t2 = await initierTransaction(
        tokens.caissierB2,
        caisseBoutique2Id,
        222,
      );
      const t3 = await initierTransaction(
        tokens.caissierB3,
        caisseBoutique3Id,
        333,
      );

      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);

      const ids = (response.body as TransactionDto[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([t1.id, t2.id, t3.id]));
    });

    it('un CAISSIER_BOUTIQUE ne voit que les transactions de sa propre boutique', async () => {
      const t1 = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        50,
      );
      const t2 = await initierTransaction(
        tokens.caissierB2,
        caisseBoutique2Id,
        60,
      );

      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(200);

      const ids = (response.body as TransactionDto[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([t1.id]));
      expect(ids).not.toEqual(expect.arrayContaining([t2.id]));
    });

    it('un SUPERVISEUR_ZONE voit les transactions de sa zone (boutiques 1 et 2) mais pas celles de la zone B (boutique 3)', async () => {
      const t1 = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        71,
      );
      const t2 = await initierTransaction(
        tokens.caissierB2,
        caisseBoutique2Id,
        72,
      );
      const t3 = await initierTransaction(
        tokens.caissierB3,
        caisseBoutique3Id,
        73,
      );

      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${tokens.superviseurA}`)
        .expect(200);

      const ids = (response.body as TransactionDto[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([t1.id, t2.id]));
      expect(ids).not.toEqual(expect.arrayContaining([t3.id]));
    });

    it('GET /transactions/:id — un CAISSIER_BOUTIQUE peut consulter le détail de sa propre transaction', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        90,
      );

      const response = await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(200);

      expect((response.body as TransactionDto).id).toBe(transaction.id);
    });

    it('GET /transactions/:id — refuse (403) qu’un CAISSIER_BOUTIQUE consulte une transaction d’une autre boutique', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB2,
        caisseBoutique2Id,
        90,
      );

      await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .expect(403);
    });

    it('GET /transactions/:id — refuse (403) qu’un SUPERVISEUR_ZONE consulte une transaction hors de sa zone', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB3,
        caisseBoutique3Id,
        90,
      );

      await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', `Bearer ${tokens.superviseurA}`)
        .expect(403);
    });

    it('GET /transactions — refuse (401) tout accès sans authentification', async () => {
      await request(app.getHttpServer()).get('/transactions').expect(401);
    });

    it('GET /transactions/:id — renvoie 404 pour une transaction inexistante', async () => {
      await request(app.getHttpServer())
        .get('/transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Contrepartie CENTRALE + régularisation LITIGE (règles validées)
  // ---------------------------------------------------------------------
  describe('contrepartie CENTRALE et régularisation litige', () => {
    it('crédite la CENTRALE et débite l’auxiliaire quand une SORTIE_FONDS est VALIDEE sans écart', async () => {
      const soldeAuxAvant = await request(app.getHttpServer())
        .get(`/caisses/${caisseBoutique1Id}/solde`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);
      const soldeCenAvant = await request(app.getHttpServer())
        .get(`/caisses/${caisseCentraleId}/solde`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);

      const transaction = await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        800,
        'SORTIE_FONDS',
      );

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 800 })
        .expect(200);

      const miroir = await env.prisma.transactionCaisse.findFirst({
        where: { transactionSourceId: transaction.id },
      });
      expect(miroir).not.toBeNull();
      expect(miroir!.caisseId).toBe(caisseCentraleId);
      expect(miroir!.type).toBe('VENTE');
      expect(miroir!.statut).toBe('VALIDEE');
      expect(Number(miroir!.montant)).toBe(800);

      const soldeAuxApres = await request(app.getHttpServer())
        .get(`/caisses/${caisseBoutique1Id}/solde`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);
      const soldeCenApres = await request(app.getHttpServer())
        .get(`/caisses/${caisseCentraleId}/solde`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);

      expect(Number((soldeAuxApres.body as { solde: string }).solde)).toBe(
        Number((soldeAuxAvant.body as { solde: string }).solde) - 800,
      );
      expect(Number((soldeCenApres.body as { solde: string }).solde)).toBe(
        Number((soldeCenAvant.body as { solde: string }).solde) + 800,
      );

      // Idempotence : un second rapprochement est refusé, pas de double miroir.
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 800 })
        .expect(400);
      const miroirs = await env.prisma.transactionCaisse.count({
        where: { transactionSourceId: transaction.id },
      });
      expect(miroirs).toBe(1);
    });

    it('ne crée pas de miroir CENTRALE quand le rapprochement aboutit en LITIGE', async () => {
      const transaction = await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        600,
        'SORTIE_FONDS',
      );

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 550 })
        .expect(200);

      const miroir = await env.prisma.transactionCaisse.findFirst({
        where: { transactionSourceId: transaction.id },
      });
      expect(miroir).toBeNull();
    });

    it('régularise LITIGE → VALIDEE (Contrôle interne) et crédite la CENTRALE du montant retenu', async () => {
      const transaction = await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        400,
        'SORTIE_FONDS',
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 350 })
        .expect(200);

      const soldeCenAvant = await request(app.getHttpServer())
        .get(`/caisses/${caisseCentraleId}/solde`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);

      const regularisee = await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/regulariser`)
        .set('Authorization', `Bearer ${tokens.controle}`)
        .send({
          montantRetenu: 380,
          motif: 'Écart partiel accepté après inventaire',
        })
        .expect(200);
      expect((regularisee.body as TransactionDto).statut).toBe('VALIDEE');

      const miroir = await env.prisma.transactionCaisse.findFirst({
        where: { transactionSourceId: transaction.id },
      });
      expect(miroir).not.toBeNull();
      expect(Number(miroir!.montant)).toBe(380);

      const soldeCenApres = await request(app.getHttpServer())
        .get(`/caisses/${caisseCentraleId}/solde`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);
      expect(Number((soldeCenApres.body as { solde: string }).solde)).toBe(
        Number((soldeCenAvant.body as { solde: string }).solde) + 380,
      );

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          entiteId: transaction.id,
          action: 'TRANSACTION_REGULARISEE',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('refuse (403) qu’un CAISSIER_BOUTIQUE ou CAISSIER_CENTRAL régularise un litige', async () => {
      const transaction = await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        250,
        'SORTIE_FONDS',
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 200 })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/regulariser`)
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({ montantRetenu: 250, motif: 'Tentative boutique' })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/regulariser`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRetenu: 250, motif: 'Tentative central' })
        .expect(403);
    });

    it('autorise le DAF à régulariser un litige', async () => {
      const transaction = await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        180,
        'SORTIE_FONDS',
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 100 })
        .expect(200);

      const regularisee = await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/regulariser`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .send({ montantRetenu: 180, motif: 'Validation DAF niveau 2' })
        .expect(200);
      expect((regularisee.body as TransactionDto).statut).toBe('VALIDEE');
    });

    it('GET /transactions filtre par statut et type', async () => {
      await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        99,
        'SORTIE_FONDS',
      );

      const litiges = await request(app.getHttpServer())
        .get('/transactions?statut=LITIGE')
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);
      expect(
        (litiges.body as TransactionDto[]).every((t) => t.statut === 'LITIGE'),
      ).toBe(true);

      const sorties = await request(app.getHttpServer())
        .get('/transactions?type=SORTIE_FONDS')
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);
      expect(
        (sorties.body as TransactionDto[]).every(
          (t) => t.type === 'SORTIE_FONDS',
        ),
      ).toBe(true);
    });

    it('GET /transactions/:id inclut bordereau et caisse', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        42,
      );
      const detail = await request(app.getHttpServer())
        .get(`/transactions/${transaction.id}`)
        .set('Authorization', `Bearer ${tokens.daf}`)
        .expect(200);
      const body = detail.body as {
        bordereau?: { montantDeclare: string };
        caisse?: { id: string };
      };
      expect(body.bordereau).toBeDefined();
      expect(Number(body.bordereau!.montantDeclare)).toBe(42);
      expect(body.caisse?.id).toBe(caisseBoutique1Id);
    });
  });

  describe('convoyeur, seuil DG et hors-ligne (§4 / §5.2 / §6.7)', () => {
    it('autorise un CONVOYEUR à passer une transaction EN_TRANSIT', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        120,
      );
      const enTransit = await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.convoyeurB1}`)
        .expect(200);
      expect((enTransit.body as TransactionDto).statut).toBe('EN_TRANSIT');
    });

    it('refuse (403) qu’un CONVOYEUR réceptionne ou rapproche', async () => {
      const transaction = await initierTransaction(
        tokens.caissierB1,
        caisseBoutique1Id,
        130,
      );
      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/transit`)
        .set('Authorization', `Bearer ${tokens.convoyeurB1}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/receptionner`)
        .set('Authorization', `Bearer ${tokens.convoyeurB1}`)
        .expect(403);
    });

    it('exige la Direction Générale pour valider un montant ≥ seuil', async () => {
      const societe = await env.prisma.societe.findFirst();
      if (!societe) {
        await env.prisma.societe.create({
          data: {
            raisonSociale: 'Test',
            adresse: 'Test',
            devise: 'XOF',
            seuilValidationDg: 1000,
          },
        });
      } else {
        await env.prisma.societe.update({
          where: { id: societe.id },
          data: { seuilValidationDg: 1000 },
        });
      }

      const transaction = await cycleJusquaReceptionnee(
        tokens.caissierB1,
        caisseBoutique1Id,
        5000,
        'SORTIE_FONDS',
      );

      await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.caissierCentral}`)
        .send({ montantRecu: 5000 })
        .expect(403);

      const validee = await request(app.getHttpServer())
        .patch(`/transactions/${transaction.id}/rapprocher`)
        .set('Authorization', `Bearer ${tokens.dg}`)
        .send({ montantRecu: 5000 })
        .expect(200);
      expect((validee.body as TransactionDto).statut).toBe('VALIDEE');
    });

    it('réutilise clientOperationId (idempotence hors-ligne)', async () => {
      const clientOperationId = 'op-offline-test-001';
      const first = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({
          caisseId: caisseBoutique1Id,
          type: 'VENTE',
          montant: 77,
          clientOperationId,
        })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${tokens.caissierB1}`)
        .send({
          caisseId: caisseBoutique1Id,
          type: 'VENTE',
          montant: 77,
          clientOperationId,
        })
        .expect(201);

      expect((second.body as TransactionDto).id).toBe(
        (first.body as TransactionDto).id,
      );
      const count = await env.prisma.transactionCaisse.count({
        where: { clientOperationId },
      });
      expect(count).toBe(1);
    });
  });
});
