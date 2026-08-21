// Test d'intégration réel (zéro mock) — cahier des charges §6.2/§6.3/§6.7 :
// un utilisateur ne peut s'authentifier qu'avec des identifiants valides,
// et reçoit un JWT porteur de son rôle. Chaque connexion réussie/échouée est
// journalisée (§6.7 « tentative d'accès non autorisée »), et le changement
// de mot de passe / la déconnexion sont exposés via l'API réelle. Démarre un
// vrai PostgreSQL via Testcontainers, applique les migrations, seed un rôle
// + utilisateur.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Auth (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let utilisateurId: string;

  beforeAll(async () => {
    await env.start();

    const role = await env.prisma.role.create({
      data: { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
    });
    const utilisateur = await env.prisma.utilisateur.create({
      data: {
        login: 'jdupont',
        passwordHash: await bcrypt.hash('MotDePasse!123', 10),
        nom: 'Dupont',
        prenom: 'Jean',
        actif: true,
        roleId: role.id,
      },
    });
    utilisateurId = utilisateur.id;

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
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it('refuse la connexion avec un mauvais mot de passe', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'jdupont', password: 'mauvais' })
      .expect(401);
  });

  it('journalise LOGIN_ECHEC pour un mot de passe erroné', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'jdupont', password: 'encore-mauvais' })
      .expect(401);

    const entree = await env.prisma.journalAudit.findFirst({
      where: { utilisateurId, action: 'LOGIN_ECHEC' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(entree).not.toBeNull();
  });

  it('refuse la connexion pour un utilisateur inconnu', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'inconnu', password: 'peu-importe' })
      .expect(401);
  });

  it('délivre un JWT pour des identifiants valides et journalise LOGIN_REUSSI', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'jdupont', password: 'MotDePasse!123' })
      .expect(200);

    const body = response.body as {
      accessToken: string;
      mustChangePassword: boolean;
    };
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.mustChangePassword).toBe(false);

    const entree = await env.prisma.journalAudit.findFirst({
      where: { utilisateurId, action: 'LOGIN_REUSSI' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(entree).not.toBeNull();
  });

  describe('POST /auth/change-password', () => {
    it('refuse un ancien mot de passe erroné', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'jdupont', password: 'MotDePasse!123' })
        .expect(200);
      const { accessToken } = loginResponse.body as { accessToken: string };

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ oldPassword: 'pas-la-bonne', newPassword: 'NouveauMdp!456' })
        .expect(401);
    });

    it('change le mot de passe et permet de se reconnecter avec le nouveau', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'jdupont', password: 'MotDePasse!123' })
        .expect(200);
      const { accessToken } = loginResponse.body as { accessToken: string };

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ oldPassword: 'MotDePasse!123', newPassword: 'NouveauMdp!456' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'jdupont', password: 'MotDePasse!123' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'jdupont', password: 'NouveauMdp!456' })
        .expect(200);

      const entree = await env.prisma.journalAudit.findFirst({
        where: { utilisateurId, action: 'MOT_DE_PASSE_CHANGE' },
        orderBy: { dateHeure: 'desc' },
      });
      expect(entree).not.toBeNull();
    });
  });

  describe('POST /auth/logout', () => {
    it('journalise la déconnexion', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'jdupont', password: 'NouveauMdp!456' })
        .expect(200);
      const { accessToken } = loginResponse.body as { accessToken: string };

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const entree = await env.prisma.journalAudit.findFirst({
        where: { utilisateurId, action: 'LOGIN_DECONNEXION' },
        orderBy: { dateHeure: 'desc' },
      });
      expect(entree).not.toBeNull();
    });
  });
});
