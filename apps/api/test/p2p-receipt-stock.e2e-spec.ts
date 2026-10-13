import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StockService } from '../src/stocks/stock.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const PASSWORD = 'MotDePasse!123';
process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('P2P receipt-stock (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orderId: string;
  let orderLineId: string;
  let productId: string;
  let quarantineId: string;
  let stockId: string;
  let receiptId: string;
  let qualityLineId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createUser(login: string, roleLibelle: string) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    const user = await env.prisma.utilisateur.create({
      data: {
        login,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        nom: 'Receipt',
        prenom: login,
        roleId: role.id,
      },
    });
    users[login] = user.id;
  }

  async function login(loginValue: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    await env.start();
    const zone = await env.prisma.zone.create({ data: { nomZone: 'P2P' } });
    const boutique = await env.prisma.boutique.create({
      data: {
        nom: 'Hub P2P',
        adresse: 'Abidjan',
        zoneId: zone.id,
      },
    });
    quarantineId = (
      await env.prisma.entrepot.create({
        data: {
          nom: 'Quarantaine',
          code: 'QUAR-P2P',
          usage: 'QUARANTAINE',
          reseau: true,
          boutiqueId: boutique.id,
        },
      })
    ).id;
    stockId = (
      await env.prisma.entrepot.create({
        data: {
          nom: 'Stock central',
          code: 'STOCK-P2P',
          usage: 'STOCK',
          reseau: true,
          boutiqueId: boutique.id,
        },
      })
    ).id;
    await createUser('receipt-log', 'LOGISTIQUE_TRANSIT_DOUANE');
    await createUser('receipt-quality', 'QUALITE_STOCKS');
    await createUser('receipt-daf', 'DAF');
    await createUser('receipt-achats', 'ACHATS');

    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'Supplier receipt-stock' },
    });
    const product = await env.prisma.produit.create({
      data: {
        designation: 'Produit réception',
        prixUnitaire: 200,
        coutMoyenPondere: 50,
      },
    });
    productId = product.id;
    const order = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-RECEIPT-${crypto.randomUUID()}`,
        fournisseurId: supplier.id,
        statut: 'APPROUVEE',
        dateApprobation: new Date(),
        initiateurId: users['receipt-achats'],
        approbateurId: users['receipt-daf'],
        lignes: {
          create: {
            produitId: productId,
            quantite: 10,
            prixUnitaire: 100,
          },
        },
      },
      include: { lignes: true },
    });
    orderId = order.id;
    orderLineId = order.lignes[0].id;

    const moduleFixture = await Test.createTestingModule({
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
    for (const loginValue of [
      'receipt-log',
      'receipt-quality',
      'receipt-daf',
      'receipt-achats',
    ]) {
      tokens[loginValue] = await login(loginValue);
    }
    const stock = app.get(StockService);
    await stock.appliquerMouvement({
      produitId: productId,
      entrepotId: stockId,
      type: 'AJUSTEMENT',
      delta: 4,
      utilisateurId: users['receipt-quality'],
      reference: 'INITIAL-P2P-TEST',
    });
    await env.prisma.produit.update({
      where: { id: productId },
      data: { coutMoyenPondere: 50 },
    });

    const company = await env.prisma.societe.create({
      data: { raisonSociale: 'Receipt GL', adresse: 'Abidjan' },
    });
    const exercise = await env.prisma.exerciceComptable.create({
      data: {
        societeId: company.id,
        code: '2026',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      },
    });
    await env.prisma.periodeComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: '2026',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31T23:59:59.999Z'),
      },
    });
    const journalAchats = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'ACHATS',
        libelle: 'Achats',
        type: 'ACHATS',
      },
    });
    const acc31 = await env.prisma.compteComptable.create({
      data: { societeId: company.id, numero: '31', intitule: 'Stocks' },
    });
    const acc408 = await env.prisma.compteComptable.create({
      data: {
        societeId: company.id,
        numero: '408',
        intitule: 'Fournisseurs — FNP',
      },
    });
    const stockLines = [
      { role: 'STOCK' as const, compteId: acc31.id, ordre: 1 },
      { role: 'FOURNISSEUR' as const, compteId: acc408.id, ordre: 2 },
    ];
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journalAchats.id,
        code: 'STOCK_PUTAWAY',
        version: 1,
        sourceType: 'MISE_EN_STOCK',
        valideDu: new Date('2026-01-01'),
        lignes: { create: stockLines },
      },
    });
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journalAchats.id,
        code: 'STOCK_SUPPLIER_RETURN',
        version: 1,
        sourceType: 'RETOUR_STOCK_FOURNISSEUR',
        valideDu: new Date('2026-01-01'),
        lignes: { create: stockLines },
      },
    });
    await env.prisma.commandeAchat.update({
      where: { id: orderId },
      data: { societeId: company.id },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('sépare les rôles, reçoit partiellement et bloque la sur-réception concurrente', async () => {
    const payload = {
      clientOperationId: crypto.randomUUID(),
      commandeId: orderId,
      emplacementQuarantaineId: quarantineId,
      referenceLivraison: 'BL-001',
      lignes: [
        {
          ligneCommandeId: orderLineId,
          quantiteRecue: 8,
          codeBarres: 'EAN-RECEIPT',
          numeroLot: 'LOT-P2P-001',
          numerosSerie: Array.from({ length: 8 }, (_, index) => `SER-${index}`),
        },
      ],
      preuves: [
        {
          type: 'PHOTO',
          nomFichier: 'palette.jpg',
          mimeType: 'image/jpeg',
          uri: 's3://evidence/palette.jpg',
        },
      ],
    };
    await request(app.getHttpServer())
      .post('/achats/receptions')
      .set(auth(tokens['receipt-quality']))
      .send(payload)
      .expect(403);
    const created = await request(app.getHttpServer())
      .post('/achats/receptions')
      .set(auth(tokens['receipt-log']))
      .send(payload)
      .expect(201);
    receiptId = (created.body as { id: string }).id;
    expect(await env.prisma.mouvementStock.count()).toBe(1);
    expect(
      await env.prisma.stockQuant.findUniqueOrThrow({
        where: {
          produitId_entrepotId: {
            produitId: productId,
            entrepotId: stockId,
          },
        },
      }),
    ).toMatchObject({ quantite: 4 });

    const attempts = await Promise.all(
      [3, 3].map((quantiteRecue) =>
        request(app.getHttpServer())
          .post('/achats/receptions')
          .set(auth(tokens['receipt-log']))
          .send({
            clientOperationId: crypto.randomUUID(),
            commandeId: orderId,
            emplacementQuarantaineId: quarantineId,
            lignes: [{ ligneCommandeId: orderLineId, quantiteRecue }],
          }),
      ),
    );
    expect(attempts.every((result) => result.status === 409)).toBe(true);
  });

  it('enregistre une qualité indépendante sans créditer les rejets', async () => {
    const decision = {
      clientOperationId: crypto.randomUUID(),
      lignes: [
        {
          ligneReceptionId: (
            await env.prisma.ligneReceptionAchat.findFirstOrThrow({
              where: { receptionId: receiptId },
            })
          ).id,
          quantiteAcceptee: 6,
          quantiteRejetee: 2,
          motifRejet: 'Emballage endommagé',
        },
      ],
    };
    await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/qualite`)
      .set(auth(tokens['receipt-log']))
      .send(decision)
      .expect(403);
    const accepted = await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/qualite`)
      .set(auth(tokens['receipt-quality']))
      .send(decision)
      .expect(201);
    qualityLineId = (accepted.body as { lignes: Array<{ id: string }> })
      .lignes[0].id;
    expect(await env.prisma.mouvementStock.count()).toBe(1);
    await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/qualite`)
      .set(auth(tokens['receipt-quality']))
      .send({ ...decision, clientOperationId: crypto.randomUUID() })
      .expect(409);
  });

  describe('decideQuality - couverture additionnelle des règles de décision qualité', () => {
    let auxProductAId: string;
    let auxProductBId: string;
    let auxReceiptId: string;
    let auxReceptionLineAId: string;
    let auxReceptionLineBId: string;
    let selfControlReceiptId: string;
    let selfControlReceptionLineId: string;

    beforeAll(async () => {
      const supplier = await env.prisma.fournisseur.create({
        data: { nom: 'Supplier décision qualité' },
      });

      // Fixture dédiée au test d'auto-contrôle : le rôle DAF figure à la fois
      // dans ROLES_RECEPTION_P2P_QUANTITATIVE et ROLES_QUALITE_P2P_STOCK
      // (access-scope.constants.ts). C'est le SEUL rôle qui permet d'atteindre
      // la vérification applicative receipt-stock.service.ts l.269-273 : avec
      // un rôle qui n'a accès qu'à un seul des deux endpoints (ex.
      // LOGISTIQUE_TRANSIT_DOUANE), c'est RolesGuard (403 générique "Rôle non
      // habilité") qui intercepte la requête avant même d'atteindre le
      // service, ce qui ne prouverait pas la règle métier d'auto-contrôle.
      const selfControlProduct = await env.prisma.produit.create({
        data: {
          designation: 'Produit auto-contrôle',
          prixUnitaire: 100,
          coutMoyenPondere: 40,
        },
      });
      const selfControlOrder = await env.prisma.commandeAchat.create({
        data: {
          numero: `PO-AUTOCONTROLE-${crypto.randomUUID()}`,
          fournisseurId: supplier.id,
          statut: 'APPROUVEE',
          dateApprobation: new Date(),
          initiateurId: users['receipt-achats'],
          approbateurId: users['receipt-daf'],
          lignes: {
            create: {
              produitId: selfControlProduct.id,
              quantite: 5,
              prixUnitaire: 90,
            },
          },
        },
        include: { lignes: true },
      });
      const selfControlReceipt = await request(app.getHttpServer())
        .post('/achats/receptions')
        .set(auth(tokens['receipt-daf']))
        .send({
          clientOperationId: crypto.randomUUID(),
          commandeId: selfControlOrder.id,
          emplacementQuarantaineId: quarantineId,
          lignes: [
            {
              ligneCommandeId: selfControlOrder.lignes[0].id,
              quantiteRecue: 5,
            },
          ],
        })
        .expect(201);
      selfControlReceiptId = (selfControlReceipt.body as { id: string }).id;
      selfControlReceptionLineId = (
        await env.prisma.ligneReceptionAchat.findFirstOrThrow({
          where: { receptionId: selfControlReceiptId },
        })
      ).id;
      const productA = await env.prisma.produit.create({
        data: {
          designation: 'Produit qualité A',
          prixUnitaire: 150,
          coutMoyenPondere: 40,
        },
      });
      const productB = await env.prisma.produit.create({
        data: {
          designation: 'Produit qualité B',
          prixUnitaire: 150,
          coutMoyenPondere: 40,
        },
      });
      auxProductAId = productA.id;
      auxProductBId = productB.id;

      const order = await env.prisma.commandeAchat.create({
        data: {
          numero: `PO-QUALITE-${crypto.randomUUID()}`,
          fournisseurId: supplier.id,
          statut: 'APPROUVEE',
          dateApprobation: new Date(),
          initiateurId: users['receipt-achats'],
          approbateurId: users['receipt-daf'],
          lignes: {
            create: [
              { produitId: auxProductAId, quantite: 10, prixUnitaire: 90 },
              { produitId: auxProductBId, quantite: 10, prixUnitaire: 90 },
            ],
          },
        },
        include: { lignes: true },
      });
      const lineA = order.lignes.find(
        (line) => line.produitId === auxProductAId,
      )!;
      const lineB = order.lignes.find(
        (line) => line.produitId === auxProductBId,
      )!;

      const receipt = await request(app.getHttpServer())
        .post('/achats/receptions')
        .set(auth(tokens['receipt-log']))
        .send({
          clientOperationId: crypto.randomUUID(),
          commandeId: order.id,
          emplacementQuarantaineId: quarantineId,
          lignes: [
            { ligneCommandeId: lineA.id, quantiteRecue: 10 },
            { ligneCommandeId: lineB.id, quantiteRecue: 10 },
          ],
        })
        .expect(201);
      auxReceiptId = (receipt.body as { id: string }).id;
      const receptionLines = await env.prisma.ligneReceptionAchat.findMany({
        where: { receptionId: auxReceiptId },
      });
      auxReceptionLineAId = receptionLines.find(
        (line) => line.produitId === auxProductAId,
      )!.id;
      auxReceptionLineBId = receptionLines.find(
        (line) => line.produitId === auxProductBId,
      )!.id;
    });

    it('interdit l’auto-contrôle qualité par le réceptionnaire quantitatif (ForbiddenException)', async () => {
      // Le code (receipt-stock.service.ts l.269-273) compare receipt.receptionnaireId
      // à user.userId AVANT toute validation de DTO : le même utilisateur qui a
      // réceptionné ne peut jamais décider lui-même de la qualité. On utilise
      // ici le rôle DAF (seul rôle présent dans ROLES_RECEPTION_P2P_QUANTITATIVE
      // ET ROLES_QUALITE_P2P_STOCK) pour que la requête franchisse bien
      // RolesGuard et atteigne la vérification applicative, au lieu d'être
      // interceptée en amont par un rejet RBAC générique.
      const response = await request(app.getHttpServer())
        .post(`/achats/receptions/${selfControlReceiptId}/qualite`)
        .set(auth(tokens['receipt-daf']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: selfControlReceptionLineId,
              quantiteAcceptee: 5,
              quantiteRejetee: 0,
            },
          ],
        })
        .expect(403);
      expect((response.body as { message: string }).message).toContain(
        'réceptionnaire quantitatif',
      );
    });

    it('exige un motif de rejet dès que quantiteRejetee > 0 (BadRequestException)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/achats/receptions/${auxReceiptId}/qualite`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: auxReceptionLineAId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
            {
              ligneReceptionId: auxReceptionLineBId,
              quantiteAcceptee: 8,
              quantiteRejetee: 2,
            },
          ],
        })
        .expect(400);
      expect((response.body as { message: string }).message).toContain('motif');
    });

    it('exige que la décision qualité couvre toutes les lignes reçues (BadRequestException)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/achats/receptions/${auxReceiptId}/qualite`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: auxReceptionLineAId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
          ],
        })
        .expect(400);
      expect((response.body as { message: string }).message).toContain(
        'toutes les lignes',
      );
    });

    it('exige que acceptée + rejetée égale la quantité reçue pour chaque ligne (BadRequestException)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/achats/receptions/${auxReceiptId}/qualite`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: auxReceptionLineAId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
            {
              ligneReceptionId: auxReceptionLineBId,
              quantiteAcceptee: 5,
              quantiteRejetee: 3,
            },
          ],
        })
        .expect(400);
      expect((response.body as { message: string }).message).toContain(
        'quantité reçue',
      );
    });

    it('refuse de redécider la qualité d’une réception déjà QUALITE_VALIDEE', async () => {
      const decided = await request(app.getHttpServer())
        .post(`/achats/receptions/${auxReceiptId}/qualite`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: auxReceptionLineAId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
            {
              ligneReceptionId: auxReceptionLineBId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
          ],
        })
        .expect(201);
      expect(decided.body).toHaveProperty('id');

      // Divergence constatée par rapport à l'énoncé : le code place la garde
      // "une décision qualité existe déjà" (ConflictException, l.274-278) AVANT
      // l'appel à machine.assertTransition (l.279-282). Comme une décision
      // qualité est systématiquement créée dès que le statut dépasse
      // QUANTITATIVE, cette garde de rejeu intercepte toujours la 2e tentative
      // en premier : la state machine ne peut jamais être atteinte dans ce
      // scénario via l'API. Le test vérifie donc le comportement RÉEL (409
      // ConflictException, message "décision qualité existe déjà"), qui
      // réalise la même garantie métier (transition interdite une fois
      // qualifiée) mais par un mécanisme différent de celui décrit dans la
      // consigne.
      const retried = await request(app.getHttpServer())
        .post(`/achats/receptions/${auxReceiptId}/qualite`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: auxReceptionLineAId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
            {
              ligneReceptionId: auxReceptionLineBId,
              quantiteAcceptee: 10,
              quantiteRejetee: 0,
            },
          ],
        })
        .expect(409);
      expect((retried.body as { message: string }).message).toContain(
        'décision qualité existe déjà',
      );
    });

    it('rejet total d’une ligne (quantiteAcceptee=0) : aucun mouvement de stock au putaway et CMP inchangé', async () => {
      const supplier = await env.prisma.fournisseur.create({
        data: { nom: 'Supplier rejet-total' },
      });
      const productAccepted = await env.prisma.produit.create({
        data: {
          designation: 'Produit accepté intégralement',
          prixUnitaire: 120,
          coutMoyenPondere: 30,
        },
      });
      const productRejected = await env.prisma.produit.create({
        data: {
          designation: 'Produit rejeté intégralement',
          prixUnitaire: 80,
          coutMoyenPondere: 40,
        },
      });
      const order = await env.prisma.commandeAchat.create({
        data: {
          numero: `PO-REJET-${crypto.randomUUID()}`,
          fournisseurId: supplier.id,
          statut: 'APPROUVEE',
          dateApprobation: new Date(),
          initiateurId: users['receipt-achats'],
          approbateurId: users['receipt-daf'],
          lignes: {
            create: [
              { produitId: productAccepted.id, quantite: 5, prixUnitaire: 60 },
              { produitId: productRejected.id, quantite: 5, prixUnitaire: 40 },
            ],
          },
        },
        include: { lignes: true },
      });
      const lineAccepted = order.lignes.find(
        (line) => line.produitId === productAccepted.id,
      )!;
      const lineRejected = order.lignes.find(
        (line) => line.produitId === productRejected.id,
      )!;

      const receipt = await request(app.getHttpServer())
        .post('/achats/receptions')
        .set(auth(tokens['receipt-log']))
        .send({
          clientOperationId: crypto.randomUUID(),
          commandeId: order.id,
          emplacementQuarantaineId: quarantineId,
          lignes: [
            { ligneCommandeId: lineAccepted.id, quantiteRecue: 5 },
            { ligneCommandeId: lineRejected.id, quantiteRecue: 5 },
          ],
        })
        .expect(201);
      const receiptId2 = (receipt.body as { id: string }).id;
      const receptionLines = await env.prisma.ligneReceptionAchat.findMany({
        where: { receptionId: receiptId2 },
      });
      const receptionLineAccepted = receptionLines.find(
        (line) => line.produitId === productAccepted.id,
      )!;
      const receptionLineRejected = receptionLines.find(
        (line) => line.produitId === productRejected.id,
      )!;

      const decision = await request(app.getHttpServer())
        .post(`/achats/receptions/${receiptId2}/qualite`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            {
              ligneReceptionId: receptionLineAccepted.id,
              quantiteAcceptee: 5,
              quantiteRejetee: 0,
            },
            {
              ligneReceptionId: receptionLineRejected.id,
              quantiteAcceptee: 0,
              quantiteRejetee: 5,
              motifRejet: 'Non conforme au cahier des charges',
            },
          ],
        })
        .expect(201);
      const qualityLineAccepted = (
        decision.body as { lignes: Array<{ id: string; produitId: string }> }
      ).lignes.find((line) => line.produitId === productAccepted.id)!;

      // Seule la ligne acceptée (quantiteAcceptee > 0) est éligible au putaway
      // (receipt-stock.service.ts l.458-465) : la ligne totalement rejetée est
      // exclue du tableau `accepted` et ne peut donc pas être envoyée au putaway.
      await request(app.getHttpServer())
        .post(`/achats/receptions/${receiptId2}/putaway`)
        .set(auth(tokens['receipt-quality']))
        .send({
          clientOperationId: crypto.randomUUID(),
          lignes: [
            { ligneQualiteId: qualityLineAccepted.id, destinationId: stockId },
          ],
        })
        .expect(201);

      expect(
        await env.prisma.mouvementStock.count({
          where: { produitId: productRejected.id },
        }),
      ).toBe(0);
      expect(
        (
          await env.prisma.produit.findUniqueOrThrow({
            where: { id: productRejected.id },
          })
        ).coutMoyenPondere.toFixed(2),
      ).toBe('40.00');
    });
  });

  it('alloue les coûts, crédite une seule fois les acceptés et met à jour le CMP', async () => {
    await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/couts`)
      .set(auth(tokens['receipt-log']))
      .send({
        clientOperationId: crypto.randomUUID(),
        libelle: 'Fret réel',
        montant: 60,
        methode: 'VALEUR',
      })
      .expect(201);
    const operationId = crypto.randomUUID();
    await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/putaway`)
      .set(auth(tokens['receipt-quality']))
      .send({
        clientOperationId: operationId,
        lignes: [{ ligneQualiteId: qualityLineId, destinationId: stockId }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/putaway`)
      .set(auth(tokens['receipt-quality']))
      .send({
        clientOperationId: operationId,
        lignes: [{ ligneQualiteId: qualityLineId, destinationId: stockId }],
      })
      .expect(201);
    expect(
      await env.prisma.stockQuant.findUniqueOrThrow({
        where: {
          produitId_entrepotId: {
            produitId: productId,
            entrepotId: stockId,
          },
        },
      }),
    ).toMatchObject({ quantite: 10 });
    expect(
      (
        await env.prisma.produit.findUniqueOrThrow({
          where: { id: productId },
        })
      ).coutMoyenPondere.toFixed(2),
    ).toBe('86.00');
    expect(
      await env.prisma.mouvementStock.count({
        where: {
          reference: {
            startsWith: 'P2P-PUTAWAY:',
            endsWith: `:${qualityLineId}`,
          },
        },
      }),
    ).toBe(1);
    const putaway = await env.prisma.miseEnStockAchat.findFirstOrThrow({
      where: { receptionId: receiptId },
    });
    const stockEntry = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: {
          sourceType: 'MISE_EN_STOCK',
          sourceId: putaway.id,
        },
      },
      include: { lignes: { include: { compte: true } } },
    });
    const stockByRole = Object.fromEntries(
      stockEntry.lignes.map((line) => [line.roleSnapshot, line]),
    );
    expect(stockByRole.STOCK.compte.numero).toBe('31');
    expect(stockByRole.FOURNISSEUR.compte.numero).toBe('408');
    expect(stockByRole.STOCK.debit.toFixed(2)).toBe('660.00');
    expect(stockByRole.FOURNISSEUR.credit.toFixed(2)).toBe('660.00');
  });

  it('expédie un RMA par mouvement compensatoire et protège les faits validés', async () => {
    const prepared = await request(app.getHttpServer())
      .post(`/achats/receptions/${receiptId}/retours`)
      .set(auth(tokens['receipt-quality']))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'Défaut confirmé après mise en stock',
        referenceRma: 'RMA-001',
        reclamationQualite: 'Réclamation fournisseur ouverte',
        avoirAttendu: true,
        montantAvoirAttendu: 220,
        lignes: [
          {
            ligneQualiteId: qualityLineId,
            quantite: 2,
            depuisStock: true,
            sourceId: stockId,
          },
        ],
      })
      .expect(201);
    const returnId = (prepared.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/receptions/retours/${returnId}/expedier`)
      .set(auth(tokens['receipt-quality']))
      .send({ clientOperationId: crypto.randomUUID() })
      .expect(201);
    expect(
      await env.prisma.stockQuant.findUniqueOrThrow({
        where: {
          produitId_entrepotId: {
            produitId: productId,
            entrepotId: stockId,
          },
        },
      }),
    ).toMatchObject({ quantite: 8 });
    expect(
      await env.prisma.mouvementStock.count({
        where: { type: 'RETOUR_FOURNISSEUR' },
      }),
    ).toBe(1);
    const rmaEntry = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: {
          sourceType: 'RETOUR_STOCK_FOURNISSEUR',
          sourceId: returnId,
        },
      },
      include: { lignes: { include: { compte: true } } },
    });
    const rmaByRole = Object.fromEntries(
      rmaEntry.lignes.map((line) => [line.roleSnapshot, line]),
    );
    expect(rmaByRole.STOCK.credit.toFixed(2)).toBe('220.00');
    expect(rmaByRole.FOURNISSEUR.debit.toFixed(2)).toBe('220.00');

    const decision = await env.prisma.decisionQualiteAchat.findUniqueOrThrow({
      where: { receptionId: receiptId },
    });
    await expect(
      env.prisma.decisionQualiteAchat.update({
        where: { id: decision.id },
        data: { commentaire: 'altération interdite' },
      }),
    ).rejects.toThrow('append-only');
  });

  it('short-close le backorder sous approbation DAF auditée', async () => {
    await request(app.getHttpServer())
      .post(`/achats/receptions/commandes/${orderId}/cloture-courte`)
      .set(auth(tokens['receipt-log']))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'Fournisseur incapable de livrer le reliquat',
        lignes: [
          {
            ligneCommandeId: orderLineId,
            quantiteAnnulee: 2,
            motif: 'Reliquat annulé',
          },
        ],
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/achats/receptions/commandes/${orderId}/cloture-courte`)
      .set(auth(tokens['receipt-daf']))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'Fournisseur incapable de livrer le reliquat',
        lignes: [
          {
            ligneCommandeId: orderLineId,
            quantiteAnnulee: 2,
            motif: 'Reliquat annulé',
          },
        ],
      })
      .expect(201);
    expect(
      await env.prisma.commandeAchat.findUniqueOrThrow({
        where: { id: orderId },
      }),
    ).toMatchObject({ statut: 'CLOTUREE' });
    expect(
      await env.prisma.journalAudit.count({
        where: { action: 'COMMANDE_ACHAT_SHORT_CLOSE', entiteId: orderId },
      }),
    ).toBe(1);
  });
});
