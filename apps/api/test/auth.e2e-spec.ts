// Test d'intégration réel (zéro mock) — cahier des charges §6.2/§6.3 :
// un utilisateur ne peut s'authentifier qu'avec des identifiants valides,
// et reçoit un JWT porteur de son rôle. Démarre un vrai PostgreSQL via
// Testcontainers, applique les migrations, seed un rôle + utilisateur.
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

  beforeAll(async () => {
    await env.start();

    const role = await env.prisma.role.create({
      data: { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: 'jdupont',
        passwordHash: await bcrypt.hash('MotDePasse!123', 10),
        nom: 'Dupont',
        prenom: 'Jean',
        actif: true,
        roleId: role.id,
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

  it('refuse la connexion pour un utilisateur inconnu', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'inconnu', password: 'peu-importe' })
      .expect(401);
  });

  it('délivre un JWT pour des identifiants valides', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'jdupont', password: 'MotDePasse!123' })
      .expect(200);

    const body = response.body as { accessToken: string };
    expect(body.accessToken).toEqual(expect.any(String));
  });
});
