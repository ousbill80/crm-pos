// Tests d'intégration réels (zéro mock) — idempotence hors-ligne de
// l'ouverture de session de caisse (§6.7 : file d'ops POS idempotentes,
// rejeu sans doublon à la resynchronisation). Démarre un vrai PostgreSQL
// via Testcontainers, seed une organisation minimale et authentifie via
// le vrai endpoint /auth/login.
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

interface SessionCaisseDto {
  id: string;
  statut: string;
  caisseId: string;
  clientOperationId: string | null;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('SessionCaisse — idempotence hors-ligne clientOperationId (§6.7) (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutiqueId: string;
  let caisseTiroirId: string;

  const tokens: Record<string, string> = {};

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

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
    boutiqueIdCible: string | null,
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
        boutiqueId: boutiqueIdCible,
      },
    });
    return utilisateur.id;
  }

  function ouvrirSession(
    token: string,
    body: {
      caisseId: string;
      fondInitial: number;
      temoinLogin: string;
      temoinPassword?: string;
      clientOperationId?: string;
    },
  ) {
    return request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(token))
      .send({
        caisseId: body.caisseId,
        fondInitial: body.fondInitial,
        temoinLogin: body.temoinLogin,
        temoinPassword: body.temoinPassword ?? MOT_DE_PASSE,
        clientOperationId: body.clientOperationId,
      });
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B1',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId,
      },
    });

    await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId,
        libelle: 'Magasin B1',
      },
    });
    const tiroir = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId,
        code: 'T01',
        libelle: 'Tiroir 1',
        actif: true,
        ordreAffichage: 1,
      },
    });
    caisseTiroirId = tiroir.id;

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutiqueId, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutiqueId, 3);

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
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  afterEach(async () => {
    // Isolation entre tests : chaque cas doit repartir sans session ouverte.
    await env.prisma.sessionCaisse.deleteMany({
      where: { caisseId: caisseTiroirId },
    });
  });

  it('rejoue POST /ventes/sessions avec le même clientOperationId → renvoie la session existante sans doublon', async () => {
    const clientOperationId = '11111111-1111-4111-8111-111111111111';

    const first = await ouvrirSession(tokens.caissierB1, {
      caisseId: caisseTiroirId,
      fondInitial: 5000,
      temoinLogin: 'resp-b1',
      clientOperationId,
    }).expect(201);
    const firstBody = first.body as SessionCaisseDto;
    expect(firstBody.clientOperationId).toBe(clientOperationId);

    const replay = await ouvrirSession(tokens.caissierB1, {
      caisseId: caisseTiroirId,
      fondInitial: 5000,
      temoinLogin: 'resp-b1',
      clientOperationId,
    }).expect(201);
    const replayBody = replay.body as SessionCaisseDto;

    expect(replayBody.id).toBe(firstBody.id);

    const total = await env.prisma.sessionCaisse.count({
      where: { clientOperationId },
    });
    expect(total).toBe(1);
  });

  it('rejette (409) un clientOperationId différent alors qu’une session est déjà OUVERTE sur la même caisse, avec entrée d’audit SESSION_CONFLIT_HORS_LIGNE', async () => {
    const premierId = '22222222-2222-4222-8222-222222222222';
    const secondId = '33333333-3333-4333-8333-333333333333';

    await ouvrirSession(tokens.caissierB1, {
      caisseId: caisseTiroirId,
      fondInitial: 1000,
      temoinLogin: 'resp-b1',
      clientOperationId: premierId,
    }).expect(201);

    const conflit = await ouvrirSession(tokens.caissierB1, {
      caisseId: caisseTiroirId,
      fondInitial: 1000,
      temoinLogin: 'resp-b1',
      clientOperationId: secondId,
    });
    expect(conflit.status).toBe(409);

    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'SESSION_CONFLIT_HORS_LIGNE' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.details).toContain(secondId);

    const total = await env.prisma.sessionCaisse.count({
      where: { caisseId: caisseTiroirId },
    });
    expect(total).toBe(1);
  });
});
