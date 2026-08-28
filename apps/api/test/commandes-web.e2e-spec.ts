// Commandes web staff — fulfillment + RBAC + conversion POS (PLAN-E-COMMERCE Lot 5/9).
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { shopPanierCookie } from './utils/http';

const MOT_DE_PASSE = 'MotDePasse!123';
process.env.JWT_SECRET ??= 'test-secret-cmd-web-e2e';
process.env.EMAIL_PROVIDER = 'mock';

jest.setTimeout(120_000);

describe('Commandes web staff (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let boutiqueId: string;
  let produitId: string;
  let entrepotId: string;

  async function login(loginValue: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function creerUser(
    loginValue: string,
    role: string,
    boutique: string | null,
  ) {
    const r = await env.prisma.role.upsert({
      where: { libelle: role },
      update: {},
      create: { libelle: role, niveauHabilitation: 3 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: loginValue,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'T',
        prenom: loginValue,
        actif: true,
        roleId: r.id,
        boutiqueId: boutique,
      },
    });
  }

  beforeAll(async () => {
    await env.start();
    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'Cmd Web', adresse: 'X' },
    });
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'B', adresse: 'A', zoneId: zone.id, retraitWebActif: true },
    });
    boutiqueId = boutique.id;
    entrepotId = (
      await env.prisma.entrepot.create({
        data: { nom: 'E', code: 'E1', boutiqueId },
      })
    ).id;
    await env.prisma.parametreShop.create({
      data: {
        societeId: societe.id,
        shopActif: true,
        entrepotWebDefautId: entrepotId,
        retraitActif: true,
      },
    });
    produitId = (
      await env.prisma.produit.create({
        data: {
          designation: 'Article',
          prixUnitaire: 4000,
          prixWeb: 4200,
          visibleWeb: true,
          slug: 'art-cmd',
          stock: 10,
        },
      })
    ).id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId, quantite: 5 },
    });

    await creerUser('cmd-si', 'RESPONSABLE_SI', null);
    await creerUser('cmd-ctrl', 'CONTROLEUR_INTERNE', null);
    await creerUser('cmd-caissier', 'CAISSIER_BOUTIQUE', boutiqueId);

    const caissier = await env.prisma.utilisateur.findUniqueOrThrow({
      where: { login: 'cmd-caissier' },
    });
    const caisse = await env.prisma.caisse.create({
      data: {
        type: 'TIROIR',
        boutiqueId,
        code: 'T1',
        libelle: 'Tiroir test',
      },
    });
    await env.prisma.sessionCaisse.create({
      data: {
        caisseId: caisse.id,
        statut: 'OUVERTE',
        fondInitial: 0,
        ouvertureUtilisateurId: caissier.id,
        ouvertureTemoinId: caissier.id,
      },
    });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    tokens.si = await login('cmd-si');
    tokens.ctrl = await login('cmd-ctrl');
    tokens.caissier = await login('cmd-caissier');
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  let commandeId: string;

  it('checkout retrait différé → PREPARATION', async () => {
    const create = await request(app.getHttpServer())
      .post('/shop/panier')
      .expect(201);
    const cookie = shopPanierCookie(create);
    await request(app.getHttpServer())
      .patch('/shop/panier/lignes')
      .set('Cookie', cookie)
      .send({ lignes: [{ produitId, quantite: 1 }] });
    const res = await request(app.getHttpServer())
      .post('/shop/checkout')
      .set('Cookie', cookie)
      .send({
        clientOperationId: '88888888-8888-4888-8888-888888888888',
        modeFulfillment: 'RETRAIT_BOUTIQUE',
        modeReglement: 'PAIEMENT_RETRAIT',
        boutiqueRetraitId: boutiqueId,
        emailInvite: 'retrait@test.local',
      })
      .expect(201);
    commandeId = (res.body as { id: string }).id;
    expect((res.body as { statut: string }).statut).toBe('PREPARATION');
  });

  describe('RBAC', () => {
    it('refuse (403) lecture au contrôleur interne', async () => {
      await request(app.getHttpServer())
        .get('/commandes-web')
        .set('Authorization', `Bearer ${tokens.ctrl}`)
        .expect(403);
    });

    it('autorise lecture SI', async () => {
      await request(app.getHttpServer())
        .get('/commandes-web')
        .set('Authorization', `Bearer ${tokens.si}`)
        .expect(200);
    });
  });

  it('transition PREPARATION → PRETE → REMISE + conversion vente idempotente', async () => {
    await request(app.getHttpServer())
      .patch(`/commandes-web/${commandeId}/statut`)
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ statut: 'PRETE' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/commandes-web/${commandeId}/statut`)
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ statut: 'REMISE' })
      .expect(200);

    const opId = '99999999-9999-4999-8999-999999999999';
    const conv1 = await request(app.getHttpServer())
      .post(`/commandes-web/${commandeId}/convertir-vente`)
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .send({ clientOperationId: opId })
      .expect(201);
    const venteId1 = (conv1.body as { venteId: string }).venteId;

    const conv2 = await request(app.getHttpServer())
      .post(`/commandes-web/${commandeId}/convertir-vente`)
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .send({ clientOperationId: opId })
      .expect(201);

    expect((conv2.body as { venteId?: string }).venteId ?? venteId1).toBe(
      venteId1,
    );
    const ventes = await env.prisma.vente.count({
      where: { clientOperationId: opId },
    });
    expect(ventes).toBe(1);
  });

  it('filtre RETRAIT_BOUTIQUE et isole le caissier à sa boutique (§4)', async () => {
    const zone = await env.prisma.zone.findFirstOrThrow();
    const autreBoutique = await env.prisma.boutique.create({
      data: {
        nom: 'Autre magasin',
        adresse: 'A2',
        zoneId: zone.id,
        retraitWebActif: true,
      },
    });
    const autreEntrepot = await env.prisma.entrepot.create({
      data: { nom: 'E2', code: 'E2', boutiqueId: autreBoutique.id },
    });
    const autreCmd = await env.prisma.commandeWeb.create({
      data: {
        clientOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        statut: 'PREPARATION',
        modeFulfillment: 'RETRAIT_BOUTIQUE',
        modeReglement: 'PAIEMENT_RETRAIT',
        boutiqueRetraitId: autreBoutique.id,
        entrepotId: autreEntrepot.id,
        emailInvite: 'autre-magasin@test.local',
        montantTotal: 1500,
      },
    });

    const listeRetrait = await request(app.getHttpServer())
      .get('/commandes-web?modeFulfillment=RETRAIT_BOUTIQUE')
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(200);
    const idsSi = (listeRetrait.body as { id: string }[]).map((c) => c.id);
    expect(idsSi).toContain(commandeId);
    expect(idsSi).toContain(autreCmd.id);

    const listeCaissier = await request(app.getHttpServer())
      .get('/commandes-web')
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .expect(200);
    const idsCaissier = (listeCaissier.body as { id: string }[]).map(
      (c) => c.id,
    );
    expect(idsCaissier).toContain(commandeId);
    expect(idsCaissier).not.toContain(autreCmd.id);

    await request(app.getHttpServer())
      .get(`/commandes-web/${autreCmd.id}`)
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .expect(403);
  });
});
