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

describe('Transactions — machine à états §6.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique2Id: string;
  let caisseBoutique1Id: string; // AUXILIAIRE, boutique 1
  let caisseBoutique2Id: string; // AUXILIAIRE, boutique 2
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
  ): Promise<TransactionDto> {
    const response = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ caisseId, type: 'VENTE', montant })
      .expect(201);
    return response.body as TransactionDto;
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zone.id },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 2', adresse: 'Adresse 2', zoneId: zone.id },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;

    const caisseBoutique1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1Id },
    });
    const caisseBoutique2 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique2Id },
    });
    const caisseCentrale = await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });
    caisseBoutique1Id = caisseBoutique1.id;
    caisseBoutique2Id = caisseBoutique2.id;
    caisseCentraleId = caisseCentrale.id;

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutique1Id, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutique1Id, 3);
    await creerUtilisateur('caissier-b2', 'CAISSIER_BOUTIQUE', boutique2Id, 4);
    await creerUtilisateur('caissier-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('controle', 'CONTROLEUR_INTERNE', null, 1);

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
    tokens.caissierCentral = await login('caissier-central');
    tokens.daf = await login('daf');
    tokens.controle = await login('controle');
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
});
