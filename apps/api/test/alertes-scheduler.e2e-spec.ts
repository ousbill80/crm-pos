// Tests d'intégration réels (zéro mock) — notifications proactives §6.7,
// §5.1 : diffusion dédupliquée, extinction après régularisation.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertesSchedulerService } from '../src/alertes/alertes-scheduler.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-alertes-scheduler-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

describe('Notifications proactives — §6.7, §5.1 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let scheduler: AlertesSchedulerService;

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
    email?: string,
    telephone?: string,
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
        email,
        telephone,
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
    await env.prisma.caisse.create({ data: { type: TypeCaisse.CENTRALE } });

    caissierB1Id = await creerUtilisateur(
      'sched-caissier-b1',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
      'caissier-b1@example.test',
    );
    await creerUtilisateur(
      'sched-controleur',
      'CONTROLEUR_INTERNE',
      null,
      1,
      'controleur@example.test',
    );

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

    scheduler = app.get(AlertesSchedulerService);

    tokens.controleur = await login('sched-controleur');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('un écart de caisse déclenche exactement une notification (pas de doublon au cycle suivant), extinction après régularisation', async () => {
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

    const cleUnique = `ECART_CAISSE:${litige.id}`;

    await scheduler.cycle();
    const apresPremierCycle = await env.prisma.alerteNotifiee.findMany({
      where: { cleUnique },
    });
    expect(apresPremierCycle).toHaveLength(1);

    // Un second cycle ne doit pas produire de doublon pour la même alerte.
    await scheduler.cycle();
    const apresSecondCycle = await env.prisma.alerteNotifiee.findMany({
      where: { cleUnique },
    });
    expect(apresSecondCycle).toHaveLength(1);

    // Régularisation du litige (Contrôle interne, §6.4) : la transaction
    // sort du périmètre de l'alerte ECART_CAISSE.
    await request(app.getHttpServer())
      .patch(`/transactions/${litige.id}/regulariser`)
      .set('Authorization', `Bearer ${tokens.controleur}`)
      .send({ montantRetenu: 450, motif: 'Écart validé après vérification' })
      .expect(200);

    const transactionRegularisee =
      await env.prisma.transactionCaisse.findUnique({
        where: { id: litige.id },
      });
    expect(transactionRegularisee?.statut).toBe(StatutTransaction.VALIDEE);

    // Extinction : un nouveau cycle après régularisation ne recrée pas de
    // notification pour cette même clé (l'alerte a disparu du calcul).
    await scheduler.cycle();
    const apresRegularisation = await env.prisma.alerteNotifiee.findMany({
      where: { cleUnique },
    });
    expect(apresRegularisation).toHaveLength(1);
  });
});
