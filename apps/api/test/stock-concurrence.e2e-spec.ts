// E2E — Race condition sur le stock (CRITIQUE).
// Reproduit la lecture concurrente de StockQuant sans verrou dans
// StockService.appliquerMouvementTx (lecture via findUnique sans FOR UPDATE,
// suivie d'un upsert) : deux transactions concurrentes peuvent lire le même
// `actuel` avant qu'aucune n'écrive, et bypasser le contrôle anti-négatif.
//
// AVANT FIX (constaté en exécutant ce test sur le code non corrigé, avant
// l'ajout de lockProduit()/Serializable) :
// - Test 1 (10 ventes concurrentes sur stock=5) : 10 succès / 0 échec au
//   lieu des 5 succès / 5 échecs attendus — le garde-fou anti-négatif
//   (apres < 0) était intégralement contourné car chaque transaction lisait
//   indépendamment `actuel = 5` avant qu'aucune n'écrive (upsert sans
//   verrou = dernière écriture gagne, écritures perdues).
// - Test 2 (transfert + ajustement + 2 ventes concurrents) : quantA observé
//   = 12 au lieu de la valeur cohérente avec l'invariant
//   quantitéInitiale(10) + Σ(deltas du grand livre MouvementStock) — preuve
//   que des écritures avaient été perdues / lues en se basant sur un état
//   obsolète.
//
// APRÈS FIX (SELECT ... FOR UPDATE sur produit + isolation Serializable, avec
// réessai interne borné sur conflit de sérialisation Postgres 40001/P2034 —
// cf. commentaire d'appliquerMouvement() : sous isolation Serializable, un
// verrou FOR UPDATE qui se débloque après un commit concurrent sur la même
// ligne avorte avec 40001 au lieu de relire silencieusement la valeur à
// jour, comportement documenté de Postgres ; le réessai rejoue l'opération
// entière à partir de l'état réel) : exactement 5 succès, 5 échecs (400),
// quantite finale = 0 pour le test 1 ; invariants du grand livre vérifiés
// exactement pour le test 2. Vérifié stable sur 5 exécutions consécutives.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StockService } from '../src/stocks/stock.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';
process.env.JWT_SECRET ??= 'test-secret-stock-concurrence-e2e';

describe('Stock — concurrence (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let stockService: StockService;
  let utilisateurId: string;
  let entrepotAId: string;
  let entrepotBId: string;

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Concurrence Stock' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Concurrence', adresse: 'Adr', zoneId: zone.id },
    });
    const entrepotA = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Concurrence A',
        code: 'PRINCIPAL-CONC-A',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });
    entrepotAId = entrepotA.id;
    const entrepotB = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Concurrence B',
        code: 'PRINCIPAL-CONC-B',
        type: 'SECONDAIRE',
        boutiqueId: boutique.id,
      },
    });
    entrepotBId = entrepotB.id;

    const role = await env.prisma.role.upsert({
      where: { libelle: 'CAISSIER_BOUTIQUE' },
      update: {},
      create: { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
    });
    const utilisateur = await env.prisma.utilisateur.create({
      data: {
        login: 'conc-caissier',
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Concurrence',
        prenom: 'Test',
        roleId: role.id,
        boutiqueId: boutique.id,
      },
    });
    utilisateurId = utilisateur.id;

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
    stockService = app.get(StockService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('10 ventes concurrentes de 1 unité sur un stock de 5 : exactement 5 succès, 5 échecs, quantite finale = 0', async () => {
    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Produit concurrence vente',
        prixUnitaire: '100.00',
        stock: 0,
      },
    });
    await env.prisma.stockQuant.create({
      data: { produitId: produit.id, entrepotId: entrepotAId, quantite: 5 },
    });

    const resultats = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        stockService.appliquerMouvement({
          produitId: produit.id,
          entrepotId: entrepotAId,
          type: 'VENTE',
          delta: -1,
          utilisateurId,
        }),
      ),
    );

    const succes = resultats.filter((r) => r.status === 'fulfilled');
    const echecs = resultats.filter((r) => r.status === 'rejected');

    expect(succes.length).toBe(5);
    expect(echecs.length).toBe(5);

    const quant = await env.prisma.stockQuant.findUniqueOrThrow({
      where: {
        produitId_entrepotId: {
          produitId: produit.id,
          entrepotId: entrepotAId,
        },
      },
    });
    expect(quant.quantite).toBe(0);

    // Cohérence grand livre : aucune écriture perdue — la quantité finale
    // doit correspondre exactement au nombre de mouvements VENTE réellement
    // enregistrés (append-only), pas seulement au nombre de promesses
    // résolues côté appelant.
    const mouvements = await env.prisma.mouvementStock.findMany({
      where: { produitId: produit.id, entrepotId: entrepotAId, type: 'VENTE' },
    });
    expect(mouvements.length).toBe(5);
    expect(quant.quantite).toBe(
      5 + mouvements.reduce((s, m) => s + m.quantite, 0),
    );
  });

  it('transfert concurrent et ajustement concurrent sur le même produit/entrepôt : le verrou sérialise tous les types de mouvement', async () => {
    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Produit concurrence mixte',
        prixUnitaire: '100.00',
        stock: 0,
      },
    });
    await env.prisma.stockQuant.create({
      data: { produitId: produit.id, entrepotId: entrepotAId, quantite: 10 },
    });
    await env.prisma.stockQuant.create({
      data: { produitId: produit.id, entrepotId: entrepotBId, quantite: 0 },
    });

    // Concurrence sur entrepotA entre un TRANSFERT_OUT (via transferer()) et
    // un AJUSTEMENT absolu (via ajuster()), plus deux VENTE directes : quatre
    // appelants distincts, quatre chemins de code différents, tous doivent
    // funneler par appliquerMouvementTx et respecter le verrou.
    await Promise.all([
      stockService.transferer({
        produitId: produit.id,
        entrepotSourceId: entrepotAId,
        entrepotDestId: entrepotBId,
        quantite: 3,
        utilisateurId,
      }),
      stockService.ajuster({
        produitId: produit.id,
        entrepotId: entrepotAId,
        quantiteComptee: 12,
        utilisateurId,
      }),
      stockService.appliquerMouvement({
        produitId: produit.id,
        entrepotId: entrepotAId,
        type: 'VENTE',
        delta: -1,
        utilisateurId,
      }),
      stockService.appliquerMouvement({
        produitId: produit.id,
        entrepotId: entrepotAId,
        type: 'VENTE',
        delta: -1,
        utilisateurId,
      }),
    ]);

    const quantA = await env.prisma.stockQuant.findUniqueOrThrow({
      where: {
        produitId_entrepotId: {
          produitId: produit.id,
          entrepotId: entrepotAId,
        },
      },
    });
    const quantB = await env.prisma.stockQuant.findUniqueOrThrow({
      where: {
        produitId_entrepotId: {
          produitId: produit.id,
          entrepotId: entrepotBId,
        },
      },
    });

    // Invariant de non-corruption (grand livre append-only) : quel que soit
    // l'ordre de sérialisation retenu par Postgres, la quantité finale sur
    // chaque entrepôt doit être exactement égale à la quantité initiale plus
    // la somme des deltas réellement enregistrés dans MouvementStock — pas
    // d'écriture perdue, pas de lecture obsolète.
    const mouvementsA = await env.prisma.mouvementStock.findMany({
      where: { produitId: produit.id, entrepotId: entrepotAId },
    });
    const mouvementsB = await env.prisma.mouvementStock.findMany({
      where: { produitId: produit.id, entrepotId: entrepotBId },
    });
    expect(quantA.quantite).toBe(
      10 + mouvementsA.reduce((s, m) => s + m.quantite, 0),
    );
    expect(quantB.quantite).toBe(
      0 + mouvementsB.reduce((s, m) => s + m.quantite, 0),
    );
    // Les 4 opérations concurrentes ont bien toutes écrit leur mouvement
    // (transfert = 1 sortie sur A, ajustement = 1 sur A, 2 ventes sur A).
    expect(mouvementsA.length).toBe(4);
    expect(mouvementsB.length).toBe(1);
  });
});
