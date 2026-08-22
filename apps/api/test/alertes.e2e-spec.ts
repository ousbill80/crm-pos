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
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
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

  it('STOCK_BAS ignore un produit inactif même sous son seuil', async () => {
    await env.prisma.produit.create({
      data: {
        designation: 'Produit inactif stock bas',
        prixUnitaire: '1000.00',
        stock: 1,
        seuilReappro: 5,
        actif: false,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);

    const body = response.body as AlerteDto[];
    const stockBas = body.filter((a) => a.type === 'STOCK_BAS');
    expect(
      stockBas.some((a) => a.message.includes('Produit inactif stock bas')),
    ).toBe(false);
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

  it("délai de versement configurable (Societe.delaiVersementHeures, §6.3.5) — un versement de 10h n'est en retard que si le seuil est abaissé sous 10h", async () => {
    const transactionRecente = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 150,
        statut: StatutTransaction.INITIEE,
        caisseId: caisseBoutique1Id,
        initiateurId: caissierB1Id,
        dateHeure: new Date(Date.now() - 10 * 60 * 60 * 1000),
      },
    });

    // Avec le délai par défaut (24h), ce versement de 10h n'est pas en retard.
    const avant = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
    expect(
      (avant.body as AlerteDto[]).some(
        (a) => a.entiteId === transactionRecente.id,
      ),
    ).toBe(false);

    const societe = await env.prisma.societe.findFirst();
    if (societe) {
      await env.prisma.societe.update({
        where: { id: societe.id },
        data: { delaiVersementHeures: 6 },
      });
    } else {
      await env.prisma.societe.create({
        data: {
          raisonSociale: 'Test Société',
          adresse: 'Adresse',
          delaiVersementHeures: 6,
        },
      });
    }

    // Une fois le seuil abaissé à 6h, ce même versement de 10h est en retard.
    const apres = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
    const alerte = (apres.body as AlerteDto[]).find(
      (a) => a.entiteId === transactionRecente.id,
    );
    expect(alerte).toBeDefined();
    expect(alerte?.message).toContain('(6 h)');
  });

  it("SLA litige (§5.1, 24 à 48 h) : un litige constaté il y a 10 h n'est pas en retard avec le délai par défaut (48 h)", async () => {
    const transactionLitige = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 300,
        statut: StatutTransaction.LITIGE,
        caisseId: caisseBoutique1Id,
        initiateurId: caissierB1Id,
      },
    });
    const bordereauLitige = await env.prisma.bordereauVersement.create({
      data: { transactionId: transactionLitige.id, montantDeclare: 300 },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereauLitige.id,
        montantRecu: 250,
        ecart: -50,
        statutFinal: StatutTransaction.LITIGE,
        validateurId: caissierB1Id,
        dateReception: new Date(Date.now() - 10 * 60 * 60 * 1000),
      },
    });

    const avant = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
    expect(
      (avant.body as AlerteDto[]).some(
        (a) =>
          a.type === 'LITIGE_EN_RETARD' && a.entiteId === transactionLitige.id,
      ),
    ).toBe(false);

    // Une fois le délai de régularisation abaissé à 6h, ce même litige de
    // 10h devient en retard.
    const societe = await env.prisma.societe.findFirst();
    if (!societe) throw new Error('société introuvable pour le test');
    await env.prisma.societe.update({
      where: { id: societe.id },
      data: { delaiRegularisationLitigeHeures: 6 },
    });

    const apres = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
    const alerteLitige = (apres.body as AlerteDto[]).find(
      (a) =>
        a.type === 'LITIGE_EN_RETARD' && a.entiteId === transactionLitige.id,
    );
    expect(alerteLitige).toBeDefined();
    expect(alerteLitige?.message).toContain('(6 h)');

    await env.prisma.societe.update({
      where: { id: societe.id },
      data: { delaiRegularisationLitigeHeures: 48 },
    });
  });

  it('seuil de caisse (§5.1) : aucune alerte SEUIL_CAISSE_DEPASSE tant que le seuil est désactivé (défaut null)', async () => {
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 600_000,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisseBoutique1Id,
        initiateurId: caissierB1Id,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
    expect(
      (response.body as AlerteDto[]).some(
        (a) => a.type === 'SEUIL_CAISSE_DEPASSE',
      ),
    ).toBe(false);
  });

  it('seuil de caisse (§5.1) : alerte SEUIL_CAISSE_DEPASSE une fois le seuil configuré et atteint', async () => {
    const societe = await env.prisma.societe.findFirst();
    if (!societe) throw new Error('société introuvable pour le test');
    await env.prisma.societe.update({
      where: { id: societe.id },
      data: { seuilVersementAnticipe: 500_000 },
    });

    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.central}`)
      .expect(200);
    const alerte = (response.body as AlerteDto[]).find(
      (a) =>
        a.type === 'SEUIL_CAISSE_DEPASSE' && a.entiteId === caisseBoutique1Id,
    );
    expect(alerte).toBeDefined();
    expect(alerte?.message).toContain('Boutique 1');

    // Visible aussi dans le périmètre du caissier de la boutique concernée.
    const responseBoutique = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${tokens.caissierB1}`)
      .expect(200);
    expect(
      (responseBoutique.body as AlerteDto[]).some(
        (a) =>
          a.type === 'SEUIL_CAISSE_DEPASSE' && a.entiteId === caisseBoutique1Id,
      ),
    ).toBe(true);

    await env.prisma.societe.update({
      where: { id: societe.id },
      data: { seuilVersementAnticipe: null },
    });
  });
});
