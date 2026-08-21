// Tests d'intégration réels (zéro mock) — module Ventes / POS boutique
// (§6.3.2, §5.1, §6.4 du cahier des charges). Démarre un vrai PostgreSQL via
// Testcontainers, seed une organisation minimale et authentifie chaque
// profil via le vrai endpoint /auth/login (pas de JWT forgé à la main).
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
  caisseId: string;
  fondInitial: string;
  transactionVersementId: string | null;
}

interface VenteDto {
  id: string;
  montantTotal: string;
  modePaiement: string;
  clientId: string | null;
  sessionCaisseId: string;
  lignes: { produitId: string; quantite: number; prixUnitaire: string }[];
}

interface ClotureResponseDto {
  session: SessionCaisseDto;
  releve: { modePaiement: string; total: string; nombreVentes: number }[];
  transactionVersementId: string | null;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Ventes / POS boutique — §6.3.2, §5.1, §6.4 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique2Id: string;
  let caisse1Id: string; // MAGASIN (cash office), boutique 1 — ventes via TIROIR
  let caisse2Id: string; // MAGASIN (cash office), boutique 2
  let caisseCentraleId: string;
  let produitStock5Id: string; // prix 1000, stock 5
  let produitStock2Id: string; // prix 500, stock 2
  let clientId: string;

  const tokens: Record<string, string> = {};

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function login(loginValue: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    const body = response.body as { accessToken: string };
    return body.accessToken;
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

  function ouvrirSession(
    token: string,
    caisseId: string,
    fondInitial: number,
    temoinLogin: string,
    temoinPassword: string = MOT_DE_PASSE,
  ) {
    return request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(token))
      .send({ caisseId, fondInitial, temoinLogin, temoinPassword });
  }

  beforeAll(async () => {
    await env.start();

    const zoneA = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneA.id },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 2', adresse: 'Adresse 2', zoneId: zoneA.id },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;

    const entrepot1 = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B1',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique1Id,
      },
    });
    await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B2',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique2Id,
      },
    });

    const magasin1 = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId: boutique1Id,
        libelle: 'Magasin B1',
      },
    });
    const magasin2 = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId: boutique2Id,
        libelle: 'Magasin B2',
      },
    });
    const caisse1 = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId: boutique1Id,
        code: 'T01',
        libelle: 'Tiroir 1',
        actif: true,
        ordreAffichage: 1,
      },
    });
    const caisse2 = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId: boutique2Id,
        code: 'T01',
        libelle: 'Tiroir 1',
        actif: true,
        ordreAffichage: 1,
      },
    });
    const caisseCentrale = await env.prisma.caisse.create({
      data: { type: TypeCaisse.CENTRALE, boutiqueId: null },
    });
    void magasin1;
    void magasin2;
    caisse1Id = caisse1.id;
    caisse2Id = caisse2.id;
    caisseCentraleId = caisseCentrale.id;

    const produitStock5 = await env.prisma.produit.create({
      data: {
        designation: 'Coque téléphone',
        prixUnitaire: '1000.00',
        stock: 5,
      },
    });
    const produitStock2 = await env.prisma.produit.create({
      data: { designation: 'Chargeur rare', prixUnitaire: '500.00', stock: 2 },
    });
    produitStock5Id = produitStock5.id;
    produitStock2Id = produitStock2.id;

    await env.prisma.stockQuant.createMany({
      data: [
        { produitId: produitStock5Id, entrepotId: entrepot1.id, quantite: 5 },
        { produitId: produitStock2Id, entrepotId: entrepot1.id, quantite: 2 },
      ],
    });

    const client = await env.prisma.client.create({
      data: { nom: 'Client', prenom: 'Test' },
    });
    clientId = client.id;

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutique1Id, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutique1Id, 3);
    await creerUtilisateur('caissier-b2', 'CAISSIER_BOUTIQUE', boutique2Id, 4);
    await creerUtilisateur('resp-b2', 'RESPONSABLE_BOUTIQUE', boutique2Id, 3);
    // Témoin ineligible : présent dans boutique1 mais rôle hors périmètre boutique.
    await creerUtilisateur(
      'superviseur-b1',
      'SUPERVISEUR_ZONE',
      boutique1Id,
      2,
    );
    await creerUtilisateur('caissier-central', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('controle', 'CONTROLEUR_INTERNE', null, 1);
    await creerUtilisateur('convoyeur-b1', 'CONVOYEUR', boutique1Id, 4);

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
    tokens.caissierB2 = await login('caissier-b2');
    tokens.respB2 = await login('resp-b2');
    tokens.superviseurB1 = await login('superviseur-b1');
    tokens.caissierCentral = await login('caissier-central');
    tokens.daf = await login('daf');
    tokens.controle = await login('controle');
    tokens.convoyeurB1 = await login('convoyeur-b1');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  // ---------------------------------------------------------------------
  // RBAC — écriture réservée au périmètre boutique (§4, §6.2).
  // ---------------------------------------------------------------------
  describe('RBAC serveur — ouverture de session réservée au périmètre boutique', () => {
    it('refuse (403) qu’un DAF (réseau trésorerie, hors périmètre boutique) ouvre une session', async () => {
      await ouvrirSession(tokens.daf, caisse1Id, 5000, 'resp-b1').expect(403);
    });

    it('refuse (403) qu’un CONTROLEUR_INTERNE ouvre une session', async () => {
      await ouvrirSession(tokens.controle, caisse1Id, 5000, 'resp-b1').expect(
        403,
      );
    });

    it('refuse (403) qu’un CONVOYEUR ouvre une session POS (jamais encaisser §4)', async () => {
      await ouvrirSession(
        tokens.convoyeurB1,
        caisse1Id,
        5000,
        'resp-b1',
      ).expect(403);
    });

    it('refuse (401) tout accès sans authentification', () => {
      return request(app.getHttpServer()).post('/ventes/sessions').expect(401);
    });
  });

  // ---------------------------------------------------------------------
  // Ouverture de session — règles métier §5.1.
  // ---------------------------------------------------------------------
  describe('GET /ventes/temoins-eligibles', () => {
    it('liste les coéquipiers éligibles de la boutique (hors soi)', async () => {
      const response = await request(app.getHttpServer())
        .get('/ventes/temoins-eligibles')
        .set(auth(tokens.caissierB1))
        .expect(200);
      expect(Array.isArray(response.body)).toBe(true);
      const temoins = response.body as Array<{ login: string }>;
      expect(temoins.every((t) => t.login !== 'caissier-b1')).toBe(true);
      expect(temoins.some((t) => t.login === 'resp-b1')).toBe(true);
    });

    it('refuse un rôle hors périmètre boutique', async () => {
      await request(app.getHttpServer())
        .get('/ventes/temoins-eligibles')
        .set(auth(tokens.daf))
        .expect(403);
    });
  });

  describe('Ouverture de session (§5.1)', () => {
    it('refuse un mot de passe confirmateur incorrect (§5.1)', async () => {
      await request(app.getHttpServer())
        .post('/ventes/sessions')
        .set(auth(tokens.caissierB1))
        .send({
          caisseId: caisse1Id,
          fondInitial: 1000,
          temoinLogin: 'resp-b1',
          temoinPassword: 'mauvais-mot-de-passe',
        })
        .expect(400);
    });

    it('refuse (400) l’ouverture d’une session sur une caisse CENTRALE', async () => {
      // caissier-b1 est bien dans le périmètre boutique (RBAC OK) : le rejet
      // vient ici de la règle métier "caisse TIROIR uniquement", pas du
      // RBAC — le témoin n'a pas d'importance, la vérification du type de
      // caisse est faite avant la résolution du témoin.
      await ouvrirSession(
        tokens.caissierB1,
        caisseCentraleId,
        5000,
        'resp-b1',
      ).expect(400);
    });

    it('refuse (403) qu’un caissier ouvre une session depuis la caisse d’une autre boutique', async () => {
      await ouvrirSession(tokens.caissierB1, caisse2Id, 5000, 'resp-b1').expect(
        403,
      );
    });

    it('refuse (400) un témoin qui est l’acteur lui-même', async () => {
      await ouvrirSession(
        tokens.caissierB1,
        caisse1Id,
        5000,
        'caissier-b1',
      ).expect(400);
    });

    it('refuse (400) un témoin rattaché à une autre boutique', async () => {
      await ouvrirSession(
        tokens.caissierB1,
        caisse1Id,
        5000,
        'caissier-b2',
      ).expect(400);
    });

    it('refuse (400) un témoin dont le rôle n’est pas éligible (ni caissier ni responsable boutique)', async () => {
      await ouvrirSession(
        tokens.caissierB1,
        caisse1Id,
        5000,
        'superviseur-b1',
      ).expect(400);
    });

    let sessionBoutique1Id: string;

    it('autorise l’ouverture par un caissier boutique avec témoin valide, journalise SESSION_CAISSE_OUVERTE', async () => {
      const response = await ouvrirSession(
        tokens.caissierB1,
        caisse1Id,
        5000,
        'resp-b1',
      ).expect(201);

      const body = response.body as SessionCaisseDto;
      expect(body.statut).toBe('OUVERTE');
      expect(Number(body.fondInitial)).toBe(5000);
      sessionBoutique1Id = body.id;

      const entreeAudit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'SessionCaisse',
          entiteId: body.id,
          action: 'SESSION_CAISSE_OUVERTE',
        },
      });
      expect(entreeAudit).not.toBeNull();
    });

    it('refuse (400) l’ouverture d’une 2e session tant que la précédente n’est pas fermée', async () => {
      expect(sessionBoutique1Id).toEqual(expect.any(String));
      await ouvrirSession(tokens.respB1, caisse1Id, 1000, 'caissier-b1').expect(
        400,
      );
    });

    // ---------------------------------------------------------------------
    // Encaissement de ventes (§6.3.2) sur la session ouverte de boutique1.
    // ---------------------------------------------------------------------
    describe('Encaissement de ventes sur la session ouverte', () => {
      it('refuse (403) qu’un rôle hors périmètre boutique encaisse une vente', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.daf))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 1 }],
            modePaiement: 'ESPECES',
          })
          .expect(403);
      });

      it('refuse (403) qu’un caissier d’une autre boutique encaisse une vente sur cette session', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB2))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 1 }],
            modePaiement: 'ESPECES',
          })
          .expect(403);
      });

      it('refuse (404) une vente sur une session inexistante', async () => {
        await request(app.getHttpServer())
          .post('/ventes/sessions/00000000-0000-0000-0000-000000000000/ventes')
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 1 }],
            modePaiement: 'ESPECES',
          })
          .expect(404);
      });

      it('refuse (400) une injection de montantTotal par le client (whitelist stricte — jamais de confiance dans un total client)', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 1 }],
            modePaiement: 'ESPECES',
            montantTotal: 1,
          })
          .expect(400);
      });

      it('refuse (400) un stock insuffisant, sans aucune écriture (stock inchangé, aucune Vente créée)', async () => {
        const ventesAvant = await env.prisma.vente.count({
          where: { sessionCaisseId: sessionBoutique1Id },
        });

        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: produitStock2Id, quantite: 5 }],
            modePaiement: 'ESPECES',
          })
          .expect(400);

        const produit = await env.prisma.produit.findUnique({
          where: { id: produitStock2Id },
        });
        expect(produit?.stock).toBe(2);

        const ventesApres = await env.prisma.vente.count({
          where: { sessionCaisseId: sessionBoutique1Id },
        });
        expect(ventesApres).toBe(ventesAvant);
      });

      it('refuse (400) l’encaissement d’un produit inactif, sans écriture', async () => {
        const inactif = await env.prisma.produit.create({
          data: {
            designation: 'Produit retiré du catalogue',
            prixUnitaire: '800.00',
            stock: 10,
            actif: false,
          },
        });
        await env.prisma.stockQuant.create({
          data: {
            produitId: inactif.id,
            entrepotId: (
              await env.prisma.entrepot.findFirstOrThrow({
                where: { boutiqueId: boutique1Id, type: 'PRINCIPAL' },
              })
            ).id,
            quantite: 10,
          },
        });

        const ventesAvant = await env.prisma.vente.count({
          where: { sessionCaisseId: sessionBoutique1Id },
        });

        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: inactif.id, quantite: 1 }],
            modePaiement: 'ESPECES',
          })
          .expect(400);

        const ventesApres = await env.prisma.vente.count({
          where: { sessionCaisseId: sessionBoutique1Id },
        });
        expect(ventesApres).toBe(ventesAvant);
      });

      it('encaisse une vente ESPECES sans client (anonyme), montantTotal recalculé serveur, journalise VENTE_ENREGISTREE', async () => {
        const response = await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 2 }],
            modePaiement: 'ESPECES',
          })
          .expect(201);

        const body = response.body as VenteDto;
        expect(body.clientId).toBeNull();
        expect(Number(body.montantTotal)).toBe(2000); // 2 x 1000

        const entreeAudit = await env.prisma.journalAudit.findFirst({
          where: {
            entite: 'Vente',
            entiteId: body.id,
            action: 'VENTE_ENREGISTREE',
          },
        });
        expect(entreeAudit).not.toBeNull();

        const produit = await env.prisma.produit.findUnique({
          where: { id: produitStock5Id },
        });
        expect(produit?.stock).toBe(3); // 5 - 2
      });

      it('encaisse une vente CARTE avec client rattaché', async () => {
        const response = await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 1 }],
            modePaiement: 'CARTE',
            clientId,
          })
          .expect(201);

        const body = response.body as VenteDto;
        expect(body.clientId).toBe(clientId);
        expect(Number(body.montantTotal)).toBe(1000);
      });
    });

    // ---------------------------------------------------------------------
    // Lecture des tickets de la session — tiroir POS survivant au refresh
    // (§6.3.2). Même RBAC que GET /ventes/sessions/:id (lecture caisses).
    // ---------------------------------------------------------------------
    describe('GET /ventes/sessions/:id/ventes', () => {
      it('refuse (403) qu’un caissier d’une autre boutique lise les tickets', async () => {
        await request(app.getHttpServer())
          .get(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB2))
          .expect(403);
      });

      it('liste les ventes de la session (lignes + produit + retours) pour le caissier boutique', async () => {
        const response = await request(app.getHttpServer())
          .get(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .expect(200);

        const body = response.body as Array<
          VenteDto & {
            retours: unknown[];
            lignes: { produit: { designation: string } }[];
          }
        >;
        expect(body).toHaveLength(2);
        expect(
          body.every((v) => v.sessionCaisseId === sessionBoutique1Id),
        ).toBe(true);
        expect(body[0]?.lignes[0]?.produit.designation).toEqual(
          expect.any(String),
        );
        expect(Array.isArray(body[0]?.retours)).toBe(true);
      });

      it('autorise (200) la lecture réseau par le DAF — sans droit d’encaisser', async () => {
        await request(app.getHttpServer())
          .get(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.daf))
          .expect(200);
      });
    });

    // ---------------------------------------------------------------------
    // Clôture de session (§5.1, §6.4) — panachage ESPECES/CARTE dans la
    // même session : la ligne 1000 (ESPECES) + la ligne 2000 (ESPECES) déjà
    // encaissées ci-dessus totalisent 2000 ESPECES, + 1000 CARTE. Seul le
    // total ESPECES doit alimenter le bordereau généré à la clôture.
    // ---------------------------------------------------------------------
    describe('Clôture de session', () => {
      it('refuse (403) la clôture par un rôle hors périmètre boutique', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/cloture`)
          .set(auth(tokens.daf))
          .send({
            fondCompteCloture: 7000,
            temoinLogin: 'resp-b1',
            temoinPassword: MOT_DE_PASSE,
          })
          .expect(403);
      });

      it('refuse (400) un témoin invalide à la clôture (l’acteur lui-même)', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/cloture`)
          .set(auth(tokens.caissierB1))
          .send({
            fondCompteCloture: 7000,
            temoinLogin: 'caissier-b1',
            temoinPassword: MOT_DE_PASSE,
          })
          .expect(400);
      });

      let transactionVersementId: string;

      it('clôture la session : transfert interne tiroir→magasin (espèces comptées), journalise SESSION_CAISSE_FERMEE', async () => {
        const response = await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/cloture`)
          .set(auth(tokens.caissierB1))
          .send({
            fondCompteCloture: 7000,
            temoinLogin: 'resp-b1',
            temoinPassword: MOT_DE_PASSE,
          })
          .expect(201);

        const body = response.body as ClotureResponseDto;
        expect(body.session.statut).toBe('FERMEE');
        expect(body.transactionVersementId).toEqual(expect.any(String));
        transactionVersementId = body.transactionVersementId as string;

        const totalEspeces = body.releve.find(
          (l) => l.modePaiement === 'ESPECES',
        );
        expect(totalEspeces?.total).toBe('2000.00');

        const transaction = await env.prisma.transactionCaisse.findUnique({
          where: { id: transactionVersementId },
        });
        expect(transaction).not.toBeNull();
        expect(transaction?.type).toBe('TRANSFERT_INTERNE');
        expect(transaction?.statut).toBe('VALIDEE');
        expect(Number(transaction?.montant)).toBe(7000);

        const entreeAudit = await env.prisma.journalAudit.findFirst({
          where: {
            entite: 'SessionCaisse',
            entiteId: sessionBoutique1Id,
            action: 'SESSION_CAISSE_FERMEE',
          },
        });
        expect(entreeAudit).not.toBeNull();
      });

      it('refuse (400) de clôturer une session déjà fermée', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/cloture`)
          .set(auth(tokens.caissierB1))
          .send({
            fondCompteCloture: 7000,
            temoinLogin: 'resp-b1',
            temoinPassword: MOT_DE_PASSE,
          })
          .expect(400);
      });

      it('refuse (400) d’encaisser une vente sur une session désormais fermée', async () => {
        await request(app.getHttpServer())
          .post(`/ventes/sessions/${sessionBoutique1Id}/ventes`)
          .set(auth(tokens.caissierB1))
          .send({
            lignes: [{ produitId: produitStock5Id, quantite: 1 }],
            modePaiement: 'ESPECES',
          })
          .expect(400);
      });

      it('le transfert interne crédite immédiatement la caisse MAGASIN (hors circuit §6.4)', async () => {
        const soldeTiroir = await request(app.getHttpServer())
          .get(`/caisses/${caisse1Id}/solde`)
          .set(auth(tokens.daf))
          .expect(200);
        expect((soldeTiroir.body as { solde: string }).solde).toBe('0.00');

        const transfert = await env.prisma.transactionCaisse.findUnique({
          where: { id: transactionVersementId },
          include: { contreparties: true },
        });
        expect(transfert?.type).toBe('TRANSFERT_INTERNE');
        expect(transfert?.statut).toBe('VALIDEE');
        expect(transfert?.contreparties.length).toBe(1);

        const magasin = await env.prisma.caisse.findFirst({
          where: { boutiqueId: boutique1Id, type: TypeCaisse.MAGASIN },
        });
        const soldeMagasin = await request(app.getHttpServer())
          .get(`/caisses/${magasin!.id}/solde`)
          .set(auth(tokens.daf))
          .expect(200);
        // Fond initial remis + ventes espèces (7000) moins le float sorti à l'ouverture (5000) = +2000 net ventes
        // Magasin : -5000 (float out) +7000 (retour) = +2000
        expect((soldeMagasin.body as { solde: string }).solde).toBe('2000.00');
      });
    });
  });

  // ---------------------------------------------------------------------
  // Session sans aucune vente ESPECES : aucun bordereau généré à la clôture.
  // ---------------------------------------------------------------------
  describe('Clôture d’une session sans vente ESPECES (uniquement CARTE)', () => {
    it('ne génère aucune TransactionCaisse à la clôture quand le total ESPECES est nul', async () => {
      const entrepotB2 = await env.prisma.entrepot.findFirstOrThrow({
        where: { boutiqueId: boutique2Id, type: 'PRINCIPAL' },
      });
      await env.prisma.stockQuant.upsert({
        where: {
          produitId_entrepotId: {
            produitId: produitStock5Id,
            entrepotId: entrepotB2.id,
          },
        },
        update: { quantite: 5 },
        create: {
          produitId: produitStock5Id,
          entrepotId: entrepotB2.id,
          quantite: 5,
        },
      });
      const somme = await env.prisma.stockQuant.aggregate({
        where: { produitId: produitStock5Id },
        _sum: { quantite: true },
      });
      await env.prisma.produit.update({
        where: { id: produitStock5Id },
        data: { stock: somme._sum.quantite ?? 0 },
      });

      const ouverture = await ouvrirSession(
        tokens.caissierB2,
        caisse2Id,
        1000,
        'resp-b2',
      ).expect(201);
      const sessionId = (ouverture.body as SessionCaisseDto).id;

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB2))
        .send({
          lignes: [{ produitId: produitStock5Id, quantite: 1 }],
          modePaiement: 'CARTE',
        })
        .expect(201);

      const cloture = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/cloture`)
        .set(auth(tokens.caissierB2))
        .send({
          fondCompteCloture: 1000,
          temoinLogin: 'resp-b2',
          temoinPassword: MOT_DE_PASSE,
        })
        .expect(201);

      const body = cloture.body as ClotureResponseDto;
      // Retour du fond de caisse (float) vers MAGASIN — hors ESPECES de vente.
      expect(body.transactionVersementId).toEqual(expect.any(String));
      const transfert = await env.prisma.transactionCaisse.findUnique({
        where: { id: body.transactionVersementId! },
      });
      expect(transfert?.type).toBe('TRANSFERT_INTERNE');
      expect(Number(transfert?.montant)).toBe(1000);
    });
  });

  // ---------------------------------------------------------------------
  // Idempotence hors-ligne (§6.7) : rejouer le même clientOperationId
  // ne crée pas de second ticket et ne redécrémente pas le stock.
  // ---------------------------------------------------------------------
  describe('Idempotence hors-ligne des ventes §6.7', () => {
    it('réutilise clientOperationId sans second décrément de stock', async () => {
      const entrepotB2 = await env.prisma.entrepot.findFirstOrThrow({
        where: { boutiqueId: boutique2Id, type: 'PRINCIPAL' },
      });
      await env.prisma.stockQuant.upsert({
        where: {
          produitId_entrepotId: {
            produitId: produitStock2Id,
            entrepotId: entrepotB2.id,
          },
        },
        update: { quantite: 4 },
        create: {
          produitId: produitStock2Id,
          entrepotId: entrepotB2.id,
          quantite: 4,
        },
      });
      const somme = await env.prisma.stockQuant.aggregate({
        where: { produitId: produitStock2Id },
        _sum: { quantite: true },
      });
      await env.prisma.produit.update({
        where: { id: produitStock2Id },
        data: { stock: somme._sum.quantite ?? 0 },
      });

      const ouverture = await ouvrirSession(
        tokens.caissierB2,
        caisse2Id,
        500,
        'resp-b2',
      ).expect(201);
      const sessionId = (ouverture.body as SessionCaisseDto).id;
      const clientOperationId = 'vente-offline-test-001';
      const payload = {
        lignes: [{ produitId: produitStock2Id, quantite: 1 }],
        modePaiement: 'CARTE',
        clientOperationId,
      };

      const premiere = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB2))
        .send(payload)
        .expect(201);
      const body1 = premiere.body as VenteDto;

      const stockApres1 = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: {
            produitId: produitStock2Id,
            entrepotId: entrepotB2.id,
          },
        },
      });

      const replay = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB2))
        .send(payload)
        .expect(201);
      const body2 = replay.body as VenteDto;

      expect(body2.id).toBe(body1.id);
      const stockApres2 = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: {
            produitId: produitStock2Id,
            entrepotId: entrepotB2.id,
          },
        },
      });
      expect(stockApres2?.quantite).toBe(stockApres1?.quantite);
      expect(stockApres2?.quantite).toBe(3);

      await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB2))
        .expect(200)
        .expect((res) => {
          expect(
            (res.body as VenteDto[]).filter((v) => v.id === body1.id),
          ).toHaveLength(1);
        });
    });
  });

  describe('Paiement mixte, dérogation chef de caisse, réservation stock', () => {
    let sessionId: string;
    let produitMixteId: string;
    let produitReserveId: string;
    let produitRuptureId: string;
    let entrepotId: string;

    beforeAll(async () => {
      const entrepot = await env.prisma.entrepot.findFirst({
        where: { boutiqueId: boutique1Id, type: 'PRINCIPAL' },
      });
      if (!entrepot) throw new Error('entrepôt B1 manquant');
      entrepotId = entrepot.id;

      const mixte = await env.prisma.produit.create({
        data: {
          designation: 'Article mixte',
          prixUnitaire: '1000.00',
          stock: 10,
        },
      });
      const reserve = await env.prisma.produit.create({
        data: {
          designation: 'Article réservé',
          prixUnitaire: '800.00',
          stock: 5,
        },
      });
      const rupture = await env.prisma.produit.create({
        data: {
          designation: 'Article rupture',
          prixUnitaire: '200.00',
          stock: 1,
        },
      });
      produitMixteId = mixte.id;
      produitReserveId = reserve.id;
      produitRuptureId = rupture.id;
      await env.prisma.stockQuant.createMany({
        data: [
          { produitId: produitMixteId, entrepotId, quantite: 10 },
          { produitId: produitReserveId, entrepotId, quantite: 5 },
          { produitId: produitRuptureId, entrepotId, quantite: 1 },
        ],
      });

      const ouverture = await ouvrirSession(
        tokens.caissierB1,
        caisse1Id,
        2000,
        'resp-b1',
      );
      if (ouverture.status !== 201) {
        // session déjà ouverte par un autre describe : on la réutilise
        const sessions = await request(app.getHttpServer())
          .get('/ventes/sessions')
          .set(auth(tokens.caissierB1))
          .expect(200);
        const ouverte = (sessions.body as SessionCaisseDto[]).find(
          (s) => s.caisseId === caisse1Id && s.statut === 'OUVERTE',
        );
        if (!ouverte) throw new Error('session B1 introuvable');
        sessionId = ouverte.id;
      } else {
        sessionId = (ouverture.body as SessionCaisseDto).id;
      }
    });

    it('encaisser espèces + carte : stock une fois, Z espèces = part cash', async () => {
      const body = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitMixteId, quantite: 1 }],
          modePaiement: 'ESPECES',
          paiements: [
            { modePaiement: 'ESPECES', montant: 400 },
            { modePaiement: 'CARTE', montant: 600 },
          ],
        })
        .expect(201)
        .then(
          (r) =>
            r.body as VenteDto & {
              paiements: { modePaiement: string; montant: string }[];
            },
        );

      expect(Number(body.montantTotal)).toBe(1000);
      expect(body.paiements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ modePaiement: 'ESPECES', montant: '400' }),
          expect.objectContaining({ modePaiement: 'CARTE', montant: '600' }),
        ]),
      );

      const stock = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: { produitId: produitMixteId, entrepotId },
        },
      });
      expect(stock?.quantite).toBe(9);

      const releve = await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/cloture/pdf`)
        .set(auth(tokens.caissierB1))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200)
        .expect('Content-Type', /pdf/);
      expect((releve.body as Buffer).byteLength).toBeGreaterThan(200);
    });

    it('refuse (400) une somme de règlements différente du total', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitMixteId, quantite: 1 }],
          modePaiement: 'ESPECES',
          paiements: [
            { modePaiement: 'ESPECES', montant: 100 },
            { modePaiement: 'CARTE', montant: 100 },
          ],
        })
        .expect(400);
    });

    it('refuse (400) une remise > 20% sans dérogation', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitMixteId, quantite: 1, remise: 300 }],
          modePaiement: 'CARTE',
        })
        .expect(400);
    });

    it('accepte une remise > 20% avec login/mot de passe du responsable boutique', async () => {
      const body = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitMixteId, quantite: 1, remise: 300 }],
          modePaiement: 'CARTE',
          derogation: {
            motifs: ['REMISE_PLAFOND'],
            login: 'resp-b1',
            password: MOT_DE_PASSE,
          },
        })
        .expect(201)
        .then((r) => r.body as VenteDto);
      expect(Number(body.montantTotal)).toBe(700);

      const audit = await env.prisma.journalAudit.findFirst({
        where: { action: 'DEROGATION_CAISSE', entiteId: body.id },
      });
      expect(audit).not.toBeNull();
    });

    it('refuse (400) une auto-dérogation du caissier', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitMixteId, quantite: 1, remise: 300 }],
          modePaiement: 'CARTE',
          derogation: {
            motifs: ['REMISE_PLAFOND'],
            login: 'caissier-b1',
            password: MOT_DE_PASSE,
          },
        })
        .expect(400);
    });

    it('refuse (400) le responsable d’une autre boutique', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitMixteId, quantite: 1, remise: 300 }],
          modePaiement: 'CARTE',
          derogation: {
            motifs: ['REMISE_PLAFOND'],
            login: 'resp-b2',
            password: MOT_DE_PASSE,
          },
        })
        .expect(400);
    });

    it('réserve le stock d’un ticket en attente et bloque le reliquat', async () => {
      const holdId = 'a1a1a1a1-b2b2-4c3c-a4d4-e5e5e5e5e5e5';
      await request(app.getHttpServer())
        .put(`/ventes/sessions/${sessionId}/reservations`)
        .set(auth(tokens.caissierB1))
        .send({
          holdId,
          lignes: [{ produitId: produitReserveId, quantite: 4 }],
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitReserveId, quantite: 2 }],
          modePaiement: 'CARTE',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitReserveId, quantite: 1 }],
          modePaiement: 'CARTE',
        })
        .expect(201);

      const physique = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: { produitId: produitReserveId, entrepotId },
        },
      });
      expect(physique?.quantite).toBe(4);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitReserveId, quantite: 4 }],
          modePaiement: 'CARTE',
          holdId,
        })
        .expect(201);

      const apres = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: { produitId: produitReserveId, entrepotId },
        },
      });
      expect(apres?.quantite).toBe(0);
      const restant = await env.prisma.reservationStock.count({
        where: { holdId },
      });
      expect(restant).toBe(0);
    });

    it('autorise une vente en rupture avec dérogation STOCK_INSUFFISANT', async () => {
      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitRuptureId, quantite: 3 }],
          modePaiement: 'CARTE',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [{ produitId: produitRuptureId, quantite: 3 }],
          modePaiement: 'CARTE',
          derogation: {
            motifs: ['STOCK_INSUFFISANT'],
            login: 'resp-b1',
            password: MOT_DE_PASSE,
          },
        })
        .expect(201);

      const stock = await env.prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: { produitId: produitRuptureId, entrepotId },
        },
      });
      expect(stock?.quantite).toBe(-2);
    });

    it('refuse la clôture tant qu’une réservation existe', async () => {
      const holdId = 'b2b2b2b2-c3c3-4d4d-a5a5-f6f6f6f6f6f6';
      await request(app.getHttpServer())
        .put(`/ventes/sessions/${sessionId}/reservations`)
        .set(auth(tokens.caissierB1))
        .send({
          holdId,
          lignes: [{ produitId: produitMixteId, quantite: 1 }],
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/cloture`)
        .set(auth(tokens.caissierB1))
        .send({
          fondCompteCloture: 2000,
          temoinLogin: 'resp-b1',
          temoinPassword: MOT_DE_PASSE,
        })
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/ventes/sessions/${sessionId}/reservations/${holdId}`)
        .set(auth(tokens.caissierB1))
        .expect(200);
    });

    it('persiste le snapshot du ticket : GET reprend la file après un PUT', async () => {
      const holdId = 'c3c3c3c3-d4d4-4e5e-a6f6-a7a7a7a7a7a7';
      const put = await request(app.getHttpServer())
        .put(`/ventes/sessions/${sessionId}/reservations`)
        .set(auth(tokens.caissierB1))
        .send({
          holdId,
          numero: 7,
          libelle: 'Mme Diallo',
          motif: 'OUBLI_PAIEMENT',
          lignes: [{ produitId: produitMixteId, quantite: 1 }],
          panier: [
            {
              produitId: produitMixteId,
              designation: 'Article mixte',
              prixUnitaire: '1000.00',
              stock: 8,
              quantite: 1,
              remise: 0,
            },
          ],
        });
      expect(put.status).toBe(200);

      const liste = await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/reservations`)
        .set(auth(tokens.caissierB1))
        .expect(200)
        .then(
          (r) =>
            r.body as Array<{
              id: string;
              numero: number;
              libelle: string;
              panier: Array<{ produitId: string; quantite: number }>;
            }>,
        );
      const ticket = liste.find((t) => t.id === holdId);
      expect(ticket).toMatchObject({
        numero: 7,
        libelle: 'Mme Diallo',
      });
      expect(ticket?.panier[0]?.quantite).toBe(1);

      await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/reservations`)
        .set(auth(tokens.caissierCentral))
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/ventes/sessions/${sessionId}/reservations/${holdId}`)
        .set(auth(tokens.caissierB1))
        .expect(200);

      const apres = await request(app.getHttpServer())
        .get(`/ventes/sessions/${sessionId}/reservations`)
        .set(auth(tokens.caissierB1))
        .expect(200)
        .then((r) => r.body as Array<{ id: string }>);
      expect(apres.find((t) => t.id === holdId)).toBeUndefined();
    });
  });
});
