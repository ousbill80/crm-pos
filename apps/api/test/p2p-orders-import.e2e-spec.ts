import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const PASSWORD = 'MotDePasse!123';
process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('P2P orders/import (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let societeId: string;
  let fournisseurId: string;
  let produitId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createUser(login: string, roleLibelle: string) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        nom: 'P2P',
        prenom: login,
        roleId: role.id,
      },
    });
  }

  async function login(loginValue: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  const payload = (clientOperationId = crypto.randomUUID()) => ({
    clientOperationId,
    societeId,
    fournisseurId,
    devise: 'USD',
    tauxChangeSnapshot: 600,
    incoterm: 'FOB',
    lieuOrigine: 'Shenzhen, CN',
    lieuDestination: 'Abidjan, CI',
    proformaReference: 'PI-2026-001',
    conditionsPaiement: '30% acompte, 70% avant embarquement',
    lignes: [{ produitId, quantite: 10, prixUnitaire: 100 }],
    echeancesPaiement: [
      { type: 'ACOMPTE', pourcentage: 30, ordre: 1 },
      { type: 'SOLDE', pourcentage: 70, ordre: 2 },
    ],
  });

  beforeAll(async () => {
    await env.start();
    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'Import Test', adresse: 'Abidjan', devise: 'XOF' },
    });
    societeId = societe.id;
    fournisseurId = (
      await env.prisma.fournisseur.create({
        data: { nom: 'Export Test', pays: 'CN' },
      })
    ).id;
    produitId = (
      await env.prisma.produit.create({
        data: { designation: 'Câble import', prixUnitaire: '2000' },
      })
    ).id;
    await createUser('orders-achats', 'ACHATS');
    await createUser('orders-logistique', 'LOGISTIQUE_TRANSIT_DOUANE');
    await createUser('orders-daf', 'DAF');
    await createUser('orders-caissier', 'CAISSIER_BOUTIQUE');

    const moduleFixture = await Test.createTestingModule({
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
    tokens.achats = await login('orders-achats');
    tokens.logistique = await login('orders-logistique');
    tokens.daf = await login('orders-daf');
    tokens.caissier = await login('orders-caissier');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse les rôles non autorisés et la progression avant approbation', async () => {
    await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.caissier))
      .send(payload())
      .expect(403);
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.achats))
      .send(payload())
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/production`)
      .set(auth(tokens.logistique))
      .send({ clientOperationId: crypto.randomUUID(), date: '2026-09-01' })
      .expect(400);
    expect(
      await env.prisma.journalAudit.count({
        where: {
          entiteId: id,
          action: 'COMMANDE_ACHAT_TRANSITION_REFUSEE',
        },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/approuver`)
      .set(auth(tokens.achats))
      .expect(403);
  });

  it('assure idempotence, numérotation séquentielle et snapshot du change', async () => {
    const operationId = crypto.randomUUID();
    const [first, replay] = await Promise.all([
      request(app.getHttpServer())
        .post('/achats/commandes')
        .set(auth(tokens.achats))
        .send(payload(operationId)),
      request(app.getHttpServer())
        .post('/achats/commandes')
        .set(auth(tokens.achats))
        .send(payload(operationId)),
    ]);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect((first.body as { id: string }).id).toBe(
      (replay.body as { id: string }).id,
    );
    expect(
      (first.body as { tauxChangeSnapshot: string }).tauxChangeSnapshot,
    ).toBe('600.000000');

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app.getHttpServer())
          .post('/achats/commandes')
          .set(auth(tokens.achats))
          .send(payload()),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const numeros = responses.map(
      (response) => (response.body as { numero: string }).numero,
    );
    expect(new Set(numeros).size).toBe(4);
  });

  it('versionne les avenants sans modifier les snapshots précédents et audite', async () => {
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.achats))
      .send(payload())
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/avenants`)
      .set(auth(tokens.achats))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'Quantité révisée',
        notes: 'Version 2',
      })
      .expect(201);
    expect(
      await env.prisma.commandeAchatVersion.count({
        where: { commandeId: id },
      }),
    ).toBe(2);
    const version = await env.prisma.commandeAchatVersion.findFirstOrThrow({
      where: { commandeId: id, version: 1 },
    });
    await expect(
      env.prisma.commandeAchatVersion.update({
        where: { id: version.id },
        data: { motif: 'altération interdite' },
      }),
    ).rejects.toThrow('append-only');
    expect(
      await env.prisma.journalAudit.count({
        where: { entite: 'CommandeAchat', entiteId: id },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('approuve, suit import/douane et calcule un coût rendu explicable', async () => {
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.achats))
      .send(payload())
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/soumettre`)
      .set(auth(tokens.achats))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/approuver`)
      .set(auth(tokens.daf))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/production`)
      .set(auth(tokens.logistique))
      .send({ clientOperationId: crypto.randomUUID(), date: '2026-09-01' })
      .expect(201);
    const shipment = await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/expeditions`)
      .set(auth(tokens.logistique))
      .send({
        clientOperationId: crypto.randomUUID(),
        mode: 'MARITIME',
        referenceTransport: 'SHP-001',
        dateChargement: '2026-09-10',
        eta: '2026-10-15',
        conteneurs: [{ numero: 'MSCU1234567', type: '40HQ' }],
      })
      .expect(201);
    const shipmentId = (shipment.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/expeditions/${shipmentId}/dossier/couts`)
      .set(auth(tokens.logistique))
      .send({
        clientOperationId: crypto.randomUUID(),
        type: 'FREIGHT',
        libelle: 'Fret maritime',
        montant: 100,
        devise: 'USD',
        tauxChangeSnapshot: 600,
      })
      .expect(201);
    const cost = await request(app.getHttpServer())
      .get(`/achats/commandes/${id}/cout-rendu`)
      .set(auth(tokens.daf))
      .expect(200);
    expect((cost.body as { totalLandedCost: string }).totalLandedCost).toBe(
      '660000.00',
    );
    expect((cost.body as { breakdown: unknown[] }).breakdown).toHaveLength(2);
  });
});
