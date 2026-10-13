// Tests d'intégration réels (zéro mock) — clôture journalière consolidée
// DAF (§6.3.4), lecture seule : soldes d'ouverture/fermeture, ventes,
// versements initiés/réceptionnés/validés, écarts, par boutique + réseau.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-cloture-journaliere-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

interface VersementsJourResponse {
  initiesNombre: number;
  initiesMontant: string;
  receptionnesNombre: number;
  receptionnesMontant: string;
  validesNombre: number;
  validesMontant: string;
}

interface ClotureJournaliereResponse {
  date: string;
  parBoutique: Array<{
    boutiqueId: string;
    nomBoutique: string;
    soldeOuverture: string;
    soldeFermeture: string;
    ventes: string;
    versements: VersementsJourResponse;
    ecarts: { nombreLitiges: number; montantEcartsAbsolus: string };
  }>;
  reseau: {
    soldeOuverture: string;
    soldeFermeture: string;
    ventes: string;
    versements: VersementsJourResponse;
    ecarts: { nombreLitiges: number; montantEcartsAbsolus: string };
  };
}

describe('Clôture journalière consolidée DAF — §6.3.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let caisse1Id: string;
  let boutique2Id: string;
  let caisse2Id: string;
  let caissierId: string;

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

  async function ouvrirSession(caisseId: string): Promise<string> {
    const session = await env.prisma.sessionCaisse.create({
      data: {
        caisseId,
        fondInitial: 0,
        ouvertureUtilisateurId: caissierId,
        ouvertureTemoinId: caissierId,
      },
    });
    return session.id;
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
    caisse1Id = caisse1.id;

    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 2', adresse: 'Adresse 2', zoneId: zoneA.id },
    });
    boutique2Id = boutique2.id;
    const caisse2 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique2Id },
    });
    caisse2Id = caisse2.id;

    caissierId = await creerUtilisateur(
      'cloture-caissier',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
    );
    await creerUtilisateur('cloture-daf', 'DAF', null, 1);

    // --- Boutique 1 : historique avant le jour testé (solde d'ouverture) ---
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 1000,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisse1Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-10T08:00:00.000Z'),
      },
    });

    // --- Boutique 1 : journée du 2026-01-15 ---
    const session1 = await ouvrirSession(caisse1Id);
    await env.prisma.vente.create({
      data: {
        montantTotal: 500,
        modePaiement: 'ESPECES',
        caisseId: caisse1Id,
        sessionCaisseId: session1,
        dateVente: new Date('2026-01-15T10:00:00.000Z'),
      },
    });
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 500,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisse1Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-15T10:00:00.000Z'),
      },
    });

    // Versement en transit (initié, pas encore réceptionné).
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 300,
        statut: StatutTransaction.EN_TRANSIT,
        caisseId: caisse1Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-15T11:00:00.000Z'),
      },
    });

    // Versement réceptionné et validé sans écart.
    const versementValide = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 200,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisse1Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-15T12:00:00.000Z'),
      },
    });
    const bordereauValide = await env.prisma.bordereauVersement.create({
      data: { transactionId: versementValide.id, montantDeclare: 200 },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereauValide.id,
        montantRecu: 200,
        ecart: 0,
        statutFinal: StatutTransaction.VALIDEE,
        validateurId: caissierId,
      },
    });

    // Versement réceptionné en litige (écart de 50).
    const versementLitige = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 150,
        statut: StatutTransaction.LITIGE,
        caisseId: caisse1Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-15T13:00:00.000Z'),
      },
    });
    const bordereauLitige = await env.prisma.bordereauVersement.create({
      data: { transactionId: versementLitige.id, montantDeclare: 150 },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereauLitige.id,
        montantRecu: 100,
        ecart: -50,
        statutFinal: StatutTransaction.LITIGE,
        validateurId: caissierId,
      },
    });

    // --- Boutique 1 : après le jour testé, ne doit pas être compté ---
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 9999,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisse1Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-16T01:00:00.000Z'),
      },
    });

    // --- Boutique 2 : simple vente du jour, aucun versement ---
    const session2 = await ouvrirSession(caisse2Id);
    await env.prisma.vente.create({
      data: {
        montantTotal: 300,
        modePaiement: 'ESPECES',
        caisseId: caisse2Id,
        sessionCaisseId: session2,
        dateVente: new Date('2026-01-15T09:00:00.000Z'),
      },
    });
    await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.VENTE,
        montant: 300,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisse2Id,
        initiateurId: caissierId,
        dateHeure: new Date('2026-01-15T09:00:00.000Z'),
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

    tokens.caissier = await login('cloture-caissier');
    tokens.daf = await login('cloture-daf');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse CAISSIER_BOUTIQUE (hors périmètre réseau) → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/cloture-journaliere')
      .query({ date: '2026-01-15' })
      .set('Authorization', `Bearer ${tokens.caissier}`)
      .expect(403);
  });

  it('DAF : clôture du 2026-01-15, agrégée par boutique et au niveau réseau', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/cloture-journaliere')
      .query({ date: '2026-01-15' })
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    const body = response.body as ClotureJournaliereResponse;
    expect(body.date).toBe('2026-01-15');

    const b1 = body.parBoutique.find((b) => b.boutiqueId === boutique1Id);
    expect(b1).toBeDefined();
    expect(b1?.soldeOuverture).toBe('1000.00');
    // 1000 (ouverture) + 500 (vente) − 200 (versement validé) ; EN_TRANSIT et
    // LITIGE non comptés tant que non validés (grand livre append-only).
    expect(b1?.soldeFermeture).toBe('1300.00');
    expect(b1?.ventes).toBe('500.00');
    expect(b1?.versements).toEqual({
      initiesNombre: 3,
      initiesMontant: '650.00',
      receptionnesNombre: 2,
      receptionnesMontant: '350.00',
      validesNombre: 1,
      validesMontant: '200.00',
    });
    expect(b1?.ecarts).toEqual({
      nombreLitiges: 1,
      montantEcartsAbsolus: '50.00',
    });

    const b2 = body.parBoutique.find((b) => b.boutiqueId === boutique2Id);
    expect(b2).toBeDefined();
    expect(b2?.soldeOuverture).toBe('0.00');
    expect(b2?.soldeFermeture).toBe('300.00');
    expect(b2?.ventes).toBe('300.00');
    expect(b2?.versements.initiesNombre).toBe(0);
    expect(b2?.ecarts).toEqual({
      nombreLitiges: 0,
      montantEcartsAbsolus: '0.00',
    });

    expect(body.reseau.soldeOuverture).toBe('1000.00');
    expect(body.reseau.soldeFermeture).toBe('1600.00');
    expect(body.reseau.ventes).toBe('800.00');
    expect(body.reseau.versements).toEqual({
      initiesNombre: 3,
      initiesMontant: '650.00',
      receptionnesNombre: 2,
      receptionnesMontant: '350.00',
      validesNombre: 1,
      validesMontant: '200.00',
    });
    expect(body.reseau.ecarts).toEqual({
      nombreLitiges: 1,
      montantEcartsAbsolus: '50.00',
    });
  });

  it('journée vide (2026-02-01) : totaux à zéro, pas d’erreur', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/cloture-journaliere')
      .query({ date: '2026-02-01' })
      .set('Authorization', `Bearer ${tokens.daf}`)
      .expect(200);

    const body = response.body as ClotureJournaliereResponse;
    // Les soldes d'ouverture/fermeture reflètent le solde cumulé à cette
    // date (toutes les écritures validées antérieures restent comptées).
    const b1 = body.parBoutique.find((b) => b.boutiqueId === boutique1Id);
    expect(b1?.ventes).toBe('0.00');
    expect(b1?.versements.initiesNombre).toBe(0);
    expect(b1?.ecarts).toEqual({
      nombreLitiges: 0,
      montantEcartsAbsolus: '0.00',
    });
  });
});
