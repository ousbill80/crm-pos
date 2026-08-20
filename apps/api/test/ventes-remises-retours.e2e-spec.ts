// Tests d'intégration réels (zéro mock) — remises & retours/avoirs POS.
// Extension au-delà du cahier des charges (assumée, cf. plan de la tâche) :
// plafond de remise 20%/ligne (fraude caissier) et retours limités à la
// session de caisse EN COURS (§6.4 — jamais rouvrir une trésorerie déjà
// versée). Démarre un vrai PostgreSQL via Testcontainers et authentifie
// chaque profil via le vrai endpoint /auth/login.
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

interface SessionCaisseDto {
  id: string;
  statut: string;
}

interface VenteDto {
  id: string;
  montantTotal: string;
  lignes: {
    id: string;
    produitId: string;
    quantite: number;
    prixUnitaire: string;
  }[];
}

interface RetourVenteDto {
  id: string;
  ligneVenteId: string;
  quantite: number;
  montantRembourse: string;
}

interface ClotureResponseDto {
  session: SessionCaisseDto;
  releve: { modePaiement: string; total: string; nombreVentes: number }[];
  transactionVersementId: string | null;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Ventes — remises & retours/avoirs POS (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let caisse1Id: string;
  let caisse2Id: string;
  let caisse3Id: string;
  let produitId: string;

  const tokens: Record<string, string> = {};

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

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
        boutiqueId,
      },
    });
  }

  async function ouvrirSession(
    token: string,
    caisseId: string,
    fondInitial: number,
    temoinLogin: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(token))
      .send({ caisseId, fondInitial, temoinLogin })
      .expect(201);
    return (response.body as SessionCaisseDto).id;
  }

  async function encaisser(
    sessionId: string,
    quantite: number,
    remise?: number,
  ): Promise<VenteDto> {
    const response = await request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/ventes`)
      .set(auth(tokens.caissierB1))
      .send({
        lignes: [
          { produitId, quantite, ...(remise !== undefined ? { remise } : {}) },
        ],
        modePaiement: 'ESPECES',
      });
    return response.body as VenteDto;
  }

  beforeAll(async () => {
    await env.start();

    const zoneA = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneA.id },
    });

    const caisse1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1.id },
    });
    caisse1Id = caisse1.id;
    const caisse2 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1.id },
    });
    caisse2Id = caisse2.id;
    const caisse3 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.AUXILIAIRE, boutiqueId: boutique1.id },
    });
    caisse3Id = caisse3.id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Coque téléphone',
        prixUnitaire: '1000.00',
        stock: 100,
      },
    });

    const entrepotPrincipal = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Remises',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique1.id,
      },
    });
    await env.prisma.stockQuant.create({
      data: {
        produitId: produit.id,
        entrepotId: entrepotPrincipal.id,
        quantite: produit.stock,
      },
    });
    produitId = produit.id;

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutique1.id, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutique1.id, 3);
    await creerUtilisateur('daf', 'DAF', null, 1);

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

    tokens.caissierB1 = await login('caissier-b1');
    tokens.respB1 = await login('resp-b1');
    tokens.daf = await login('daf');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  describe('Remises (plafond 20% par ligne)', () => {
    let sessionId: string;

    beforeAll(async () => {
      sessionId = await ouvrirSession(
        tokens.caissierB1,
        caisse1Id,
        5000,
        'resp-b1',
      );
    });

    it('refuse (400) une remise supérieure à 20% du montant de la ligne', async () => {
      // 2 x 1000 = 2000, plafond = 400, remise demandée = 500.
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId, quantite: 2, remise: 500 }],
          modePaiement: 'ESPECES',
        })
        .expect(400);
    });

    it('accepte une remise ≤ 20% et recalcule montantTotal côté serveur', async () => {
      // 2 x 1000 = 2000, remise 300 (≤ plafond 400) → montantTotal = 1700.
      const body = await encaisser(sessionId, 2, 300);
      expect(Number(body.montantTotal)).toBe(1700);

      const ligne = await env.prisma.ligneVente.findUnique({
        where: { id: body.lignes[0].id },
      });
      expect(Number(ligne?.remise)).toBe(300);
    });

    it('accepte une remise exactement au plafond (20%)', async () => {
      // 1 x 1000 = 1000, plafond = 200, remise = 200.
      const body = await encaisser(sessionId, 1, 200);
      expect(Number(body.montantTotal)).toBe(800);
    });
  });

  describe('Retours/avoirs — session en cours', () => {
    let sessionId: string;
    let vente: VenteDto;

    beforeAll(async () => {
      sessionId = await ouvrirSession(
        tokens.caissierB1,
        caisse2Id,
        5000,
        'resp-b1',
      );
      vente = await encaisser(sessionId, 5, 0);
    });

    it('refuse (403) un retour par un rôle hors périmètre boutique', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.daf))
        .send({ ligneVenteId: vente.lignes[0].id, quantite: 1 })
        .expect(403);
    });

    it('refuse (404) un retour sur une ligne de vente inexistante', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({
          ligneVenteId: '00000000-0000-0000-0000-000000000000',
          quantite: 1,
        })
        .expect(404);
    });

    it('autorise un retour partiel, recrédite le stock et journalise RETOUR_VENTE_ENREGISTRE', async () => {
      const produitAvant = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });

      const response = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({ ligneVenteId: vente.lignes[0].id, quantite: 2 })
        .expect(201);

      const body = response.body as RetourVenteDto;
      expect(body.quantite).toBe(2);
      expect(Number(body.montantRembourse)).toBe(2000); // (5000/5) x 2

      const produitApres = await env.prisma.produit.findUniqueOrThrow({
        where: { id: produitId },
      });
      expect(produitApres.stock).toBe(produitAvant.stock + 2);

      const mouvement = await env.prisma.mouvementStock.findFirst({
        where: { reference: body.id },
      });
      expect(mouvement).not.toBeNull();
      expect(mouvement?.type).toBe('RETOUR');
      expect(mouvement?.quantite).toBe(2);

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: { entite: 'RetourVente', entiteId: body.id },
      });
      expect(entreeAudit).not.toBeNull();
      expect(entreeAudit?.action).toBe('RETOUR_VENTE_ENREGISTRE');
    });

    it('refuse (400) un sur-retour (quantité cumulée > quantité vendue)', async () => {
      // 2 déjà retournés sur 5 vendus ; +4 dépasserait (6 > 5).
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({ ligneVenteId: vente.lignes[0].id, quantite: 4 })
        .expect(400);
    });

    it('accepte le reliquat exact (3 restants sur 5)', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({ ligneVenteId: vente.lignes[0].id, quantite: 3 })
        .expect(201);
    });

    it('refuse (400) un retour au-delà du tout retourné (0 restant)', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({ ligneVenteId: vente.lignes[0].id, quantite: 1 })
        .expect(400);
    });

    it("refuse (400) un retour sur une vente d'une session déjà clôturée", async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/cloture`)
        .set(auth(tokens.caissierB1))
        .send({ fondCompteCloture: 5000, temoinLogin: 'resp-b1' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({ ligneVenteId: vente.lignes[0].id, quantite: 1 })
        .expect(400);
    });
  });

  describe('Clôture avec panachage ventes/retours ESPECES', () => {
    it('le bordereau ESPECES est net des retours (vendu 5000, retourné 1000 → bordereau 4000)', async () => {
      const sessionId = await ouvrirSession(
        tokens.caissierB1,
        caisse3Id,
        5000,
        'resp-b1',
      );

      const vente1 = await encaisser(sessionId, 3, 0); // 3000
      await encaisser(sessionId, 2, 0); // 2000, total ESPECES = 5000

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierB1))
        .send({ ligneVenteId: vente1.lignes[0].id, quantite: 1 })
        .expect(201); // rembourse 1000 (prixUnitaire 1000, sans remise)

      const cloture = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/cloture`)
        .set(auth(tokens.caissierB1))
        .send({ fondCompteCloture: 4000, temoinLogin: 'resp-b1' })
        .expect(201);

      const body = cloture.body as ClotureResponseDto;
      const especes = body.releve.find((l) => l.modePaiement === 'ESPECES');
      expect(especes?.total).toBe('4000.00');
      expect(body.transactionVersementId).toEqual(expect.any(String));

      const transaction = await env.prisma.transactionCaisse.findUnique({
        where: { id: body.transactionVersementId as string },
      });
      expect(Number(transaction?.montant)).toBe(4000);
    });
  });
});
