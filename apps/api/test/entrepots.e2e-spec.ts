import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body } from './utils/http';

/**
 * Entrepôts — aucune couverture n'existait jusqu'ici (ni RBAC HTTP, ni
 * isolement de périmètre de données). Ce test prouve, via de vraies requêtes
 * HTTP contre un vrai PostgreSQL : le 403 pour les rôles hors
 * ROLES_ADMIN_STRUCTURE / ROLES_LECTURE_STRUCTURE, et surtout l'isolement de
 * périmètre (§4, §6.2) de `EntrepotsService.scopeWhere` : une boutique ne
 * voit que son propre entrepôt, un superviseur de zone ne voit que sa zone,
 * et les rôles réseau voient tout.
 */
describe('Entrepôts — RBAC & isolement de périmètre (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let zoneA: string;
  let zoneB: string;
  let boutiqueA: string;
  let boutiqueB: string;
  let boutiqueZoneB: string;

  const PASSWORD = 'MotDePasse!123';
  process.env.JWT_SECRET ??= 'test-secret-e2e';

  const auth = (login: string) => ({
    Authorization: `Bearer ${tokens[login]}`,
  });

  async function createUser(
    login: string,
    roleLibelle: string,
    boutiqueId: string | null = null,
  ) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    userIds[login] = (
      await env.prisma.utilisateur.create({
        data: {
          login,
          passwordHash: await bcrypt.hash(PASSWORD, 10),
          nom: 'Entrepot',
          prenom: login,
          roleId: role.id,
          boutiqueId,
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await env.start();

    const za = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const zb = await env.prisma.zone.create({ data: { nomZone: 'Zone B' } });
    zoneA = za.id;
    zoneB = zb.id;
    boutiqueA = (
      await env.prisma.boutique.create({
        data: { nom: 'Boutique A', adresse: 'Abidjan', zoneId: zoneA },
      })
    ).id;
    boutiqueB = (
      await env.prisma.boutique.create({
        data: { nom: 'Boutique B', adresse: 'Abidjan', zoneId: zoneA },
      })
    ).id;
    boutiqueZoneB = (
      await env.prisma.boutique.create({
        data: { nom: 'Boutique Zone B', adresse: 'Bouaké', zoneId: zoneB },
      })
    ).id;

    await createUser('ent-si', 'RESPONSABLE_SI');
    await createUser('ent-daf', 'DAF');
    await createUser('ent-superviseur-a', 'SUPERVISEUR_ZONE', boutiqueA);
    await createUser('ent-caissier-a', 'CAISSIER_BOUTIQUE', boutiqueA);
    await createUser('ent-caissier-b', 'CAISSIER_BOUTIQUE', boutiqueB);
    await createUser('ent-crm', 'RESPONSABLE_CRM');

    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(env.prisma)
      .compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    for (const login of Object.keys(userIds)) {
      tokens[login] = body<{ accessToken: string }>(
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ login, password: PASSWORD })
          .expect(200),
      ).accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse RESPONSABLE_CRM (hors périmètre structure) sur GET et POST /entrepots → 403', async () => {
    await request(app.getHttpServer())
      .get('/entrepots')
      .set(auth('ent-crm'))
      .expect(403);
    await request(app.getHttpServer())
      .post('/entrepots')
      .set(auth('ent-crm'))
      .send({ nom: 'Dépôt interdit', code: 'INTERDIT', boutiqueId: boutiqueA })
      .expect(403);
  });

  it('refuse CAISSIER_BOUTIQUE (hors ROLES_ADMIN_STRUCTURE) sur POST et PATCH /entrepots → 403', async () => {
    await request(app.getHttpServer())
      .post('/entrepots')
      .set(auth('ent-caissier-a'))
      .send({ nom: 'Dépôt interdit', code: 'INTERDIT2', boutiqueId: boutiqueA })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/entrepots/${crypto.randomUUID()}`)
      .set(auth('ent-caissier-a'))
      .send({ nom: 'Renommage interdit' })
      .expect(403);
  });

  it('RESPONSABLE_SI crée un entrepôt pour chaque boutique, audité, et rejette le code dupliqué', async () => {
    const created = body<{ id: string; code: string }>(
      await request(app.getHttpServer())
        .post('/entrepots')
        .set(auth('ent-si'))
        .send({ nom: 'Dépôt A', code: 'DEPOT-A', boutiqueId: boutiqueA })
        .expect(201),
    );
    expect(created.code).toBe('DEPOT-A');
    await request(app.getHttpServer())
      .post('/entrepots')
      .set(auth('ent-si'))
      .send({ nom: 'Dépôt A bis', code: 'DEPOT-A', boutiqueId: boutiqueA })
      .expect(409);

    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'ENTREPOT_CREATED', entiteId: created.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.utilisateurId).toBe(userIds['ent-si']);

    await request(app.getHttpServer())
      .post('/entrepots')
      .set(auth('ent-daf'))
      .send({ nom: 'Dépôt B', code: 'DEPOT-B', boutiqueId: boutiqueB })
      .expect(201);
    await request(app.getHttpServer())
      .post('/entrepots')
      .set(auth('ent-si'))
      .send({
        nom: 'Dépôt Zone B',
        code: 'DEPOT-ZB',
        boutiqueId: boutiqueZoneB,
      })
      .expect(201);
  });

  it('isole le périmètre de lecture : boutique A ne voit que son entrepôt, pas celui de boutique B', async () => {
    const seenByA = body<Array<{ boutiqueId: string }>>(
      await request(app.getHttpServer())
        .get('/entrepots')
        .set(auth('ent-caissier-a'))
        .expect(200),
    );
    expect(seenByA.every((row) => row.boutiqueId === boutiqueA)).toBe(true);
    expect(seenByA.length).toBeGreaterThan(0);

    const seenByB = body<Array<{ boutiqueId: string }>>(
      await request(app.getHttpServer())
        .get('/entrepots')
        .set(auth('ent-caissier-b'))
        .expect(200),
    );
    expect(seenByB.every((row) => row.boutiqueId === boutiqueB)).toBe(true);
  });

  it('refuse à une boutique de filtrer explicitement sur une autre boutique (?boutiqueId=) → 403', async () => {
    await request(app.getHttpServer())
      .get(`/entrepots?boutiqueId=${boutiqueB}`)
      .set(auth('ent-caissier-a'))
      .expect(403);
  });

  it('isole le périmètre de zone : le superviseur de la zone A ne voit pas les entrepôts de la zone B', async () => {
    const seenBySuperviseur = body<Array<{ boutiqueId: string }>>(
      await request(app.getHttpServer())
        .get('/entrepots')
        .set(auth('ent-superviseur-a'))
        .expect(200),
    );
    expect(
      seenBySuperviseur.every((row) =>
        [boutiqueA, boutiqueB].includes(row.boutiqueId),
      ),
    ).toBe(true);
    expect(
      seenBySuperviseur.some((row) => row.boutiqueId === boutiqueZoneB),
    ).toBe(false);
  });

  it('les rôles réseau (RESPONSABLE_SI) voient les entrepôts des deux zones', async () => {
    const seenByReseau = body<Array<{ boutiqueId: string }>>(
      await request(app.getHttpServer())
        .get('/entrepots')
        .set(auth('ent-si'))
        .expect(200),
    );
    expect(seenByReseau.some((row) => row.boutiqueId === boutiqueA)).toBe(true);
    expect(seenByReseau.some((row) => row.boutiqueId === boutiqueZoneB)).toBe(
      true,
    );
  });

  it('RESPONSABLE_SI met à jour un entrepôt (désactivation), audité', async () => {
    const list = body<Array<{ id: string; boutiqueId: string }>>(
      await request(app.getHttpServer())
        .get(`/entrepots?boutiqueId=${boutiqueA}`)
        .set(auth('ent-si'))
        .expect(200),
    );
    const target = list[0];
    const updated = body<{ actif: boolean }>(
      await request(app.getHttpServer())
        .patch(`/entrepots/${target.id}`)
        .set(auth('ent-si'))
        .send({ actif: false })
        .expect(200),
    );
    expect(updated.actif).toBe(false);
    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'ENTREPOT_UPDATED', entiteId: target.id },
    });
    expect(audit).not.toBeNull();
  });
});
