// Test d'intégration réel (zéro mock) — consultation du journal d'audit
// (§4, §6.7 du cahier des charges). Réservée à Responsable SI, DAF et
// Contrôleur interne (lecture + audit réseau entier) ; Direction Générale
// et Caissier boutique n'y ont explicitement pas accès. Le journal reste
// write-only ailleurs dans l'app (append-only) : ce module n'expose qu'une
// lecture paginée et filtrable.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Audit (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let utilisateurAuditId: string;

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
      },
    });
    return utilisateur.id;
  }

  beforeAll(async () => {
    await env.start();

    utilisateurAuditId = await creerUtilisateur(
      'si_audit',
      'RESPONSABLE_SI',
      9,
    );
    await creerUtilisateur('daf_audit', 'DAF', 8);
    await creerUtilisateur('controleur_audit', 'CONTROLEUR_INTERNE', 8);
    await creerUtilisateur('dg_audit', 'DIRECTION_GENERALE', 9);
    await creerUtilisateur('caissier_audit', 'CAISSIER_BOUTIQUE', 4);

    // 30 entrées d'audit de test pour vérifier la pagination.
    for (let i = 0; i < 30; i += 1) {
      await env.prisma.journalAudit.create({
        data: {
          utilisateurId: utilisateurAuditId,
          action: i % 2 === 0 ? 'LOGIN_REUSSI' : 'LOGIN_ECHEC',
          entite: 'Utilisateur',
          entiteId: utilisateurAuditId,
        },
      });
    }

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

    tokens.si = await login('si_audit');
    tokens.daf = await login('daf_audit');
    tokens.controleur = await login('controleur_audit');
    tokens.dg = await login('dg_audit');
    tokens.caissier = await login('caissier_audit');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it.each(['si', 'daf', 'controleur'])(
    'autorise la lecture du journal pour le rôle %s',
    async (role) => {
      await request(app.getHttpServer())
        .get('/audit')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(200);
    },
  );

  it('refuse la lecture du journal pour Direction Générale (403)', () => {
    return request(app.getHttpServer())
      .get('/audit')
      .set('Authorization', `Bearer ${tokens.dg}`)
      .expect(403);
  });

  it('refuse la lecture du journal pour un caissier boutique (403)', () => {
    return request(app.getHttpServer())
      .get('/audit')
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .expect(403);
  });

  it('pagine les résultats', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit')
      .query({ page: 1, limit: 10 })
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(200);

    const body = response.body as { data: unknown[]; total: number };
    expect(body.data).toHaveLength(10);
    expect(body.total).toBeGreaterThanOrEqual(30);
  });

  it('filtre par action', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit')
      .query({ action: 'LOGIN_ECHEC', limit: 100 })
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(200);

    const body = response.body as { data: Array<{ action: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((entree) => entree.action === 'LOGIN_ECHEC')).toBe(
      true,
    );
  });

  it('filtre par utilisateur', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit')
      .query({ utilisateurId: utilisateurAuditId, limit: 100 })
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(200);

    const body = response.body as {
      data: Array<{ utilisateurId: string }>;
    };
    expect(
      body.data.every((entree) => entree.utilisateurId === utilisateurAuditId),
    ).toBe(true);
  });
});
