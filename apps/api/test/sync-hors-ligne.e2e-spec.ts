// Tests d'intégration réels (zéro mock) — preuve du rejeu idempotent d'une
// séquence hors-ligne réaliste (§6.7 : file d'ops POS idempotentes,
// resynchronisation à la reconnexion). Pas de nouvel endpoint batch —
// décision utilisateur confirmée : seule l'idempotence déjà en place
// (clientOperationId) sur les endpoints métier existants est prouvée ici.
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
  clientOperationId: string | null;
}

interface VenteDto {
  id: string;
  montantTotal: string;
  sessionCaisseId: string;
  lignes: { id: string; produitId: string; quantite: number }[];
}

interface RetourVenteDto {
  id: string;
  ligneVenteId: string;
  quantite: number;
  montantRembourse: string;
}

process.env.JWT_SECRET ??= 'test-secret-sync-hors-ligne-e2e';

describe('Synchronisation hors-ligne — rejeu idempotent §6.7 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutiqueId: string;
  let entrepotId: string;
  let caisseTiroirId: string;
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
    const body = response.body as { accessToken: string };
    return body.accessToken;
  }

  async function creerUtilisateur(
    loginValue: string,
    roleLibelle: string,
    boutiqueIdCible: string | null,
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
        boutiqueId: boutiqueIdCible,
      },
    });
    return utilisateur.id;
  }

  async function stockActuel(): Promise<number> {
    const stock = await env.prisma.stockQuant.findUnique({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    return stock?.quantite ?? 0;
  }

  // --- Les 4 opérations de la file hors-ligne, avec leurs clientOperationId
  // fixés côté caisse AVANT la coupure réseau (c'est cette identité qui
  // permet le rejeu sans doublon à la reconnexion). ---
  // Ouverture de session (§5.1) : clientOperationId doit être un UUID
  // (CreateSessionCaisseDto) — vente/retour acceptent eux une chaîne libre.
  const OP_OUVERTURE = '00000000-0000-4000-8000-000000000001';
  const OP_VENTE_1 = 'offline-op-vente-0002';
  const OP_VENTE_2 = 'offline-op-vente-0003';
  const OP_RETOUR = 'offline-op-retour-0004';

  function envoyerOuverture() {
    return request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(tokens.caissierB1))
      .send({
        caisseId: caisseTiroirId,
        fondInitial: 0,
        temoinLogin: 'resp-b1',
        temoinPassword: MOT_DE_PASSE,
        clientOperationId: OP_OUVERTURE,
      });
  }

  function envoyerVente(
    sessionId: string,
    clientOperationId: string,
    quantite: number,
  ) {
    return request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/ventes`)
      .set(auth(tokens.caissierB1))
      .send({
        lignes: [{ produitId, quantite }],
        modePaiement: 'ESPECES',
        clientOperationId,
      });
  }

  function envoyerRetour(
    sessionId: string,
    ligneVenteId: string,
    clientOperationId: string,
  ) {
    return request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/retours`)
      .set(auth(tokens.caissierB1))
      .send({ ligneVenteId, quantite: 1, clientOperationId });
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    const entrepot = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B1',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId,
      },
    });
    entrepotId = entrepot.id;

    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId, libelle: 'Magasin B1' },
    });
    const tiroir = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId,
        code: 'T01',
        libelle: 'Tiroir 1',
        actif: true,
        ordreAffichage: 1,
      },
    });
    caisseTiroirId = tiroir.id;

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Étui protection',
        prixUnitaire: '100.00',
        stock: 20,
      },
    });
    produitId = produit.id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId, quantite: 20 },
    });

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutiqueId, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutiqueId, 3);

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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it(
    'rejoue intégralement une séquence hors-ligne (ouverture + 2 ventes + 1 retour) après ' +
      'reconnexion : résultats identiques, aucun doublon en base',
    async () => {
      // --- Premier passage : la caisse exécute sa file d'opérations alors
      // qu'elle croit être connectée (en réalité la réponse serveur a été
      // reçue, mais on simule ensuite une coupure avant l'accusé de
      // réception final côté client, qui renverra donc tout). ---
      const ouverture1 = await envoyerOuverture().expect(201);
      const session1 = ouverture1.body as SessionCaisseDto;
      expect(session1.clientOperationId).toBe(OP_OUVERTURE);

      const vente1Premier = await envoyerVente(
        session1.id,
        OP_VENTE_1,
        2,
      ).expect(201);
      const vente1 = vente1Premier.body as VenteDto;

      const vente2Premier = await envoyerVente(
        session1.id,
        OP_VENTE_2,
        3,
      ).expect(201);
      const vente2 = vente2Premier.body as VenteDto;

      const retourPremier = await envoyerRetour(
        session1.id,
        vente1.lignes[0].id,
        OP_RETOUR,
      ).expect(201);
      const retour1 = retourPremier.body as RetourVenteDto;

      const stockApresPremierPassage = await stockActuel();
      // 20 initial − 2 (vente1) − 3 (vente2) + 1 (retour sur vente1) = 16.
      expect(stockApresPremierPassage).toBe(16);

      const [nbSessions1, nbVentes1, nbRetours1] = await Promise.all([
        env.prisma.sessionCaisse.count({ where: { caisseId: caisseTiroirId } }),
        env.prisma.vente.count({ where: { sessionCaisseId: session1.id } }),
        env.prisma.retourVente.count({
          where: { venteId: { in: [vente1.id, vente2.id] } },
        }),
      ]);
      expect(nbSessions1).toBe(1);
      expect(nbVentes1).toBe(2);
      expect(nbRetours1).toBe(1);

      // --- Reconnexion : la caisse rejoue toute la file, dans le même
      // ordre, avec exactement les mêmes clientOperationId (et donc les
      // mêmes corps de requête, y compris le ligneVenteId déjà connu). ---
      const ouvertureRejeu = await envoyerOuverture().expect(201);
      const sessionRejeu = ouvertureRejeu.body as SessionCaisseDto;
      expect(sessionRejeu.id).toBe(session1.id);

      const vente1Rejeu = await envoyerVente(session1.id, OP_VENTE_1, 2).expect(
        201,
      );
      expect((vente1Rejeu.body as VenteDto).id).toBe(vente1.id);

      const vente2Rejeu = await envoyerVente(session1.id, OP_VENTE_2, 3).expect(
        201,
      );
      expect((vente2Rejeu.body as VenteDto).id).toBe(vente2.id);

      const retourRejeu = await envoyerRetour(
        session1.id,
        vente1.lignes[0].id,
        OP_RETOUR,
      ).expect(201);
      expect((retourRejeu.body as RetourVenteDto).id).toBe(retour1.id);

      // --- Aucun doublon : mêmes compteurs, même stock qu'après le premier
      // passage (grand livre append-only — jamais de double écriture). ---
      const [nbSessions2, nbVentes2, nbRetours2] = await Promise.all([
        env.prisma.sessionCaisse.count({ where: { caisseId: caisseTiroirId } }),
        env.prisma.vente.count({ where: { sessionCaisseId: session1.id } }),
        env.prisma.retourVente.count({
          where: { venteId: { in: [vente1.id, vente2.id] } },
        }),
      ]);
      expect(nbSessions2).toBe(1);
      expect(nbVentes2).toBe(2);
      expect(nbRetours2).toBe(1);
      expect(await stockActuel()).toBe(stockApresPremierPassage);
    },
  );

  it(
    'échec en cascade explicite : une vente rejouée dont la session ne s’est jamais ' +
      'synchronisée est rejetée (404), aucune écriture silencieuse',
    async () => {
      // Simule une file hors-ligne où l'opération d'ouverture de session
      // elle-même n'a jamais atteint le serveur (perte réseau avant même le
      // premier envoi) : le sessionId référencé par la vente en attente
      // n'existe donc nulle part côté serveur.
      const sessionIdJamaisSynchronisee =
        '00000000-0000-4000-8000-000000000099';

      const ventesAvant = await env.prisma.vente.count();
      const stockAvant = await stockActuel();

      await envoyerVente(
        sessionIdJamaisSynchronisee,
        'offline-op-vente-orpheline-0099',
        1,
      ).expect(404);

      expect(await env.prisma.vente.count()).toBe(ventesAvant);
      expect(await stockActuel()).toBe(stockAvant);
    },
  );
});
