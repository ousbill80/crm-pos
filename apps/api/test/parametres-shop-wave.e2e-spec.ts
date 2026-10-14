// Config super admin du reversement Wave (plan reversement Wave, §4/§6.2).
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { WaveAdapter } from '../src/shop/psp/wave.adapter';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-parametres-shop-wave-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

describe('Parametres shop — reversement Wave (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
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
    niveauHabilitation: number,
  ): Promise<void> {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: loginValue,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: loginValue,
        actif: true,
        roleId: role.id,
      },
    });
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Z' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'B', adresse: 'A', zoneId: zone.id },
    });
    const entrepotId = (
      await env.prisma.entrepot.create({
        data: { nom: 'E', code: 'E-PS-WAVE', boutiqueId: boutique.id },
      })
    ).id;
    await env.prisma.parametreShop.create({
      data: {
        societeId: (
          await env.prisma.societe.create({
            data: { raisonSociale: 'PS Wave', adresse: 'X' },
          })
        ).id,
        shopActif: true,
        entrepotWebDefautId: entrepotId,
      },
    });

    await creerUtilisateur('ps-wave-si', 'RESPONSABLE_SI', 1);
    await creerUtilisateur('ps-wave-caissier', 'CAISSIER_BOUTIQUE', 4);
    await creerUtilisateur('ps-wave-dg', 'DIRECTION_GENERALE', 1);
    await creerUtilisateur('ps-wave-controleur', 'CONTROLEUR_INTERNE', 1);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    tokens.si = await login('ps-wave-si');
    tokens.caissier = await login('ps-wave-caissier');
    tokens.dg = await login('ps-wave-dg');
    tokens.controleur = await login('ps-wave-controleur');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse CONTROLEUR_INTERNE en lecture sur GET /parametres-shop → 403 (RBAC restreint aussi la lecture)', async () => {
    await request(app.getHttpServer())
      .get('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.controleur}`)
      .expect(403);
  });

  it('refuse CAISSIER_BOUTIQUE sur PATCH /parametres-shop → 403', async () => {
    await request(app.getHttpServer())
      .patch('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .send({ waveBeneficiaireMobile: '+2250700000000' })
      .expect(403);
  });

  it('RESPONSABLE_SI configure commission + bénéficiaire Wave via PATCH', async () => {
    const res = await request(app.getHttpServer())
      .patch('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({
        waveCommissionPourcent: 2.5,
        waveBeneficiaireMobile: '+2250700000000',
        waveBeneficiaireNom: 'Major Auto Parts',
      })
      .expect(200);
    const body = res.body as {
      waveCommissionPourcent: string;
      waveBeneficiaireMobile: string;
      waveBeneficiaireNom: string;
    };
    expect(Number(body.waveCommissionPourcent)).toBe(2.5);
    expect(body.waveBeneficiaireMobile).toBe('+2250700000000');
    expect(body.waveBeneficiaireNom).toBe('Major Auto Parts');
  });

  it('journalise PARAMETRE_SHOP_MODIFIE avec le détail des champs changés', async () => {
    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'PARAMETRE_SHOP_MODIFIE' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entite).toBe('ParametreShop');
    expect(audit?.details).toContain('waveCommissionPourcent');
    expect(audit?.details).toContain('waveBeneficiaireMobile');
    expect(audit?.details).toContain('+2250700000000');
  });

  it('rejette un numéro de téléphone bénéficiaire mal formé (400)', async () => {
    await request(app.getHttpServer())
      .patch('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ waveBeneficiaireMobile: 'pas-un-numero' })
      .expect(400);
  });

  it('autorise aussi DIRECTION_GENERALE sur PATCH /parametres-shop (second rôle de ROLES_PARAMETRES_SHOP)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.dg}`)
      .send({ waveCommissionPourcent: 1.5 })
      .expect(200);
    const body = res.body as { waveCommissionPourcent: string };
    expect(Number(body.waveCommissionPourcent)).toBe(1.5);
  });

  it('rejette une commission Wave négative (400)', async () => {
    await request(app.getHttpServer())
      .patch('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ waveCommissionPourcent: -1 })
      .expect(400);
  });

  it('rejette une commission Wave supérieure à 100 (400)', async () => {
    await request(app.getHttpServer())
      .patch('/parametres-shop')
      .set('Authorization', `Bearer ${tokens.si}`)
      .send({ waveCommissionPourcent: 101 })
      .expect(400);
  });

  it('refuse CAISSIER_BOUTIQUE sur POST /parametres-shop/wave-payout/tester → 403', async () => {
    await request(app.getHttpServer())
      .post('/parametres-shop/wave-payout/tester')
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .expect(403);
  });

  it('POST /parametres-shop/wave-payout/tester échoue (400) si aucun bénéficiaire configuré', async () => {
    await env.prisma.parametreShop.updateMany({
      data: { waveBeneficiaireMobile: null },
    });

    await request(app.getHttpServer())
      .post('/parametres-shop/wave-payout/tester')
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(400);

    await env.prisma.parametreShop.updateMany({
      data: { waveBeneficiaireMobile: '+2250700000000' },
    });
  });

  it('POST /parametres-shop/wave-payout/tester renvoie 503 (WAVE_API_KEY neutralisé en e2e) et journalise PAYOUT_WAVE_TEST', async () => {
    await request(app.getHttpServer())
      .post('/parametres-shop/wave-payout/tester')
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(503);

    const parametre = await env.prisma.parametreShop.findFirstOrThrow();
    expect(parametre.waveBeneficiaireTesteAt).toBeNull();

    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'PAYOUT_WAVE_TEST' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.details).toContain('échec');
  });

  it('POST /parametres-shop/wave-payout/tester réussi met à jour waveBeneficiaireTesteAt et journalise sans « échec »', async () => {
    // Pas de sandbox Wave disponible en CI : seule la frontière HTTP externe
    // (WaveAdapter.payout) est doublée, le reste du flux (RBAC, Prisma,
    // audit) tourne contre la vraie base — cohérent avec §3 du schéma de
    // test (doubles acceptés uniquement aux frontières d'infrastructure).
    const payoutSpy = jest
      .spyOn(WaveAdapter.prototype, 'payout')
      .mockResolvedValueOnce({ id: 'payout-sandbox-1', status: 'succeeded' });

    await request(app.getHttpServer())
      .post('/parametres-shop/wave-payout/tester')
      .set('Authorization', `Bearer ${tokens.si}`)
      .expect(201);

    const parametre = await env.prisma.parametreShop.findFirstOrThrow();
    expect(parametre.waveBeneficiaireTesteAt).not.toBeNull();

    const audit = await env.prisma.journalAudit.findFirst({
      where: { action: 'PAYOUT_WAVE_TEST' },
      orderBy: { dateHeure: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.details).toContain('succeeded');
    expect(audit?.details).not.toContain('échec');

    payoutSpy.mockRestore();
  });
});
