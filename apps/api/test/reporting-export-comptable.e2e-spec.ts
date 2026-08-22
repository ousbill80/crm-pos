// Tests d'intégration réels (zéro mock) — export comptable du grand livre
// (§6.3.4, §6.7) : uniquement les écritures VALIDEE, débit/crédit/solde
// courant cumulé chronologiquement.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-export-comptable-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split('\r\n')
    .map((line) => line.split(','));
}

describe('Export comptable du grand livre — §6.3.4/§6.7 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let caisseId: string;
  let caisseAutreId: string;
  let utilisateurId: string;

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
        nom: 'Test',
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
      data: { nomZone: 'Zone Export' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Export', adresse: 'Adresse', zoneId: zone.id },
    });
    const caisse = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique.id },
    });
    caisseId = caisse.id;

    const boutiqueAutre = await env.prisma.boutique.create({
      data: {
        nom: 'Boutique Export Autre',
        adresse: 'Adresse 2',
        zoneId: zone.id,
      },
    });
    const caisseAutre = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutiqueAutre.id },
    });
    caisseAutreId = caisseAutre.id;

    utilisateurId = await creerUtilisateur('export-daf', 'DAF', null, 1);
    await creerUtilisateur(
      'export-caissier',
      'CAISSIER_BOUTIQUE',
      boutique.id,
      4,
    );

    const base = new Date('2026-01-10T08:00:00.000Z');

    // Caisse principale : vente 1000 (crédit) puis sortie de fonds 300 (débit).
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 1000,
        statut: StatutTransaction.VALIDEE,
        caisseId,
        initiateurId: utilisateurId,
        dateHeure: base,
      },
    });
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 300,
        statut: StatutTransaction.VALIDEE,
        caisseId,
        initiateurId: utilisateurId,
        dateHeure: new Date(base.getTime() + 60_000),
      },
    });
    // Transaction non validée (LITIGE) : ne doit jamais apparaître dans le grand livre.
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 999,
        statut: StatutTransaction.LITIGE,
        caisseId,
        initiateurId: utilisateurId,
        dateHeure: new Date(base.getTime() + 120_000),
      },
    });

    // Autre caisse : vente 500 (crédit), doit être exclue quand on filtre par caisseId.
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 500,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisseAutreId,
        initiateurId: utilisateurId,
        dateHeure: new Date(base.getTime() + 30_000),
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

    tokens.daf = await login('export-daf');
    tokens.caissier = await login('export-caissier');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse CAISSIER_BOUTIQUE (hors périmètre réseau trésorerie) → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/export-comptable.csv')
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .expect(403);
  });

  it('exporte le grand livre filtré sur une caisse : débit/crédit/solde cumulé, écritures non VALIDEE exclues', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/export-comptable.csv')
      .query({ caisseId })
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');

    const rows = parseCsv(response.text);
    const header = rows[0];
    expect(header).toEqual([
      'Date',
      'Référence',
      'Journal',
      'Libellé',
      'Caisse',
      'Débit',
      'Crédit',
      'Solde courant',
    ]);

    const body = rows.slice(1);
    expect(body).toHaveLength(2);

    const [venteRow, sortieRow] = body;
    expect(venteRow[2]).toBe('Ventes');
    expect(venteRow[5]).toBe('0.00');
    expect(venteRow[6]).toBe('1000.00');
    expect(venteRow[7]).toBe('1000.00');

    expect(sortieRow[2]).toBe('Versements');
    expect(sortieRow[5]).toBe('300.00');
    expect(sortieRow[6]).toBe('0.00');
    expect(sortieRow[7]).toBe('700.00');
  });

  it('sans filtre caisseId : cumule toutes les caisses par ordre chronologique', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/export-comptable.csv')
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    const rows = parseCsv(response.text).slice(1);
    expect(rows).toHaveLength(3);
    // Ordre chronologique : vente caisse principale (1000), vente autre caisse (500), sortie (300).
    expect(rows[0][7]).toBe('1000.00');
    expect(rows[1][7]).toBe('1500.00');
    expect(rows[2][7]).toBe('1200.00');
  });
});
