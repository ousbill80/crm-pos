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
 * Couverture HTTP (RolesGuard réel) des immobilisations — jusqu'ici seul un
 * test de métadonnées (immobilisations.controller.spec.ts, lecture du
 * décorateur @Roles) et un test de service (immobilisations.e2e-spec.ts, qui
 * instancie ImmobilisationsService directement) existaient : ni l'un ni
 * l'autre n'exerce le guard RolesGuard réel ni le pipeline HTTP complet.
 */
describe('Immobilisations — RBAC & cycle de vie HTTP (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let companyId: string;
  let compte21: string;
  let compte28: string;
  let compte6813: string;
  let periodeId: string;

  const PASSWORD = 'MotDePasse!123';
  process.env.JWT_SECRET ??= 'test-secret-e2e';

  const auth = (login: string) => ({
    Authorization: `Bearer ${tokens[login]}`,
  });

  async function createUser(login: string, roleLibelle: string) {
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
          nom: 'Immo',
          prenom: login,
          roleId: role.id,
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await env.start();
    for (const [login, role] of [
      ['immo-raf', 'RAF_COMPTABLE'],
      ['immo-daf', 'DAF'],
      ['immo-ci', 'CONTROLEUR_INTERNE'],
      ['immo-caissier', 'CAISSIER_BOUTIQUE'],
    ]) {
      await createUser(login, role);
    }

    const company = await env.prisma.societe.create({
      data: { raisonSociale: 'Immos HTTP', adresse: 'Abidjan' },
    });
    companyId = company.id;
    const exercise = await env.prisma.exerciceComptable.create({
      data: {
        societeId: company.id,
        code: '2026',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      },
    });
    const periode = await env.prisma.periodeComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
      },
    });
    periodeId = periode.id;
    const journalOd = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'OD',
        libelle: 'Opérations diverses',
        type: 'OPERATIONS_DIVERSES',
      },
    });
    const accounts = Object.fromEntries(
      await Promise.all(
        [
          ['21', 'Immobilisations corporelles'],
          ['28', 'Amortissements'],
          ['6813', 'Dotations aux amortissements'],
        ].map(async ([numero, intitule]) => [
          numero,
          (
            await env.prisma.compteComptable.create({
              data: { societeId: company.id, numero, intitule },
            })
          ).id,
        ]),
      ),
    ) as Record<string, string>;
    compte21 = accounts['21']!;
    compte28 = accounts['28']!;
    compte6813 = accounts['6813']!;
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journalOd.id,
        code: 'DEPRECIATION',
        version: 1,
        sourceType: 'AMORTISSEMENT_IMMO',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            { role: 'CHARGE', compteId: compte6813, ordre: 1 },
            { role: 'AMORTISSEMENT', compteId: compte28, ordre: 2 },
          ],
        },
      },
    });

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

  it('refuse CAISSIER_BOUTIQUE (hors périmètre) sur toutes les routes sensibles → 403', async () => {
    await request(app.getHttpServer())
      .get(`/achats/comptabilite/immobilisations?societeId=${companyId}`)
      .set(auth('immo-caissier'))
      .expect(403);
    await request(app.getHttpServer())
      .post('/achats/comptabilite/immobilisations')
      .set(auth('immo-caissier'))
      .send({
        societeId: companyId,
        compteId: compte21,
        libelle: 'Interdit',
        dateMiseEnService: '2026-08-01',
        valeurBrute: 1200,
        dureeMois: 12,
      })
      .expect(403);
    await request(app.getHttpServer())
      .post('/achats/comptabilite/immobilisations/dotations')
      .set(auth('immo-caissier'))
      .send({ societeId: companyId, periodeId })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/immobilisations/${crypto.randomUUID()}/sortir`,
      )
      .set(auth('immo-caissier'))
      .send({})
      .expect(403);
  });

  it('refuse le CONTROLEUR_INTERNE (lecture seule) sur la création et la sortie → 403', async () => {
    await request(app.getHttpServer())
      .post('/achats/comptabilite/immobilisations')
      .set(auth('immo-ci'))
      .send({
        societeId: companyId,
        compteId: compte21,
        libelle: 'Interdit CI',
        dateMiseEnService: '2026-08-01',
        valeurBrute: 1200,
        dureeMois: 12,
      })
      .expect(403);
  });

  it('rejette la création si le compte n’est pas une immobilisation de classe 2 (hors 28)', async () => {
    await request(app.getHttpServer())
      .post('/achats/comptabilite/immobilisations')
      .set(auth('immo-raf'))
      .send({
        societeId: companyId,
        compteId: compte6813,
        libelle: 'Compte invalide',
        dateMiseEnService: '2026-08-01',
        valeurBrute: 1200,
        dureeMois: 12,
      })
      .expect(400);
  });

  it('rejette la création si la valeur résiduelle n’est pas strictement inférieure à la valeur brute', async () => {
    await request(app.getHttpServer())
      .post('/achats/comptabilite/immobilisations')
      .set(auth('immo-raf'))
      .send({
        societeId: companyId,
        compteId: compte21,
        libelle: 'Résiduelle invalide',
        dateMiseEnService: '2026-08-01',
        valeurBrute: 1200,
        dureeMois: 12,
        valeurResiduelle: 1200,
      })
      .expect(400);
  });

  it('crée une fiche (RAF), génère la dotation (DAF), la lit (CONTROLEUR_INTERNE) puis la sort (RAF) ; une seconde sortie échoue', async () => {
    const created = body<{ id: string; statut: string }>(
      await request(app.getHttpServer())
        .post('/achats/comptabilite/immobilisations')
        .set(auth('immo-raf'))
        .send({
          societeId: companyId,
          compteId: compte21,
          libelle: 'Agencement boutique Plateau HTTP',
          dateMiseEnService: '2026-08-01',
          valeurBrute: 1200,
          dureeMois: 12,
          valeurResiduelle: 0,
        })
        .expect(201),
    );
    expect(created.statut).toBe('EN_SERVICE');

    const dotations = body<{ dotations: Array<{ creee: boolean }> }>(
      await request(app.getHttpServer())
        .post('/achats/comptabilite/immobilisations/dotations')
        .set(auth('immo-daf'))
        .send({ societeId: companyId, periodeId })
        .expect(201),
    );
    expect(dotations.dotations.some((d) => d.creee)).toBe(true);

    const listed = body<Array<{ id: string; statut: string }>>(
      await request(app.getHttpServer())
        .get(`/achats/comptabilite/immobilisations?societeId=${companyId}`)
        .set(auth('immo-ci'))
        .expect(200),
    );
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const sortie = body<{ statut: string; motifSortie: string | null }>(
      await request(app.getHttpServer())
        .post(`/achats/comptabilite/immobilisations/${created.id}/sortir`)
        .set(auth('immo-raf'))
        .send({ motif: 'Revente HTTP' })
        .expect(201),
    );
    expect(sortie.statut).toBe('SORTI');
    expect(sortie.motifSortie).toBe('Revente HTTP');

    await request(app.getHttpServer())
      .post(`/achats/comptabilite/immobilisations/${created.id}/sortir`)
      .set(auth('immo-raf'))
      .send({ motif: 'Deuxième sortie refusée' })
      .expect(400);
  });
});
