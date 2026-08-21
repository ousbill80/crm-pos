// Cockpit Finance DAF — GET /reporting/daf (§6.2 / §6.3.4).
// RBAC pôle central uniquement ; agrégats réels (zéro mock).
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

process.env.JWT_SECRET ??= 'test-secret-reporting-daf-e2e';

interface ReportingDafDto {
  perimetre: 'RESEAU';
  resultat: {
    caNet: string;
    cmv: string;
    margeBrute: string;
    tauxMarge: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      chiffreAffairesNet: string;
      coutDesVentes: string;
      margeBrute: string;
    }>;
  };
  stocks: {
    valeurTotale: string;
    ruptures: number;
    sousSeuil: number;
    parBoutique: Array<{ boutiqueId: string; valeur: string; unites: number }>;
  };
  tresorerie: {
    soldeMagasins: string;
    soldeTiroirs: string;
    soldeCentrale: string;
    cashConseille: string;
  };
  analyse: {
    margeSurStock: string | null;
    rotationIndicateur: string | null;
    alertes: Array<{ code: string; severite: string }>;
  };
}

describe('Reporting — cockpit Finance DAF §6.3.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique2Id: string;
  let caisseMagasin1Id: string;

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
      data: { nomZone: 'Zone DAF' },
    });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique DAF 1', adresse: 'A1', zoneId: zone.id },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique DAF 2', adresse: 'A2', zoneId: zone.id },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;

    const magasin1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
    });
    caisseMagasin1Id = magasin1.id;
    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique2Id },
    });
    await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });

    const entrepot1 = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B1',
        code: 'PRIN',
        type: 'PRINCIPAL',
        boutiqueId: boutique1Id,
      },
    });
    await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B2',
        code: 'PRIN',
        type: 'PRINCIPAL',
        boutiqueId: boutique2Id,
      },
    });

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Produit DAF',
        prixUnitaire: '5000.00',
        coutMoyenPondere: '2000.00',
        stock: 10,
        seuilReappro: 2,
      },
    });
    await env.prisma.stockQuant.create({
      data: {
        produitId: produit.id,
        entrepotId: entrepot1.id,
        quantite: 10,
      },
    });

    const caissierId = await creerUtilisateur(
      'daf-caissier-b1',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
    );
    const temoinId = await creerUtilisateur(
      'daf-temoin-b1',
      'RESPONSABLE_BOUTIQUE',
      boutique1Id,
      3,
    );
    await creerUtilisateur('daf-daf', 'DAF', null, 1);
    await creerUtilisateur('daf-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur(
      'daf-resp-b2',
      'RESPONSABLE_BOUTIQUE',
      boutique2Id,
      3,
    );

    const session = await env.prisma.sessionCaisse.create({
      data: {
        caisseId: caisseMagasin1Id,
        fondInitial: 0,
        ouvertureUtilisateurId: caissierId,
        ouvertureTemoinId: temoinId,
      },
    });

    await env.prisma.vente.create({
      data: {
        montantTotal: '5000.00',
        modePaiement: 'ESPECES',
        caisseId: caisseMagasin1Id,
        sessionCaisseId: session.id,
        lignes: {
          create: [
            {
              produitId: produit.id,
              quantite: 1,
              prixUnitaire: '5000.00',
              remise: '0.00',
              coutUnitaire: '2000.00',
            },
          ],
        },
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
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    tokens.daf = await login('daf-daf');
    tokens.central = await login('daf-central');
    tokens.resp = await login('daf-resp-b2');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse RESPONSABLE_BOUTIQUE → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/daf')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .expect(403);
  });

  it('DAF reçoit le cockpit consolidé (résultat + stocks + trésorerie)', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/daf')
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    const body = res.body as ReportingDafDto;
    expect(body.perimetre).toBe('RESEAU');
    expect(Number(body.resultat.caNet)).toBe(5000);
    expect(Number(body.resultat.cmv)).toBe(2000);
    expect(Number(body.resultat.margeBrute)).toBe(3000);
    expect(body.resultat.parBoutique.length).toBeGreaterThanOrEqual(1);

    const sommeCa = body.resultat.parBoutique.reduce(
      (s, b) => s + Number(b.chiffreAffairesNet),
      0,
    );
    expect(sommeCa).toBe(Number(body.resultat.caNet));

    expect(Number(body.stocks.valeurTotale)).toBe(20000); // 10 × 2000
    expect(body.stocks.parBoutique.length).toBeGreaterThanOrEqual(1);

    expect(body.tresorerie).toMatchObject({
      soldeMagasins: expect.any(String) as string,
      soldeTiroirs: expect.any(String) as string,
      soldeCentrale: expect.any(String) as string,
      cashConseille: expect.any(String) as string,
    });
    expect(body.analyse.margeSurStock).not.toBeNull();
    expect(body.analyse.rotationIndicateur).not.toBeNull();
  });

  it('CAISSIER_CENTRAL peut lire le cockpit DAF', async () => {
    await request(app.getHttpServer())
      .get('/reporting/daf')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
  });

  it('export CSV DAF — en-têtes + ligne boutique', async () => {
    const res = await request(app.getHttpServer())
      .get('/reporting/daf/export.csv')
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const csv = res.text;
    expect(csv).toContain('Boutique');
    expect(csv).toContain('CA net');
    expect(csv).toContain('Valeur stock');
    expect(csv).toContain('Boutique DAF 1');
  });

  it('refuse export CSV pour RESPONSABLE_BOUTIQUE → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/daf/export.csv')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .expect(403);
  });
});
