// Tests d'intégration réels (zéro mock) — module Reporting §6.3.4.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import {
  SegmentClient,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

// AuthModule exige JWT_SECRET (ConfigModule ne charge pas .env en e2e isolé).
process.env.JWT_SECRET ??= 'test-secret-reporting-e2e';

interface DashboardDto {
  perimetre: 'RESEAU' | 'ZONE' | 'BOUTIQUE';
  genereAt: string;
  chiffreAffaires: {
    total: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      montant: string;
    }>;
  };
  versements: {
    parStatut: Array<{ statut: string; nombre: number; montant: string }>;
    enRetard24h: number;
  };
  ecarts: { nombreLitiges: number; montantEcartsAbsolus: string };
  tresorerie: {
    totalSoldesAuxiliaires: string;
    caisses: Array<{ caisseId: string; solde: string }>;
  };
  crm: {
    nombreClients: number;
    parSegment: Array<{ segment: string; nombre: number }>;
  };
}

describe('Reporting — dashboard §6.3.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique3Id: string;
  let caisseBoutique1Id: string;
  let caisseBoutique3Id: string;

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

    const zoneA = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const zoneB = await env.prisma.zone.create({ data: { nomZone: 'Zone B' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneA.id },
    });
    const boutique3 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 3', adresse: 'Adresse 3', zoneId: zoneB.id },
    });
    boutique1Id = boutique1.id;
    boutique3Id = boutique3.id;

    const caisse1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1Id },
    });
    const caisse3 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique3Id },
    });
    await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });
    caisseBoutique1Id = caisse1.id;
    caisseBoutique3Id = caisse3.id;

    const caissierB1Id = await creerUtilisateur(
      'rep-caissier-b1',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
    );
    await creerUtilisateur('rep-caissier-b3', 'CAISSIER_BOUTIQUE', boutique3Id, 4);
    await creerUtilisateur('rep-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('rep-daf', 'DAF', null, 1);
    await creerUtilisateur('rep-crm', 'RESPONSABLE_CRM', null, 1);
    await creerUtilisateur(
      'rep-superviseur-a',
      'SUPERVISEUR_ZONE',
      boutique1Id,
      2,
    );

    await env.prisma.vente.create({
      data: {
        caisseId: caisseBoutique1Id,
        montantTotal: 10000,
        dateVente: new Date(),
      },
    });
    await env.prisma.vente.create({
      data: {
        caisseId: caisseBoutique3Id,
        montantTotal: 4000,
        dateVente: new Date(),
      },
    });

    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 10000,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisseBoutique1Id,
        initiateurId: caissierB1Id,
      },
    });
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 4000,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisseBoutique3Id,
        initiateurId: caissierB1Id,
      },
    });

    const litige = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 500,
        statut: StatutTransaction.LITIGE,
        caisseId: caisseBoutique1Id,
        initiateurId: caissierB1Id,
      },
    });
    const bordereau = await env.prisma.bordereauVersement.create({
      data: {
        transactionId: litige.id,
        montantDeclare: 500,
      },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereau.id,
        montantRecu: 450,
        ecart: -50,
        statutFinal: StatutTransaction.LITIGE,
        validateurId: caissierB1Id,
      },
    });

    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 200,
        statut: StatutTransaction.INITIEE,
        caisseId: caisseBoutique1Id,
        initiateurId: caissierB1Id,
        dateHeure: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });

    await env.prisma.client.create({
      data: { nom: 'Client', prenom: 'Un', segment: SegmentClient.NOUVEAU },
    });
    await env.prisma.client.create({
      data: { nom: 'Client', prenom: 'Deux', segment: SegmentClient.VIP },
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

    tokens.caissierB1 = await login('rep-caissier-b1');
    tokens.caissierB3 = await login('rep-caissier-b3');
    tokens.central = await login('rep-central');
    tokens.daf = await login('rep-daf');
    tokens.crm = await login('rep-crm');
    tokens.superviseurA = await login('rep-superviseur-a');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse RESPONSABLE_CRM (hors ROLES_LECTURE_CAISSES) → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/dashboard')
      .set('Authorization', `Bearer ${tokens.crm}`)
      .expect(403);
  });

  it('CAISSIER_CENTRAL voit le réseau (CA 14000, litige, retard, CRM)', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/dashboard')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);

    const body = response.body as DashboardDto;
    expect(body.perimetre).toBe('RESEAU');
    expect(body.chiffreAffaires.total).toBe('14000.00');
    expect(body.chiffreAffaires.parBoutique).toHaveLength(2);
    expect(body.ecarts.nombreLitiges).toBe(1);
    expect(body.ecarts.montantEcartsAbsolus).toBe('50.00');
    expect(body.versements.enRetard24h).toBe(1);
    expect(body.crm.nombreClients).toBe(2);
    expect(
      body.tresorerie.caisses.some((c) => c.caisseId === caisseBoutique1Id),
    ).toBe(true);
    expect(
      body.tresorerie.caisses.some((c) => c.caisseId === caisseBoutique3Id),
    ).toBe(true);
  });

  it('CAISSIER_BOUTIQUE ne voit que sa boutique', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/dashboard')
      .set('Authorization', `Bearer ${tokens.caissierB1}`)
      .expect(200);

    const body = response.body as DashboardDto;
    expect(body.perimetre).toBe('BOUTIQUE');
    expect(body.chiffreAffaires.total).toBe('10000.00');
    expect(body.chiffreAffaires.parBoutique).toEqual([
      expect.objectContaining({ boutiqueId: boutique1Id, montant: '10000.00' }),
    ]);
    expect(
      body.tresorerie.caisses.every((c) => c.caisseId !== caisseBoutique3Id),
    ).toBe(true);
    expect(body.ecarts.nombreLitiges).toBe(1);
  });

  it('SUPERVISEUR_ZONE A ne voit pas la zone B', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/dashboard')
      .set('Authorization', `Bearer ${tokens.superviseurA}`)
      .expect(200);

    const body = response.body as DashboardDto;
    expect(body.perimetre).toBe('ZONE');
    expect(body.chiffreAffaires.total).toBe('10000.00');
    expect(
      body.chiffreAffaires.parBoutique.every((b) => b.boutiqueId !== boutique3Id),
    ).toBe(true);
  });
});
