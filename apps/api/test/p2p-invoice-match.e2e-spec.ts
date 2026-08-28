import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body } from './utils/http';

const PASSWORD = 'MotDePasse!123';
process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('P2P invoice three-way match (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let supplierId: string;
  let orderLineId: string;
  let qualityLineId: string;
  let rejectedOrderLineId: string;
  let rejectedQualityLineId: string;
  let taxId: string;

  const auth = (login: string) => ({
    Authorization: `Bearer ${tokens[login]}`,
  });

  async function createUser(login: string, roleLibelle: string) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    userIds[login] = (
      await env.prisma.utilisateur.create({
        data: {
          login,
          passwordHash: await bcrypt.hash(PASSWORD, 10),
          nom: 'Invoice',
          prenom: login,
          roleId: role.id,
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await env.start();
    for (const [login, role] of [
      ['invoice-raf', 'RAF_COMPTABLE'],
      ['invoice-daf', 'DAF'],
      ['invoice-dg', 'DIRECTION_GENERALE'],
      ['invoice-achats', 'ACHATS'],
      ['invoice-log', 'LOGISTIQUE_TRANSIT_DOUANE'],
      ['invoice-quality', 'QUALITE_STOCKS'],
    ]) {
      await createUser(login, role);
    }
    const societe = await env.prisma.societe.create({
      data: {
        raisonSociale: 'P2P Invoice CI',
        adresse: 'Abidjan',
      },
    });
    const exercice = await env.prisma.exerciceComptable.create({
      data: {
        societeId: societe.id,
        code: '2026',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      },
    });
    await env.prisma.periodeComptable.create({
      data: {
        societeId: societe.id,
        exerciceId: exercice.id,
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
      },
    });
    const journal = await env.prisma.journalComptable.create({
      data: {
        societeId: societe.id,
        exerciceId: exercice.id,
        code: 'ACH',
        libelle: 'Achats',
        type: 'ACHATS',
      },
    });
    const comptes = await Promise.all(
      [
        ['601100', 'Achats'],
        ['445100', 'Taxes'],
        ['447100', 'Retenues'],
        ['401100', 'Fournisseurs'],
      ].map(([numero, intitule]) =>
        env.prisma.compteComptable.create({
          data: { societeId: societe.id, numero, intitule },
        }),
      ),
    );
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: societe.id,
        journalId: journal.id,
        code: 'SUPPLIER_INVOICE',
        version: 1,
        sourceType: 'FACTURE_FOURNISSEUR',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            ['ACHAT', comptes[0].id],
            ['TAXE', comptes[1].id],
            ['RETENUE', comptes[2].id],
            ['FOURNISSEUR', comptes[3].id],
          ].map(([role, compteId], index) => ({
            role: role as 'ACHAT' | 'TAXE' | 'RETENUE' | 'FOURNISSEUR',
            compteId,
            ordre: index + 1,
          })),
        },
      },
    });
    const fiscal = await env.prisma.referentielFiscal.create({
      data: {
        societeId: societe.id,
        code: 'CI-CGI',
        version: 1,
        pays: 'CI',
        libelle: 'Référentiel CI test',
        valideDu: new Date('2026-01-01'),
      },
    });
    taxId = (
      await env.prisma.tauxFiscalAchat.create({
        data: {
          referentielId: fiscal.id,
          code: 'TVA18',
          libelle: 'TVA 18%',
          type: 'TVA',
          taux: 18,
        },
      })
    ).id;
    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'Supplier invoice match', pays: 'CI', devise: 'XOF' },
    });
    supplierId = supplier.id;
    const product = await env.prisma.produit.create({
      data: { designation: 'Produit invoice match', prixUnitaire: 1500 },
    });
    const rejectedProduct = await env.prisma.produit.create({
      data: {
        designation: 'Produit invoice match rejet',
        prixUnitaire: 1500,
      },
    });
    const order = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-INV-${crypto.randomUUID()}`,
        fournisseurId: supplier.id,
        statut: 'APPROUVEE',
        devise: 'XOF',
        dateApprobation: new Date(),
        initiateurId: userIds['invoice-achats'],
        approbateurId: userIds['invoice-daf'],
        societeId: societe.id,
        lignes: {
          create: [product.id, rejectedProduct.id].map((produitId) => ({
            produitId,
            quantite: 10,
            prixUnitaire: 1000,
            tauxFiscalAchatId: taxId,
            codeTaxeSnapshot: 'TVA18',
            tauxTaxeSnapshot: 18,
          })),
        },
      },
      include: { lignes: true },
    });
    orderLineId = order.lignes.find(
      (line) => line.produitId === product.id,
    )!.id;
    rejectedOrderLineId = order.lignes.find(
      (line) => line.produitId === rejectedProduct.id,
    )!.id;
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Invoice' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Invoice hub', adresse: 'Abidjan', zoneId: zone.id },
    });
    const quarantine = await env.prisma.entrepot.create({
      data: {
        nom: 'Invoice quarantine',
        code: `IQ-${crypto.randomUUID()}`,
        usage: 'QUARANTAINE',
        boutiqueId: boutique.id,
      },
    });
    const receipt = await env.prisma.receptionAchat.create({
      data: {
        numero: `REC-INV-${crypto.randomUUID()}`,
        commandeId: order.id,
        fournisseurId: supplier.id,
        emplacementQuarantaineId: quarantine.id,
        receptionnaireId: userIds['invoice-log'],
        clientOperationId: crypto.randomUUID(),
        statut: 'QUALITE_VALIDEE',
        lignes: {
          create: [
            {
              ligneCommandeId: orderLineId,
              produitId: product.id,
            },
            {
              ligneCommandeId: rejectedOrderLineId,
              produitId: rejectedProduct.id,
            },
          ].map((line) => ({
            ...line,
            quantiteCommandee: 10,
            quantiteRecue: 8,
            prixUnitaireSnapshot: 1000,
          })),
        },
      },
      include: { lignes: true },
    });
    const quality = await env.prisma.decisionQualiteAchat.create({
      data: {
        receptionId: receipt.id,
        controleurId: userIds['invoice-quality'],
        clientOperationId: crypto.randomUUID(),
        lignes: {
          create: receipt.lignes.map((line) => ({
            ligneReceptionId: line.id,
            produitId: line.produitId,
            quantiteAcceptee: 6,
            quantiteRejetee: 2,
            motifRejet: 'Endommagé',
          })),
        },
      },
      include: { lignes: true },
    });
    qualityLineId = quality.lignes.find(
      (line) => line.produitId === product.id,
    )!.id;
    rejectedQualityLineId = quality.lignes.find(
      (line) => line.produitId === rejectedProduct.id,
    )!.id;

    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(env.prisma)
      .compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    for (const login of Object.keys(userIds)) {
      tokens[login] = body<{ accessToken: string }>(
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ login, password: PASSWORD })
          .expect(200),
      ).accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  const payload = (operationId = crypto.randomUUID()) => ({
    clientOperationId: operationId,
    fournisseurId: supplierId,
    referenceFournisseur: `INV-${operationId}`,
    dateDocument: '2026-08-24',
    devise: 'XOF',
    tauxChangeSnapshot: '1',
    remiseGlobale: '0',
    document: {
      hashSha256: operationId.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
      nomFichier: 'invoice.pdf',
      mimeType: 'application/pdf',
      tailleOctets: 2048,
      uri: 's3://p2p/invoice.pdf',
      metadata: { pages: 1 },
    },
    lignes: [
      {
        ligneCommandeId: orderLineId,
        ligneQualiteId: qualityLineId,
        quantite: 6,
        prixUnitaire: '1000',
        remise: '0',
        tauxFiscalAchatId: taxId,
      },
    ],
  });

  it('est idempotent, audité et comptabilise uniquement un rapprochement strict', async () => {
    const operationId = crypto.randomUUID();
    const first = await request(app.getHttpServer())
      .post('/achats/factures/p2p')
      .set(auth('invoice-raf'))
      .send(payload(operationId))
      .expect(201);
    expect(first.body).toMatchObject({
      statutRapprochement: 'RAPPROCHEE',
      totalHt: '6000.00',
      totalTtc: '7080.00',
    });
    const firstId = body<{ id: string }>(first).id;
    const replay = await request(app.getHttpServer())
      .post('/achats/factures/p2p')
      .set(auth('invoice-raf'))
      .send(payload(operationId))
      .expect(201);
    expect(body<{ id: string }>(replay).id).toBe(firstId);

    const challengeId = body<{ challengeId: string }>(
      await request(app.getHttpServer())
        .post('/auth/reauth/challenges')
        .set(auth('invoice-raf'))
        .send({
          password: PASSWORD,
          purpose: 'P2P_INVOICE_POST',
        })
        .expect(201),
    ).challengeId;
    await request(app.getHttpServer())
      .post(`/achats/factures/${firstId}/comptabiliser`)
      .set(auth('invoice-raf'))
      .send({ clientOperationId: crypto.randomUUID(), challengeId })
      .expect(201);
    expect(
      await env.prisma.journalAudit.count({
        where: { entiteId: firstId },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('bloque rejet, doublons et exception RAF puis compense par avoir immuable', async () => {
    const rejected = payload();
    rejected.lignes[0].ligneCommandeId = rejectedOrderLineId;
    rejected.lignes[0].ligneQualiteId = rejectedQualityLineId;
    rejected.lignes[0].quantite = 8;
    const disputed = await request(app.getHttpServer())
      .post('/achats/factures/p2p')
      .set(auth('invoice-raf'))
      .send(rejected)
      .expect(201);
    const disputedBody = body<{
      id: string;
      statutRapprochement: string;
      litiges: unknown;
    }>(disputed);
    expect(disputedBody).toMatchObject({ statutRapprochement: 'LITIGE' });
    expect(disputedBody.litiges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'QUANTITE', bloquant: true }),
      ]),
    );
    await request(app.getHttpServer())
      .post(`/achats/factures/${disputedBody.id}/exception`)
      .set(auth('invoice-raf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'RAF non autorisé',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/achats/factures/${disputedBody.id}/exception`)
      .set(auth('invoice-daf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'Écart accepté par la DAF après contrôle documentaire',
      })
      .expect(201);

    const duplicateReference = payload();
    duplicateReference.referenceFournisseur =
      rejected.referenceFournisseur.toLowerCase();
    await request(app.getHttpServer())
      .post('/achats/factures/p2p')
      .set(auth('invoice-raf'))
      .send(duplicateReference)
      .expect(409);

    const duplicateHash = payload();
    duplicateHash.document.hashSha256 = rejected.document.hashSha256;
    await request(app.getHttpServer())
      .post('/achats/factures/p2p')
      .set(auth('invoice-raf'))
      .send(duplicateHash)
      .expect(409);

    const duplicateAmountDate = payload();
    duplicateAmountDate.lignes[0].ligneCommandeId = rejectedOrderLineId;
    duplicateAmountDate.lignes[0].ligneQualiteId = rejectedQualityLineId;
    duplicateAmountDate.lignes[0].quantite = 8;
    await request(app.getHttpServer())
      .post('/achats/factures/p2p')
      .set(auth('invoice-raf'))
      .send(duplicateAmountDate)
      .expect(409);

    const credit = await request(app.getHttpServer())
      .post(`/achats/factures/${disputedBody.id}/avoir`)
      .set(auth('invoice-raf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        motif: 'Annulation commerciale documentée',
        referenceFournisseur: `CN-${crypto.randomUUID()}`,
      })
      .expect(201);
    expect(
      body<{ typeDocument: string; factureOrigineId: string }>(credit),
    ).toMatchObject({
      typeDocument: 'AVOIR',
      factureOrigineId: disputedBody.id,
    });
    expect(
      await env.prisma.factureFournisseur.findUniqueOrThrow({
        where: { id: disputedBody.id },
      }),
    ).toMatchObject({ typeDocument: 'FACTURE' });
    await expect(
      env.prisma.factureFournisseur.delete({ where: { id: disputedBody.id } }),
    ).rejects.toThrow();
  });
});
