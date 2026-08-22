// Tests d'intégration réels (zéro mock) — rapprochement 3 voies §5.2
// (ligne 259-261) : ventes enregistrées / bordereaux émis / réceptions
// validées.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

process.env.JWT_SECRET ??= 'test-secret-controle-coherence-e2e';

const MOT_DE_PASSE = 'MotDePasse!123';

interface ControleCoherenceResponse {
  totaux: {
    ventesEnregistrees: string;
    bordereauxEmis: string;
    receptionsValidees: string;
  };
  ecarts: {
    ventesVsBordereaux: string;
    bordereauxVsReceptions: string;
    signale: boolean;
  };
}

describe('Rapprochement 3 voies — §5.2 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutiqueCoherenteId: string;
  let caisseCoherenteId: string;
  let boutiqueEcartId: string;
  let caisseEcartId: string;
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

    const boutiqueCoherente = await env.prisma.boutique.create({
      data: {
        nom: 'Boutique Cohérente',
        adresse: 'Adresse 1',
        zoneId: zoneA.id,
      },
    });
    boutiqueCoherenteId = boutiqueCoherente.id;
    const caisseCoherente = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutiqueCoherenteId },
    });
    caisseCoherenteId = caisseCoherente.id;

    const boutiqueEcart = await env.prisma.boutique.create({
      data: { nom: 'Boutique Écart', adresse: 'Adresse 2', zoneId: zoneA.id },
    });
    boutiqueEcartId = boutiqueEcart.id;
    const caisseEcart = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutiqueEcartId },
    });
    caisseEcartId = caisseEcart.id;

    caissierId = await creerUtilisateur(
      'controle-caissier',
      'CAISSIER_BOUTIQUE',
      boutiqueCoherenteId,
      4,
    );
    await creerUtilisateur(
      'controle-controleur',
      'CONTROLEUR_INTERNE',
      null,
      1,
    );
    await creerUtilisateur('controle-crm', 'RESPONSABLE_CRM', null, 1);

    // --- Boutique cohérente : ventes = bordereau = réception (aucun écart) ---
    const sessionCoherente = await ouvrirSession(caisseCoherenteId);
    await env.prisma.vente.create({
      data: {
        montantTotal: 1000,
        modePaiement: 'ESPECES',
        caisseId: caisseCoherenteId,
        sessionCaisseId: sessionCoherente,
      },
    });
    const versementCoherent = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 1000,
        statut: StatutTransaction.VALIDEE,
        caisseId: caisseCoherenteId,
        initiateurId: caissierId,
      },
    });
    const bordereauCoherent = await env.prisma.bordereauVersement.create({
      data: { transactionId: versementCoherent.id, montantDeclare: 1000 },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereauCoherent.id,
        montantRecu: 1000,
        ecart: 0,
        statutFinal: StatutTransaction.VALIDEE,
        validateurId: caissierId,
      },
    });

    // --- Boutique en écart : ventes 2000, bordereau déclaré 2000, mais
    // réception validée seulement 1800 (200 manquants au comptage centrale).
    const sessionEcart = await ouvrirSession(caisseEcartId);
    await env.prisma.vente.create({
      data: {
        montantTotal: 2000,
        modePaiement: 'ESPECES',
        caisseId: caisseEcartId,
        sessionCaisseId: sessionEcart,
      },
    });
    const versementEcart = await env.prisma.transactionCaisse.create({
      data: {
        type: TypeTransaction.SORTIE_FONDS,
        montant: 2000,
        statut: StatutTransaction.LITIGE,
        caisseId: caisseEcartId,
        initiateurId: caissierId,
      },
    });
    const bordereauEcart = await env.prisma.bordereauVersement.create({
      data: { transactionId: versementEcart.id, montantDeclare: 2000 },
    });
    await env.prisma.receptionValidation.create({
      data: {
        bordereauId: bordereauEcart.id,
        montantRecu: 1800,
        ecart: -200,
        statutFinal: StatutTransaction.LITIGE,
        validateurId: caissierId,
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

    tokens.controleur = await login('controle-controleur');
    tokens.crm = await login('controle-crm');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse RESPONSABLE_CRM (hors périmètre §5.2) → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/controle-coherence')
      .set('Authorization', `Bearer ${tokens.crm}`)
      .expect(403);
  });

  it('boutique cohérente : ventes = bordereaux = réceptions, aucun écart signalé', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/controle-coherence')
      .query({ boutiqueId: boutiqueCoherenteId })
      .set('Authorization', `Bearer ${tokens.controleur}`)
      .expect(200);

    const body = response.body as ControleCoherenceResponse;
    expect(body.totaux.ventesEnregistrees).toBe('1000.00');
    expect(body.totaux.bordereauxEmis).toBe('1000.00');
    expect(body.totaux.receptionsValidees).toBe('1000.00');
    expect(body.ecarts.ventesVsBordereaux).toBe('0.00');
    expect(body.ecarts.bordereauxVsReceptions).toBe('0.00');
    expect(body.ecarts.signale).toBe(false);
  });

  it('boutique en écart : réception validée (1800) inférieure au bordereau déclaré (2000) → écart signalé', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/controle-coherence')
      .query({ boutiqueId: boutiqueEcartId })
      .set('Authorization', `Bearer ${tokens.controleur}`)
      .expect(200);

    const body = response.body as ControleCoherenceResponse;
    expect(body.totaux.ventesEnregistrees).toBe('2000.00');
    expect(body.totaux.bordereauxEmis).toBe('2000.00');
    expect(body.totaux.receptionsValidees).toBe('1800.00');
    expect(body.ecarts.ventesVsBordereaux).toBe('0.00');
    expect(body.ecarts.bordereauxVsReceptions).toBe('200.00');
    expect(body.ecarts.signale).toBe(true);
  });

  it('réseau entier (sans boutiqueId) : cumule les deux boutiques et signale l’écart global', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/controle-coherence')
      .set('Authorization', `Bearer ${tokens.controleur}`)
      .expect(200);

    const body = response.body as ControleCoherenceResponse;
    expect(body.totaux.ventesEnregistrees).toBe('3000.00');
    expect(body.totaux.bordereauxEmis).toBe('3000.00');
    expect(body.totaux.receptionsValidees).toBe('2800.00');
    expect(body.ecarts.signale).toBe(true);
  });
});
