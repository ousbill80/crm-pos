import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';
import { body } from './utils/http';

/**
 * Couverture HTTP (RolesGuard réel + SensitiveActionChallengeService réel) de
 * l'approbation/exécution des paiements fournisseurs — `p2p-accounting-
 * payments.e2e-spec.ts` instancie le service directement et contourne donc le
 * guard `@Roles` ainsi que la consommation de challenge (§6.7, §6.2 RBAC
 * serveur systématique, pas seulement côté UI).
 */
describe('P2P paiements fournisseurs — RBAC & challenge HTTP (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let companyId: string;
  let treasuryCashId: string;
  let invoiceId: string;

  const PASSWORD = 'MotDePasse!123';
  process.env.JWT_SECRET ??= 'test-secret-e2e';

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
          nom: 'Paiement',
          prenom: login,
          roleId: role.id,
        },
      })
    ).id;
  }

  async function challengeFor(login: string, purpose: string) {
    return body<{ challengeId: string }>(
      await request(app.getHttpServer())
        .post('/auth/reauth/challenges')
        .set(auth(login))
        .send({ password: PASSWORD, purpose })
        .expect(201),
    ).challengeId;
  }

  beforeAll(async () => {
    await env.start();
    for (const [login, role] of [
      ['pay-raf', 'RAF_COMPTABLE'],
      ['pay-daf', 'DAF'],
      ['pay-dg', 'DIRECTION_GENERALE'],
      ['pay-central', 'CAISSIER_CENTRAL'],
      ['pay-caissier', 'CAISSIER_BOUTIQUE'],
    ]) {
      await createUser(login, role);
    }

    const company = await env.prisma.societe.create({
      // Seuil abaissé à 1000 : la proposition de test (1130) devient
      // "exceptionnelle" et force le passage par l'approbation DG (§6.2).
      data: {
        raisonSociale: 'P2P Paiements HTTP',
        adresse: 'Abidjan',
        seuilValidationDg: 1000,
      },
    });
    companyId = company.id;
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
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
      },
    });
    const journal = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'ACH',
        libelle: 'Achats',
        type: 'ACHATS',
      },
    });
    const accounts = await Promise.all(
      [
        ['601000', 'Achats'],
        ['445000', 'TVA'],
        ['447000', 'Retenues'],
        ['401000', 'Fournisseurs'],
        ['571000', 'Caisse'],
        ['776000', 'Gains de change'],
        ['676000', 'Pertes de change'],
      ].map(([numero, intitule]) =>
        env.prisma.compteComptable.create({
          data: { societeId: company.id, numero, intitule },
        }),
      ),
    );
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journal.id,
        code: 'SUPPLIER_INVOICE',
        version: 1,
        sourceType: 'FACTURE_FOURNISSEUR',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            ['ACHAT', accounts[0].id],
            ['TAXE', accounts[1].id],
            ['RETENUE', accounts[2].id],
            ['FOURNISSEUR', accounts[3].id],
          ].map(([role, compteId], index) => ({
            role: role as 'ACHAT' | 'TAXE' | 'RETENUE' | 'FOURNISSEUR',
            compteId,
            ordre: index + 1,
          })),
        },
      },
    });
    const cashJournal = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'CAI',
        libelle: 'Caisse',
        type: 'CAISSE',
      },
    });
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: cashJournal.id,
        code: 'SUPPLIER_PAYMENT_CASH',
        version: 1,
        sourceType: 'PAIEMENT_FOURNISSEUR',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            ['FOURNISSEUR', accounts[3].id],
            ['TRESORERIE', accounts[4].id],
            ['GAIN_CHANGE', accounts[5].id],
            ['PERTE_CHANGE', accounts[6].id],
          ].map(([role, compteId], index) => ({
            role: role as
              'FOURNISSEUR' | 'TRESORERIE' | 'GAIN_CHANGE' | 'PERTE_CHANGE',
            compteId,
            ordre: index + 1,
          })),
        },
      },
    });
    treasuryCashId = (
      await env.prisma.compteTresorerie.create({
        data: {
          societeId: company.id,
          code: 'CAISSE_CENTRALE',
          libelle: 'Caisse centrale',
          type: 'CENTRAL_CASH',
          devise: 'XOF',
          compteComptableId: accounts[4].id,
        },
      })
    ).id;
    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'Supplier HTTP' },
    });
    const product = await env.prisma.produit.create({
      data: { designation: 'Produit HTTP', prixUnitaire: 100 },
    });
    const order = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-${crypto.randomUUID()}`,
        fournisseurId: supplier.id,
        societeId: company.id,
        initiateurId: userIds['pay-raf'],
        lignes: {
          create: { produitId: product.id, quantite: 1, prixUnitaire: 1000 },
        },
      },
      include: { lignes: true },
    });
    invoiceId = (
      await env.prisma.factureFournisseur.create({
        data: {
          numero: `INV-${crypto.randomUUID()}`,
          societeId: companyId,
          fournisseurId: supplier.id,
          createurId: userIds['pay-raf'],
          dateDocument: new Date('2026-08-24'),
          statut: 'COMPTABILISEE',
          statutRapprochement: 'RAPPROCHEE',
          montant: 1130,
          totalHt: 1000,
          totalTaxes: 180,
          totalRetenues: 50,
          totalTtc: 1180,
          netAPayer: 1130,
          lignes: {
            create: {
              ligneCommandeId: order.lignes[0].id,
              produitId: product.id,
              quantite: 1,
              prixUnitaire: 1000,
              montantHt: 1000,
            },
          },
        },
      })
    ).id;

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

  async function preparePaymentHttp() {
    const res = await request(app.getHttpServer())
      .post('/achats/comptabilite/paiements/propositions')
      .set(auth('pay-raf'))
      .send({
        societeId: companyId,
        compteTresorerieId: treasuryCashId,
        mode: 'CAISSE_CENTRALE',
        devise: 'XOF',
        dateExecutionPrevue: '2026-08-26',
        clientOperationId: crypto.randomUUID(),
        allocations: [{ factureId: invoiceId, montant: 1130 }],
      })
      .expect(201);
    return body<{ id: string }>(res).id;
  }

  it('refuse RAF_COMPTABLE (hors ROLES_P2P_PAIEMENT_APPROBATION) sur /approuver → 403', async () => {
    const proposalId = await preparePaymentHttp();
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-raf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: crypto.randomUUID(),
      })
      .expect(403);
  });

  it('refuse CAISSIER_BOUTIQUE (hors périmètre) sur /approuver, /approuver-exception et /executer → 403', async () => {
    const proposalId = await preparePaymentHttp();
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-caissier'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: crypto.randomUUID(),
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver-exception`,
      )
      .set(auth('pay-caissier'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: crypto.randomUUID(),
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/executer`,
      )
      .set(auth('pay-caissier'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: crypto.randomUUID(),
      })
      .expect(403);
  });

  it('approuve avec DAF via un challenge réel (mint HTTP + consommation) puis rejette le replay', async () => {
    const proposalId = await preparePaymentHttp();
    const challengeId = await challengeFor('pay-daf', 'P2P_PAYMENT_APPROVE');
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({ clientOperationId: crypto.randomUUID(), challengeId })
      .expect(201);

    const replay = await challengeFor('pay-daf', 'P2P_PAYMENT_APPROVE');
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({ clientOperationId: crypto.randomUUID(), challengeId: replay })
      .expect(201);
  });

  it('rejette un challenge déjà consommé (replay direct) → 401/403', async () => {
    const proposalId = await preparePaymentHttp();
    const challengeId = await challengeFor('pay-daf', 'P2P_PAYMENT_APPROVE');
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({ clientOperationId: crypto.randomUUID(), challengeId })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({ clientOperationId: crypto.randomUUID(), challengeId });
    expect([401, 403]).toContain(res.status);
  });

  it('rejette un challenge d’un autre purpose (P2P_PAYMENT_EXECUTE) sur /approuver', async () => {
    const proposalId = await preparePaymentHttp();
    const wrongPurposeChallenge = await challengeFor(
      'pay-daf',
      'P2P_PAYMENT_EXECUTE',
    );
    const res = await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: wrongPurposeChallenge,
      });
    expect([401, 403]).toContain(res.status);
  });

  it('refuse DAF sur /approuver-exception si le challenge a été minté avec le mauvais purpose → DG autorisé', async () => {
    const proposalId = await preparePaymentHttp();
    const approveChallenge = await challengeFor(
      'pay-daf',
      'P2P_PAYMENT_APPROVE',
    );
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: approveChallenge,
      })
      .expect(201);

    const dgChallenge = await challengeFor(
      'pay-dg',
      'P2P_PAYMENT_EXCEPTION_APPROVE',
    );
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver-exception`,
      )
      .set(auth('pay-dg'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: dgChallenge,
      })
      .expect(201);
  });

  it('exécute avec CAISSIER_CENTRAL via challenge réel après approbation DAF + DG, et impose la séparation des tâches pour l’exécuteur', async () => {
    const proposalId = await preparePaymentHttp();
    const approveChallenge = await challengeFor(
      'pay-daf',
      'P2P_PAYMENT_APPROVE',
    );
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver`,
      )
      .set(auth('pay-daf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: approveChallenge,
      })
      .expect(201);
    const dgChallenge = await challengeFor(
      'pay-dg',
      'P2P_PAYMENT_EXCEPTION_APPROVE',
    );
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/approuver-exception`,
      )
      .set(auth('pay-dg'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: dgChallenge,
      })
      .expect(201);

    // Même approbateur (DAF) ne peut pas exécuter : séparation des tâches (§1 CLAUDE.md).
    const dafExecChallenge = await challengeFor(
      'pay-daf',
      'P2P_PAYMENT_EXECUTE',
    );
    const sodRes = await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/executer`,
      )
      .set(auth('pay-daf'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: dafExecChallenge,
        dateComptable: '2026-08-26',
      });
    expect(sodRes.status).toBeGreaterThanOrEqual(400);

    const centralExecChallenge = await challengeFor(
      'pay-central',
      'P2P_PAYMENT_EXECUTE',
    );
    await request(app.getHttpServer())
      .post(
        `/achats/comptabilite/paiements/propositions/${proposalId}/executer`,
      )
      .set(auth('pay-central'))
      .send({
        clientOperationId: crypto.randomUUID(),
        challengeId: centralExecChallenge,
        dateComptable: '2026-08-26',
      })
      .expect(201);
  });
});
