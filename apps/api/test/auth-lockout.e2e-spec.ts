// Test d'intégration réel (zéro mock) — verrouillage de compte après échecs
// répétés (§6.7 du cahier des charges : « tentative d'accès non autorisée »
// doit être détectable). Règle métier validée : 5 échecs consécutifs
// entraînent un verrouillage de 15 minutes, chaque échec et chaque
// verrouillage sont journalisés (append-only). Démarre un vrai PostgreSQL
// via Testcontainers.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Auth lockout (e2e)', () => {
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
        login: 'verrou',
        passwordHash: await bcrypt.hash('MotDePasse!123', 10),
        nom: 'Verrou',
        prenom: 'Test',
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

  it('verrouille le compte après 5 échecs consécutifs et journalise COMPTE_VERROUILLE', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'verrou', password: 'mauvais' })
        .expect(401);
    }

    const utilisateur = await env.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateurId },
    });
    expect(utilisateur.failedLoginAttempts).toBe(5);
    expect(utilisateur.lockedUntil).not.toBeNull();
    expect(utilisateur.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const entree = await env.prisma.journalAudit.findFirst({
      where: { utilisateurId, action: 'COMPTE_VERROUILLE' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(entree).not.toBeNull();
  });

  it('rejette une 6e tentative avec le bon mot de passe pendant la fenêtre de verrouillage', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'verrou', password: 'MotDePasse!123' })
      .expect(401);
  });

  it('autorise la connexion et réinitialise les compteurs après expiration du verrouillage', async () => {
    await env.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { lockedUntil: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'verrou', password: 'MotDePasse!123' })
      .expect(200);

    const utilisateur = await env.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateurId },
    });
    expect(utilisateur.failedLoginAttempts).toBe(0);
    expect(utilisateur.lockedUntil).toBeNull();
  });
});
