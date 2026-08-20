// Tests d'intégration réels (zéro mock) — module Alertes §6.7.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-alertes-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

interface AlerteDto {
  type: string;
  severite: string;
  message: string;
  entiteId: string;
}

describe('Alertes automatiques — §6.7 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let caisseBoutique1Id: string;
  let caissierB1Id: string;

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
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneA.id },
    });
    boutique1Id = boutique1.id;

    const caisse1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1Id },
    });
    caisseBoutique1Id = caisse1.id;

    caissierB1Id = await creerUtilisateur(
      'alerte-caissier-b1',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
    );
    await creerUtilisateur('alerte-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('alerte-crm', 'RESPONSABLE_CRM', null, 1);

    // Litige = écart de caisse
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

    // Versement en retard (> 24 h, encore INITIEE)
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

    // Stock bas : produit sous son seuil de réapprovisionnement
    await env.prisma.produit.create({
      data: {
        designation: 'Produit stock bas',
        prixUnitaire: '1000.00',
        stock: 2,
        seuilReappro: 5,
      },
    });
    // Produit au-dessus du seuil : ne doit pas déclencher d'alerte
    await env.prisma.produit.create({
      data: {
        designation: 'Produit stock ok',
        prixUnitaire: '1000.00',
        stock: 50,
        seuilReappro: 5,
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

    tokens.caissierB1 = await login('alerte-caissier-b1');
    tokens.central = await login('alerte-central');
    tokens.crm = await login('alerte-crm');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse RESPONSABLE_CRM sur GET /alertes → 403 + journal ACCES_REFUSE', async () => {
    await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.crm}`)
      .expect(403);

    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'ACCES_REFUSE' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entite).toBe('ENDPOINT');
  });

  it('CAISSIER_CENTRAL voit écart + retard (+ accès refusé après le test précédent)', async () => {
    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);

    const body = response.body as AlerteDto[];
    const types = body.map((a) => a.type);
    expect(types).toContain('ECART_CAISSE');
    expect(types).toContain('VERSEMENT_EN_RETARD');
    expect(types).toContain('ACCES_REFUSE');
    expect(types).toContain('STOCK_BAS');
  });

  it('STOCK_BAS ne signale que les produits sous leur seuil de réapprovisionnement', async () => {
    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);

    const body = response.body as AlerteDto[];
    const stockBas = body.filter((a) => a.type === 'STOCK_BAS');
    expect(stockBas.some((a) => a.message.includes('Produit stock bas'))).toBe(
      true,
    );
    expect(stockBas.some((a) => a.message.includes('Produit stock ok'))).toBe(
      false,
    );
  });

  it('CAISSIER_BOUTIQUE voit écart/retard de sa boutique, pas les ACCES_REFUSE réseau', async () => {
    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.caissierB1}`)
      .expect(200);

    const body = response.body as AlerteDto[];
    expect(body.some((a) => a.type === 'ECART_CAISSE')).toBe(true);
    expect(body.some((a) => a.type === 'VERSEMENT_EN_RETARD')).toBe(true);
    expect(body.every((a) => a.type !== 'ACCES_REFUSE')).toBe(true);
  });
});
