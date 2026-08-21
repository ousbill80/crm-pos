// Test d'intégration réel (zéro mock) — module Utilisateurs (§4, §6.2, §6.7
// du cahier des charges). Administration réservée à Responsable SI /
// Direction Générale, jamais de suppression physique (désactivation
// uniquement), mot de passe temporaire + changement forcé à la création et
// à la réinitialisation, chaque mutation journalisée (append-only).
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

describe('Utilisateurs (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let boutiqueId: string;
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
    boutiqueIdValue: string | null,
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
        boutiqueId: boutiqueIdValue,
      },
    });
    return utilisateur.id;
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    await creerUtilisateur('si_admin', 'RESPONSABLE_SI', null, 9);
    await creerUtilisateur('caissier1', 'CAISSIER_BOUTIQUE', boutiqueId, 4);

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

    tokens.si = await login('si_admin');
    tokens.caissier = await login('caissier1');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it('refuse la création d’utilisateur pour un rôle non habilité (403)', () => {
    return request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .send({
        login: 'intrus',
        nom: 'Intrus',
        prenom: 'Test',
        role: 'CAISSIER_BOUTIQUE',
        boutiqueId,
      })
      .expect(403);
  });

  let utilisateurCreeId: string;

  it('crée un utilisateur avec mustChangePassword=true et journalise UTILISATEUR_CREE', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({
        login: 'nouveau_caissier',
        nom: 'Nouveau',
        prenom: 'Caissier',
        role: 'CAISSIER_BOUTIQUE',
        boutiqueId,
      })
      .expect(201);

    const body = response.body as {
      id: string;
      mustChangePassword: boolean;
      temporaryPassword: string;
      passwordHash?: string;
    };
    expect(body.mustChangePassword).toBe(true);
    expect(body.temporaryPassword).toEqual(expect.any(String));
    expect(body.passwordHash).toBeUndefined();
    utilisateurCreeId = body.id;

    const entree = await env.prisma.journalAudit.findFirst({
      where: { entiteId: utilisateurCreeId, action: 'UTILISATEUR_CREE' },
    });
    expect(entree).not.toBeNull();

    const enBase = await env.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateurCreeId },
    });
    expect(enBase.mustChangePassword).toBe(true);
  });

  it('bloque un endpoint protégé quelconque tant que mustChangePassword=true', async () => {
    const role = await env.prisma.role.upsert({
      where: { libelle: 'CAISSIER_BOUTIQUE' },
      update: {},
      create: { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
    });
    const utilisateur = await env.prisma.utilisateur.create({
      data: {
        login: 'force_changement',
        passwordHash: await bcrypt.hash('TempMdp!789', 10),
        nom: 'Force',
        prenom: 'Changement',
        actif: true,
        roleId: role.id,
        boutiqueId,
        mustChangePassword: true,
      },
    });

    const forcedLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: 'force_changement', password: 'TempMdp!789' })
      .expect(200);
    const { accessToken, mustChangePassword } = forcedLogin.body as {
      accessToken: string;
      mustChangePassword: boolean;
    };
    expect(mustChangePassword).toBe(true);

    await request(app.getHttpServer())
      .get('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: 'TempMdp!789', newPassword: 'DefinitifMdp!012' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('désactive un utilisateur sans le supprimer physiquement et journalise UTILISATEUR_DESACTIVE', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${utilisateurCreeId}`)
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ actif: false })
      .expect(200);

    const enBase = await env.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateurCreeId },
    });
    expect(enBase.actif).toBe(false);

    const entree = await env.prisma.journalAudit.findFirst({
      where: { entiteId: utilisateurCreeId, action: 'UTILISATEUR_DESACTIVE' },
    });
    expect(entree).not.toBeNull();
  });

  it('réinitialise le mot de passe sans jamais journaliser le mot de passe en clair', async () => {
    const response = await request(app.getHttpServer())
      .post(`/users/${utilisateurCreeId}/reset-password`)
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({})
      .expect(201);

    const body = response.body as { temporaryPassword: string };
    expect(body.temporaryPassword).toEqual(expect.any(String));

    const entree = await env.prisma.journalAudit.findFirst({
      where: {
        entiteId: utilisateurCreeId,
        action: 'MOT_DE_PASSE_REINITIALISE',
      },
    });
    expect(entree).not.toBeNull();
    expect(entree?.details ?? '').not.toContain(body.temporaryPassword);

    const enBase = await env.prisma.utilisateur.findUniqueOrThrow({
      where: { id: utilisateurCreeId },
    });
    expect(enBase.mustChangePassword).toBe(true);
  });
});
