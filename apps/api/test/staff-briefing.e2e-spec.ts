import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { StaffBriefingService } from '../src/staff-briefing/staff-briefing.service';

process.env.EMAIL_PROVIDER = 'mock';
process.env.STAFF_BRIEFING_ENABLED = 'true';

jest.setTimeout(120_000);

describe('Staff briefing Direction (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication;
  let briefing: StaffBriefingService;
  let prisma: PrismaService;
  let dgId: string;

  beforeAll(async () => {
    await env.start();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = app.get(PrismaService);
    briefing = app.get(StaffBriefingService);

    const role = await prisma.role.upsert({
      where: { libelle: 'DIRECTION_GENERALE' },
      update: {},
      create: { libelle: 'DIRECTION_GENERALE', niveauHabilitation: 1 },
    });
    const dafRole = await prisma.role.upsert({
      where: { libelle: 'DAF' },
      update: {},
      create: { libelle: 'DAF', niveauHabilitation: 2 },
    });
    const hash = await bcrypt.hash('MotDePasse!123', 10);
    dgId = (
      await prisma.utilisateur.create({
        data: {
          login: 'brief-dg',
          passwordHash: hash,
          nom: 'Ba',
          prenom: 'Aminata',
          actif: true,
          roleId: role.id,
          email: 'dg-brief@test.local',
        },
      })
    ).id;
    await prisma.utilisateur.create({
      data: {
        login: 'brief-daf',
        passwordHash: hash,
        nom: 'Traore',
        prenom: 'Mariam',
        actif: true,
        roleId: dafRole.id,
        email: 'daf-brief@test.local',
      },
    });
    await prisma.utilisateur.create({
      data: {
        login: 'brief-raf',
        passwordHash: hash,
        nom: 'Diallo',
        prenom: 'Ibrahim',
        actif: true,
        roleId: (
          await prisma.role.upsert({
            where: { libelle: 'RAF_COMPTABLE' },
            update: {},
            create: { libelle: 'RAF_COMPTABLE', niveauHabilitation: 2 },
          })
        ).id,
        email: 'raf-brief@test.local',
      },
    });
    await prisma.utilisateur.create({
      data: {
        login: 'brief-caissier-sans-mail',
        passwordHash: hash,
        nom: 'Sans',
        prenom: 'Mail',
        actif: true,
        roleId: (
          await prisma.role.upsert({
            where: { libelle: 'CAISSIER_BOUTIQUE' },
            update: {},
            create: { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 3 },
          })
        ).id,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('envoie le récap soir à DG et DAF, ignore le caissier sans e-mail, déduplique', async () => {
    const n1 = await briefing.cycleSoir(new Date('2026-08-28T22:00:00Z'));
    expect(n1).toBe(2);
    const n2 = await briefing.cycleSoir(new Date('2026-08-28T22:05:00Z'));
    expect(n2).toBe(0);
    const rows = await prisma.staffBriefingEnvoi.findMany({
      where: { type: 'SOIR' },
    });
    expect(rows).toHaveLength(2);
    await expect(
      prisma.staffBriefingEnvoi.update({
        where: { id: rows[0]!.id },
        data: { type: 'HEBDO' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('relance le DG sans LOGIN_REUSSI depuis 48 h', async () => {
    const n = await briefing.cycleRelances(new Date('2026-08-28T09:00:00Z'));
    expect(n).toBeGreaterThanOrEqual(1);
    const relance = await prisma.staffBriefingEnvoi.findFirst({
      where: { type: 'RELANCE_CONNEXION', utilisateurId: dgId },
    });
    expect(relance).toBeTruthy();
  });

  it('envoie l’état exécutif financier hebdo à DG, DAF et RAF uniquement', async () => {
    const n = await briefing.cycleHebdo(new Date('2026-08-31T07:30:00Z'));
    expect(n).toBe(3);
    const rows = await prisma.staffBriefingEnvoi.findMany({
      where: { type: 'HEBDO' },
    });
    expect(rows).toHaveLength(3);
    const n2 = await briefing.cycleHebdo(new Date('2026-08-31T07:35:00Z'));
    expect(n2).toBe(0);
  });

  it('n’alerte pas le shop s’il est inactif', async () => {
    const n = await briefing.cycleShopInactif(new Date('2026-08-28T10:00:00Z'));
    expect(n).toBe(0);
  });

  it('alerte DG/DAF si le shop est actif sans catalogue publié', async () => {
    const societe = await prisma.societe.create({
      data: { raisonSociale: 'Brief SA', adresse: 'Abidjan' },
    });
    await prisma.parametreShop.create({
      data: { societeId: societe.id, shopActif: true },
    });
    const n = await briefing.cycleShopInactif(new Date('2026-08-29T10:00:00Z'));
    expect(n).toBe(2);
  });

  it('alerte DG, DAF et RAF si une session POS reste ouverte après 20h', async () => {
    const zone = await prisma.zone.create({
      data: { nomZone: 'Zone brief' },
    });
    const boutique = await prisma.boutique.create({
      data: {
        nom: 'Yopougon',
        adresse: 'Abidjan',
        code: 'YOP-B',
        zoneId: zone.id,
      },
    });
    const caisse = await prisma.caisse.create({
      data: {
        type: 'TIROIR',
        boutiqueId: boutique.id,
        code: 'T1',
        libelle: 'Tiroir 1',
        actif: true,
      },
    });
    const caissier = await prisma.utilisateur.findUniqueOrThrow({
      where: { login: 'brief-caissier-sans-mail' },
    });
    await prisma.sessionCaisse.create({
      data: {
        caisseId: caisse.id,
        statut: 'OUVERTE',
        fondInitial: 0,
        ouvertureDateHeure: new Date('2026-08-28T08:00:00Z'),
        ouvertureUtilisateurId: caissier.id,
        ouvertureTemoinId: caissier.id,
      },
    });
    const avant = await briefing.cycleCloture(new Date('2026-08-28T10:00:00Z'));
    expect(avant).toBe(0);
    const n = await briefing.cycleCloture(new Date('2026-08-28T21:10:00Z'));
    expect(n).toBe(3);
    const n2 = await briefing.cycleCloture(new Date('2026-08-28T21:25:00Z'));
    expect(n2).toBe(0);
  });
});
