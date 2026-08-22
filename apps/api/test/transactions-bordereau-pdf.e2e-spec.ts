// Tests d'intégration réels (zéro mock) — export PDF du bordereau de
// versement (§5.1), périmètre de lecture identique à GET /transactions/:id.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-bordereau-pdf-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

describe('Export PDF du bordereau de versement — §5.1 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let caisseId: string;
  let initiateurId: string;
  let validateurId: string;
  let transactionSansBordereauId: string;
  let transactionAvecBordereauId: string;
  let transactionReceptionneeId: string;

  const tokens: Record<string, string> = {};

  async function login(loginValue: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function creerUtilisateur(
    loginValue: string,
    roleLibelle: string,
    boutiqueId: string | null,
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
        nom: 'Dupont',
        prenom: loginValue,
        actif: true,
        roleId: role.id,
        boutiqueId,
      },
    });
    return utilisateur.id;
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Bordereau' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Bordereau', adresse: 'Adresse', zoneId: zone.id },
    });
    const caisse = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique.id },
    });
    caisseId = caisse.id;

    initiateurId = await creerUtilisateur(
      'bordereau-caissier',
      'CAISSIER_BOUTIQUE',
      boutique.id,
      4,
    );
    validateurId = await creerUtilisateur(
      'bordereau-central',
      'CAISSIER_CENTRAL',
      null,
      2,
    );
    await creerUtilisateur('bordereau-daf', 'DAF', null, 1);
    await creerUtilisateur('bordereau-crm', 'RESPONSABLE_CRM', null, 3);

    // Transaction VENTE : n'a jamais de bordereau associé.
    const venteSansBordereau = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 1000,
        statut: StatutTransaction.VALIDEE,
        caisseId,
        initiateurId,
      },
    });
    transactionSansBordereauId = venteSansBordereau.id;

    // Transaction SORTIE_FONDS émise, encore en transit (bordereau sans réception).
    const sortieEnTransit = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 50_000,
        statut: StatutTransaction.EN_TRANSIT,
        caisseId,
        initiateurId,
      },
    });
    transactionAvecBordereauId = sortieEnTransit.id;
    await env.prisma.bordereauVersement.create({
      data: { transactionId: sortieEnTransit.id, montantDeclare: 50_000 },
    });

    // Transaction SORTIE_FONDS réceptionnée et validée sans écart.
    const sortieValidee = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 30_000,
        statut: StatutTransaction.VALIDEE,
        caisseId,
        initiateurId,
      },
    });
    transactionReceptionneeId = sortieValidee.id;
    const bordereauValide = await env.prisma.bordereauVersement.create({
      data: { transactionId: sortieValidee.id, montantDeclare: 30_000 },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereauValide.id,
        montantRecu: 30_000,
        ecart: 0,
        statutFinal: StatutTransaction.VALIDEE,
        validateurId,
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

    tokens.daf = await login('bordereau-daf');
    tokens.central = await login('bordereau-central');
    tokens.crm = await login('bordereau-crm');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse RESPONSABLE_CRM (hors périmètre lecture caisses) → 403', async () => {
    await request(app.getHttpServer())
      .get(`/transactions/${transactionReceptionneeId}/bordereau/pdf`)
      .set('Authorization', `Bearer ${tokens.crm}`)
      .expect(403);
  });

  it('refuse une transaction sans bordereau (VENTE) → 400', async () => {
    await request(app.getHttpServer())
      .get(`/transactions/${transactionSansBordereauId}/bordereau/pdf`)
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(400);
  });

  it('génère le PDF pour un bordereau émis sans réception', async () => {
    const response = await request(app.getHttpServer())
      .get(`/transactions/${transactionAvecBordereauId}/bordereau/pdf`)
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(
      Buffer.isBuffer(response.body) ? response.body.length : 0,
    ).toBeGreaterThan(0);
  });

  it('génère le PDF pour un bordereau réceptionné et validé', async () => {
    const response = await request(app.getHttpServer())
      .get(`/transactions/${transactionReceptionneeId}/bordereau/pdf`)
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      `bordereau-versement-${transactionReceptionneeId}.pdf`,
    );
    expect(
      Buffer.isBuffer(response.body) ? response.body.length : 0,
    ).toBeGreaterThan(0);
  });

  it('renvoie 404 pour une transaction inexistante', async () => {
    await request(app.getHttpServer())
      .get('/transactions/00000000-0000-0000-0000-000000000000/bordereau/pdf')
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(404);
  });
});
