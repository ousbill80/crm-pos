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

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Caisses tiroirs grande surface (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let boutiqueId: string;
  const tokens: Record<string, string> = {};

  async function login(loginName: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginName, password: MOT_DE_PASSE })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function creerUtilisateur(
    loginName: string,
    roleLibelle: string,
    boutiqueIdArg: string | null,
  ): Promise<void> {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: loginName,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: loginName,
        actif: true,
        roleId: role.id,
        boutiqueId: boutiqueIdArg,
      },
    });
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone GS' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Grande Surface 1', adresse: 'Adr', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId,
        libelle: 'Cash office',
      },
    });
    await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });

    await creerUtilisateur('daf-tiroirs', 'DAF', null);
    await creerUtilisateur('resp-tiroirs', 'RESPONSABLE_BOUTIQUE', boutiqueId);
    await creerUtilisateur('si-tiroirs', 'RESPONSABLE_SI', null);

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

    tokens.daf = await login('daf-tiroirs');
    tokens.resp = await login('resp-tiroirs');
    tokens.si = await login('si-tiroirs');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it('DAF crée un tiroir', async () => {
    const res = await request(app.getHttpServer())
      .post('/caisses/tiroirs')
      .set('Authorization', `Bearer ${tokens.daf}`)
      .send({
        boutiqueId,
        code: 'T01',
        libelle: 'Tiroir caisse 1',
        ordreAffichage: 1,
      })
      .expect(201);
    const body = res.body as { type: string; code: string };
    expect(body.type).toBe('TIROIR');
    expect(body.code).toBe('T01');
  });

  it('Responsable boutique reçoit 403 sur création tiroir', async () => {
    await request(app.getHttpServer())
      .post('/caisses/tiroirs')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .send({ boutiqueId, code: 'T99', libelle: 'Interdit' })
      .expect(403);
  });

  it('Responsable SI peut créer un tiroir (ouverture magasin §6.7)', async () => {
    const res = await request(app.getHttpServer())
      .post('/caisses/tiroirs')
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ boutiqueId, code: 'T98', libelle: 'Tiroir SI' })
      .expect(201);
    expect((res.body as { code: string }).code).toBe('T98');
  });

  it('DAF désactive un tiroir', async () => {
    const created = await request(app.getHttpServer())
      .post('/caisses/tiroirs')
      .set('Authorization', `Bearer ${tokens.daf}`)
      .send({ boutiqueId, code: 'T02', libelle: 'T2' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/caisses/tiroirs/${(created.body as { id: string }).id}`)
      .set('Authorization', `Bearer ${tokens.daf}`)
      .send({ actif: false })
      .expect(200);
    expect((updated.body as { actif: boolean }).actif).toBe(false);
  });

  it('SORTIE_FONDS depuis un TIROIR est refusée', async () => {
    const tiroir = await env.prisma.caisse.findFirst({
      where: { boutiqueId, type: TypeCaisse.TIROIR, code: 'T01' },
    });
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .send({
        caisseId: tiroir!.id,
        type: 'SORTIE_FONDS',
        montant: 1000,
      })
      .expect(400);
  });
});
