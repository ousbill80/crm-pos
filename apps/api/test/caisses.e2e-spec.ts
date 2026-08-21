// Tests d'intégration réels (zéro mock) — module Caisses (§3, §4, §6.2,
// §6.3.1 du cahier des charges). Démarre un vrai PostgreSQL via
// Testcontainers, seed une organisation complète (zones/boutiques/caisses/
// utilisateurs) et un grand livre TransactionCaisse construit à la main pour
// vérifier le calcul de solde append-only, puis authentifie chaque profil
// via le vrai endpoint /auth/login (pas de JWT forgé à la main).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { StatutTransaction, TypeCaisse, TypeTransaction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

interface ZoneDto {
  id: string;
  nomZone: string;
}

interface BoutiqueDto {
  id: string;
  nom: string;
  adresse: string;
  zoneId: string;
}

interface CaisseDto {
  id: string;
  type: string;
  boutiqueId: string | null;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Caisses / Zones / Boutiques (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  // Identifiants d'entités seedées, remplis dans beforeAll.
  let zoneAId: string;
  let zoneBId: string;
  let boutique1Id: string;
  let boutique2Id: string;
  let boutique3Id: string;
  let caisse1Id: string; // MAGASIN, boutique1 (zone A)
  let caisse2Id: string; // MAGASIN, boutique2 (zone A)
  let caisseCentraleId: string; // CENTRALE, sans boutique

  // Tokens JWT réels, obtenus via /auth/login pour chaque profil.
  const tokens: Record<string, string> = {};

  async function login(login: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: MOT_DE_PASSE })
      .expect(200);
    const body = response.body as { accessToken: string };
    return body.accessToken;
  }

  async function creerUtilisateur(
    login: string,
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
        login,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: login,
        actif: true,
        roleId: role.id,
        boutiqueId,
      },
    });
    return utilisateur.id;
  }

  beforeAll(async () => {
    await env.start();

    // --- Organisation : 2 zones, 3 boutiques, 2 caisses MAGASIN + 1 CENTRALE ---
    const zoneA = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const zoneB = await env.prisma.zone.create({ data: { nomZone: 'Zone B' } });
    zoneAId = zoneA.id;
    zoneBId = zoneB.id;

    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneAId },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 2', adresse: 'Adresse 2', zoneId: zoneAId },
    });
    const boutique3 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 3', adresse: 'Adresse 3', zoneId: zoneBId },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;
    boutique3Id = boutique3.id;

    const caisse1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
    });
    const caisse2 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique2Id },
    });
    const caisseCentrale = await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });
    caisse1Id = caisse1.id;
    caisse2Id = caisse2.id;
    caisseCentraleId = caisseCentrale.id;

    // --- Utilisateurs : un par profil de périmètre (§4, §6.2) ---
    await creerUtilisateur('direction', 'DIRECTION_GENERALE', null, 0);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('caissier-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('controle', 'CONTROLEUR_INTERNE', null, 1);
    await creerUtilisateur('respsi', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('respcrm', 'RESPONSABLE_CRM', null, 1);
    await creerUtilisateur(
      'superviseur-zonea',
      'SUPERVISEUR_ZONE',
      boutique1Id,
      2,
    );
    await creerUtilisateur(
      'superviseur-sans-boutique',
      'SUPERVISEUR_ZONE',
      null,
      2,
    );
    const respBoutique1Id = await creerUtilisateur(
      'resp-boutique1',
      'RESPONSABLE_BOUTIQUE',
      boutique1Id,
      3,
    );
    await creerUtilisateur(
      'caissier-boutique2',
      'CAISSIER_BOUTIQUE',
      boutique2Id,
      4,
    );

    // --- Grand livre TransactionCaisse construit à la main pour caisse1 ---
    // Attendu (voir CaisseBalanceService) :
    //   solde = SUM(VENTE VALIDEE) - SUM(SORTIE_FONDS VALIDEE)
    //         = (1000 + 500) - 300 = 1200.00
    // Les lignes non-VALIDEE ne doivent PAS être comptées.
    const lignesLedger: {
      type: TypeTransaction;
      montant: string;
      statut: StatutTransaction;
    }[] = [
      {
        type: TypeTransaction.VENTE,
        montant: '1000.00',
        statut: StatutTransaction.VALIDEE,
      },
      {
        type: TypeTransaction.VENTE,
        montant: '500.00',
        statut: StatutTransaction.VALIDEE,
      },
      {
        type: TypeTransaction.SORTIE_FONDS,
        montant: '300.00',
        statut: StatutTransaction.VALIDEE,
      },
      {
        type: TypeTransaction.SORTIE_FONDS,
        montant: '9999.00',
        statut: StatutTransaction.INITIEE,
      },
      {
        type: TypeTransaction.VENTE,
        montant: '9999.00',
        statut: StatutTransaction.EN_TRANSIT,
      },
      {
        type: TypeTransaction.SORTIE_FONDS,
        montant: '9999.00',
        statut: StatutTransaction.RECEPTIONNEE,
      },
      {
        type: TypeTransaction.SORTIE_FONDS,
        montant: '9999.00',
        statut: StatutTransaction.LITIGE,
      },
    ];
    for (const ligne of lignesLedger) {
      await env.prisma.transactionCaisse.create({
        data: {
          caisseId: caisse1Id,
          initiateurId: respBoutique1Id,
          type: ligne.type,
          montant: ligne.montant,
          statut: ligne.statut,
        },
      });
    }

    // --- Application Nest branchée sur la base de test réelle ---
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

    tokens.direction = await login('direction');
    tokens.daf = await login('daf');
    tokens.caissierCentral = await login('caissier-central');
    tokens.controle = await login('controle');
    tokens.respsi = await login('respsi');
    tokens.respcrm = await login('respcrm');
    tokens.superviseurZoneA = await login('superviseur-zonea');
    tokens.superviseurSansBoutique = await login('superviseur-sans-boutique');
    tokens.respBoutique1 = await login('resp-boutique1');
    tokens.caissierBoutique2 = await login('caissier-boutique2');
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // ---------------------------------------------------------------------
  // 1) Calcul de solde depuis le grand livre (append-only) — cœur du module.
  // ---------------------------------------------------------------------
  describe('GET /caisses/:id/solde — calcul append-only', () => {
    it('calcule le solde de caisse1 à partir des seules transactions VALIDEE (1000+500-300=1200.00)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/caisses/${caisse1Id}/solde`)
        .set(auth(tokens.direction))
        .expect(200);

      expect(response.body).toEqual({ caisseId: caisse1Id, solde: '1200.00' });
    });

    it('renvoie un solde à zéro pour une caisse sans transaction validée (caisse2)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/caisses/${caisse2Id}/solde`)
        .set(auth(tokens.direction))
        .expect(200);

      expect(response.body).toEqual({ caisseId: caisse2Id, solde: '0.00' });
    });
  });

  describe('GET /caisses/:id/mouvements — grand livre lecture', () => {
    it('liste les mouvements VALIDEE de la caisse', async () => {
      const response = await request(app.getHttpServer())
        .get(`/caisses/${caisse1Id}/mouvements`)
        .set(auth(tokens.direction))
        .expect(200);
      const body = response.body as Array<{ statut: string; caisseId: string }>;
      expect(body.length).toBeGreaterThan(0);
      expect(body.every((m) => m.statut === 'VALIDEE')).toBe(true);
      expect(body.every((m) => m.caisseId === caisse1Id)).toBe(true);
    });

    it('refuse (403) les mouvements hors périmètre boutique', () => {
      return request(app.getHttpServer())
        .get(`/caisses/${caisse2Id}/mouvements`)
        .set(auth(tokens.respBoutique1))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------
  // 2) Périmètre boutique : accès direct par id refusé (403), listes filtrées.
  // ---------------------------------------------------------------------
  describe('Périmètre RESPONSABLE_BOUTIQUE / CAISSIER_BOUTIQUE', () => {
    it("refuse explicitement (403) l'accès direct par id à la caisse d'une autre boutique", () => {
      return request(app.getHttpServer())
        .get(`/caisses/${caisse2Id}`)
        .set(auth(tokens.respBoutique1))
        .expect(403);
    });

    it("refuse explicitement (403) le solde de la caisse d'une autre boutique", () => {
      return request(app.getHttpServer())
        .get(`/caisses/${caisse2Id}/solde`)
        .set(auth(tokens.respBoutique1))
        .expect(403);
    });

    it('autorise le responsable de boutique 1 à consulter sa propre caisse', () => {
      return request(app.getHttpServer())
        .get(`/caisses/${caisse1Id}`)
        .set(auth(tokens.respBoutique1))
        .expect(200);
    });

    it('filtre la liste des caisses à la seule boutique de rattachement (pas de 403, filtrage)', async () => {
      const response = await request(app.getHttpServer())
        .get('/caisses')
        .set(auth(tokens.caissierBoutique2))
        .expect(200);

      const body = response.body as CaisseDto[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(caisse2Id);
    });

    it("refuse explicitement (403) l'accès direct par id à la boutique d'un autre commerce", () => {
      return request(app.getHttpServer())
        .get(`/boutiques/${boutique2Id}`)
        .set(auth(tokens.respBoutique1))
        .expect(403);
    });

    it('filtre la liste des boutiques à la seule boutique de rattachement', async () => {
      const response = await request(app.getHttpServer())
        .get('/boutiques')
        .set(auth(tokens.respBoutique1))
        .expect(200);

      const body = response.body as BoutiqueDto[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(boutique1Id);
    });
  });

  // ---------------------------------------------------------------------
  // 3) Rôles réseau entier : voient tout.
  // ---------------------------------------------------------------------
  describe('Rôles à périmètre réseau entier', () => {
    it.each([['direction'], ['daf'], ['caissierCentral'], ['controle']])(
      '%s voit les 3 caisses du réseau',
      async (tokenKey) => {
        const response = await request(app.getHttpServer())
          .get('/caisses')
          .set(auth(tokens[tokenKey]))
          .expect(200);
        expect(response.body).toHaveLength(3);
      },
    );

    it('la liste réseau entier inclut la caisse CENTRALE (sans boutique)', async () => {
      const response = await request(app.getHttpServer())
        .get('/caisses')
        .set(auth(tokens.direction))
        .expect(200);
      const body = response.body as CaisseDto[];
      expect(body.map((c) => c.id)).toContain(caisseCentraleId);
    });

    it('direction générale voit les 3 boutiques du réseau', async () => {
      const response = await request(app.getHttpServer())
        .get('/boutiques')
        .set(auth(tokens.direction))
        .expect(200);
      expect(response.body).toHaveLength(3);
    });

    it('direction générale voit les 2 zones du réseau', async () => {
      const response = await request(app.getHttpServer())
        .get('/zones')
        .set(auth(tokens.direction))
        .expect(200);
      expect(response.body).toHaveLength(2);
    });

    it('RESPONSABLE_SI voit la structure (boutiques/zones) mais est refusé sur les caisses (hors périmètre trésorerie)', async () => {
      await request(app.getHttpServer())
        .get('/boutiques')
        .set(auth(tokens.respsi))
        .expect(200);
      await request(app.getHttpServer())
        .get('/caisses')
        .set(auth(tokens.respsi))
        .expect(403);
    });

    it('RESPONSABLE_CRM est refusé (403) sur zones, boutiques et caisses (hors périmètre)', async () => {
      await request(app.getHttpServer())
        .get('/zones')
        .set(auth(tokens.respcrm))
        .expect(403);
      await request(app.getHttpServer())
        .get('/boutiques')
        .set(auth(tokens.respcrm))
        .expect(403);
      await request(app.getHttpServer())
        .get('/caisses')
        .set(auth(tokens.respcrm))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------
  // Périmètre SUPERVISEUR_ZONE (best-effort — voir rapport de fin de tâche
  // pour la limite explicitement assumée du schéma actuel).
  // ---------------------------------------------------------------------
  describe('Périmètre SUPERVISEUR_ZONE', () => {
    it('filtre les boutiques à la zone résolue via Utilisateur.boutiqueId -> Boutique.zoneId', async () => {
      const response = await request(app.getHttpServer())
        .get('/boutiques')
        .set(auth(tokens.superviseurZoneA))
        .expect(200);
      const body = response.body as BoutiqueDto[];
      const ids = body.map((b) => b.id).sort();
      expect(ids).toEqual([boutique1Id, boutique2Id].sort());
    });

    it('filtre les caisses à la zone résolue (exclut la caisse CENTRALE)', async () => {
      const response = await request(app.getHttpServer())
        .get('/caisses')
        .set(auth(tokens.superviseurZoneA))
        .expect(200);
      const body = response.body as CaisseDto[];
      const ids = body.map((c) => c.id).sort();
      expect(ids).toEqual([caisse1Id, caisse2Id].sort());
    });

    it("refuse explicitement (403) l'accès à une boutique d'une autre zone", () => {
      return request(app.getHttpServer())
        .get(`/boutiques/${boutique3Id}`)
        .set(auth(tokens.superviseurZoneA))
        .expect(403);
    });

    it("refuse explicitement (403) — lacune assumée du schéma — quand le superviseur n'a pas de boutiqueId de rattachement", () => {
      return request(app.getHttpServer())
        .get('/boutiques')
        .set(auth(tokens.superviseurSansBoutique))
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------
  // 4) Création Zone/Boutique : gating RESPONSABLE_SI / DIRECTION_GENERALE.
  // ---------------------------------------------------------------------
  describe('Création Zone/Boutique (§4 — RESPONSABLE_SI ou DIRECTION_GENERALE uniquement)', () => {
    it('refuse explicitement (403) la création de zone par un rôle non admin', () => {
      return request(app.getHttpServer())
        .post('/zones')
        .set(auth(tokens.respBoutique1))
        .send({ nomZone: 'Zone interdite' })
        .expect(403);
    });

    it('refuse explicitement (403) la création de boutique par un rôle non admin', () => {
      return request(app.getHttpServer())
        .post('/boutiques')
        .set(auth(tokens.caissierBoutique2))
        .send({
          nom: 'Boutique interdite',
          adresse: 'Adresse X',
          zoneId: zoneAId,
        })
        .expect(403);
    });

    it("autorise RESPONSABLE_SI à créer une zone et journalise une entrée d'audit", async () => {
      const response = await request(app.getHttpServer())
        .post('/zones')
        .set(auth(tokens.respsi))
        .send({ nomZone: 'Zone créée par RESPONSABLE_SI' })
        .expect(201);

      const body = response.body as ZoneDto;
      expect(body.id).toEqual(expect.any(String));

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: { entite: 'Zone', entiteId: body.id },
      });
      expect(entreeAudit).not.toBeNull();
      expect(entreeAudit?.action).toBe('ZONE_CREATED');
    });

    it("autorise DIRECTION_GENERALE à créer une boutique et journalise une entrée d'audit", async () => {
      const response = await request(app.getHttpServer())
        .post('/boutiques')
        .set(auth(tokens.direction))
        .send({
          nom: 'Boutique créée par Direction',
          adresse: 'Adresse Y',
          zoneId: zoneAId,
        })
        .expect(201);

      const body = response.body as BoutiqueDto;
      expect(body.id).toEqual(expect.any(String));

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: { entite: 'Boutique', entiteId: body.id },
      });
      expect(entreeAudit).not.toBeNull();
      expect(entreeAudit?.action).toBe('BOUTIQUE_CREATED');
    });

    it('refuse la création de boutique sur une zone inexistante (400)', () => {
      return request(app.getHttpServer())
        .post('/boutiques')
        .set(auth(tokens.direction))
        .send({
          nom: 'Boutique orpheline',
          adresse: 'Adresse Z',
          zoneId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // Authentification obligatoire (§6.7) — aucune route sensible sans JWT.
  // ---------------------------------------------------------------------
  describe('Authentification obligatoire', () => {
    it('refuse (401) toute requête sans JWT', () => {
      return request(app.getHttpServer()).get('/caisses').expect(401);
    });
  });
});
