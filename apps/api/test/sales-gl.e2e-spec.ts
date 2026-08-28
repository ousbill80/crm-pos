import { RoleLibelle } from '@caisse-crm/shared';
import { P2pAccountingCalculator } from '../src/fournisseurs/p2p-accounting.calculator';
import { P2pAccountingService } from '../src/fournisseurs/p2p-accounting.service';
import { SalesGlService } from '../src/accounting-gl/sales-gl.service';
import { StockGlService } from '../src/accounting-gl/stock-gl.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

describe('GL ventes / charges / file période (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  const raf = {
    userId: '',
    role: RoleLibelle.RAF_COMPTABLE,
    boutiqueId: null,
    login: 'raf-gl',
  };
  let companyId: string;
  let userId: string;
  let sales: SalesGlService;
  let accounting: P2pAccountingService;

  beforeAll(async () => {
    await env.start();
    const calculator = new P2pAccountingCalculator();
    sales = new SalesGlService(
      env.prisma,
      calculator,
      new StockGlService(calculator),
    );
    accounting = new P2pAccountingService(env.prisma, calculator, sales);
    const role = await env.prisma.role.create({
      data: { libelle: 'RAF_COMPTABLE', niveauHabilitation: 1 },
    });
    userId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'RAF',
          prenom: 'GL',
          login: `raf-gl-${crypto.randomUUID()}`,
          passwordHash: 'x',
          roleId: role.id,
        },
      })
    ).id;
    raf.userId = userId;
    const company = await env.prisma.societe.create({
      data: { raisonSociale: 'GL Sales', adresse: 'Abidjan' },
    });
    companyId = company.id;
    await env.prisma.parametreShop.create({
      data: { societeId: company.id, tauxTvaDefaut: 18 },
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
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
      },
    });
    const journalVentes = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'VENTES',
        libelle: 'Ventes',
        type: 'VENTES',
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
    const journalCaisse = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'CAISSE',
        libelle: 'Caisse',
        type: 'CAISSE',
      },
    });
    const journalBanque = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'BANQUE',
        libelle: 'Banque',
        type: 'BANQUE',
      },
    });
    const journalOd = await env.prisma.journalComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: 'OD',
        libelle: 'Opérations diverses',
        type: 'OPERATIONS_DIVERSES',
      },
    });
    const accounts = Object.fromEntries(
      await Promise.all(
        [
          ['411', 'Clients'],
          ['701', 'Ventes'],
          ['4457', 'TVA collectée'],
          ['571', 'Caisse'],
          ['521', 'Banque'],
          ['572', 'Mobile money'],
          ['628', 'Charges diverses'],
          ['4452', 'TVA récupérable'],
          ['447', 'Retenues'],
          ['401', 'Fournisseurs'],
          ['31', 'Stocks'],
          ['603', 'Variation des stocks de marchandises'],
        ].map(async ([numero, intitule]) => [
          numero,
          (
            await env.prisma.compteComptable.create({
              data: { societeId: company.id, numero, intitule },
            })
          ).id,
        ]),
      ),
    ) as Record<string, string>;
    const saleLines = [
      ['CLIENT', accounts['411']],
      ['VENTE', accounts['701']],
      ['TVA_COLLECTEE', accounts['4457']],
    ] as const;
    for (const [code, sourceType] of [
      ['POS_SALE', 'VENTE_POS'],
      ['WEB_SALE', 'COMMANDE_WEB'],
      ['CUSTOMER_CREDIT_NOTE', 'AVOIR_CLIENT'],
      ['CUSTOMER_INVOICE', 'FACTURE_CLIENT'],
    ] as const) {
      await env.prisma.modeleComptabilisation.create({
        data: {
          societeId: company.id,
          journalId: journalVentes.id,
          code,
          version: 1,
          sourceType,
          valideDu: new Date('2026-01-01'),
          lignes: {
            create: saleLines.map(([role, compteId], index) => ({
              role,
              compteId,
              ordre: index + 1,
            })),
          },
        },
      });
    }
    for (const [code, journalId, compteId] of [
      ['CUSTOMER_RECEIPT_CASH', journalCaisse.id, accounts['571']],
      ['CUSTOMER_RECEIPT_BANK', journalBanque.id, accounts['521']],
      ['CUSTOMER_RECEIPT_MOBILE', journalBanque.id, accounts['572']],
    ] as const) {
      await env.prisma.modeleComptabilisation.create({
        data: {
          societeId: company.id,
          journalId,
          code,
          version: 1,
          sourceType: 'ENCAISSEMENT_CLIENT',
          valideDu: new Date('2026-01-01'),
          lignes: {
            create: [
              { role: 'TRESORERIE', compteId, ordre: 1 },
              { role: 'CLIENT', compteId: accounts['411'], ordre: 2 },
            ],
          },
        },
      });
    }
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journalAchats.id,
        code: 'EXPENSE_INVOICE',
        version: 1,
        sourceType: 'FACTURE_CHARGE',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            ['CHARGE', accounts['628']],
            ['TAXE', accounts['4452']],
            ['RETENUE', accounts['447']],
            ['FOURNISSEUR', accounts['401']],
          ].map(([role, compteId], index) => ({
            role: role as 'CHARGE' | 'TAXE' | 'RETENUE' | 'FOURNISSEUR',
            compteId,
            ordre: index + 1,
          })),
        },
      },
    });
    for (const [code, sourceType] of [
      ['COGS_SALE', 'CMV_VENTE'],
      ['COGS_CREDIT_NOTE', 'CMV_AVOIR'],
    ] as const) {
      await env.prisma.modeleComptabilisation.create({
        data: {
          societeId: company.id,
          journalId: journalOd.id,
          code,
          version: 1,
          sourceType,
          valideDu: new Date('2026-01-01'),
          lignes: {
            create: [
              { role: 'CHARGE', compteId: accounts['603'], ordre: 1 },
              { role: 'STOCK', compteId: accounts['31'], ordre: 2 },
            ],
          },
        },
      });
    }
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  });

  async function createVente(opts?: { date?: Date; paid?: boolean }) {
    const zone = await env.prisma.zone.create({
      data: { nomZone: `Z-${crypto.randomUUID().slice(0, 8)}` },
    });
    const boutique = await env.prisma.boutique.create({
      data: {
        nom: 'Boutique GL',
        adresse: 'Abidjan',
        zoneId: zone.id,
      },
    });
    const caisse = await env.prisma.caisse.create({
      data: {
        type: 'TIROIR',
        boutiqueId: boutique.id,
        libelle: 'Tiroir GL',
        code: `T-${crypto.randomUUID().slice(0, 6)}`,
      },
    });
    const session = await env.prisma.sessionCaisse.create({
      data: {
        caisseId: caisse.id,
        fondInitial: 0,
        ouvertureUtilisateurId: userId,
        ouvertureTemoinId: userId,
      },
    });
    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Filtre',
        prixUnitaire: 1180,
        tauxTva: 18,
      },
    });
    return env.prisma.vente.create({
      data: {
        dateVente: opts?.date ?? new Date('2026-08-10T10:00:00Z'),
        montantTotal: 1180,
        modePaiement: 'ESPECES',
        caisseId: caisse.id,
        sessionCaisseId: session.id,
        lignes: {
          create: {
            produitId: produit.id,
            quantite: 1,
            prixUnitaire: 1180,
          },
        },
        paiements:
          opts?.paid === false
            ? undefined
            : { create: { modePaiement: 'ESPECES', montant: 1180 } },
      },
    });
  }

  it('posts a POS sale to 411/701/4457 and a cash collection to 571', async () => {
    const vente = await createVente();
    await sales.tryPostVente(vente.id, userId);
    const entry = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: { sourceType: 'VENTE_POS', sourceId: vente.id },
      },
      include: { lignes: { include: { compte: true } }, journal: true },
    });
    expect(entry.journal.code).toBe('VENTES');
    const byRole = Object.fromEntries(
      entry.lignes.map((line) => [line.roleSnapshot, line]),
    );
    expect(byRole.CLIENT.debit.toFixed(2)).toBe('1180.00');
    expect(byRole.VENTE.credit.toFixed(2)).toBe('1000.00');
    expect(byRole.TVA_COLLECTEE.credit.toFixed(2)).toBe('180.00');
    expect(entry.lignes.some((line) => line.compte.numero === '571')).toBe(
      false,
    );
    expect(byRole.CLIENT.lettrage).toBeTruthy();
    const paiement = await env.prisma.paiementVente.findFirstOrThrow({
      where: { venteId: vente.id },
    });
    const collection = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: {
          sourceType: 'ENCAISSEMENT_CLIENT',
          sourceId: paiement.id,
        },
      },
      include: { lignes: { include: { compte: true } }, journal: true },
    });
    expect(collection.journal.code).toBe('CAISSE');
    const cash = collection.lignes.find((line) => line.compte.numero === '571');
    const client = collection.lignes.find(
      (line) => line.roleSnapshot === 'CLIENT',
    );
    expect(cash?.debit.toFixed(2)).toBe('1180.00');
    expect(client?.credit.toFixed(2)).toBe('1180.00');
    expect(client?.lettrage).toBe(byRole.CLIENT.lettrage);
  });

  it('posts CMV D 603 / C 31 after a POS sale with snapshot cost', async () => {
    const vente = await createVente();
    await env.prisma.ligneVente.updateMany({
      where: { venteId: vente.id },
      data: { coutUnitaire: 400 },
    });
    const reloaded = await env.prisma.vente.findUniqueOrThrow({
      where: { id: vente.id },
      include: { lignes: { include: { produit: true } } },
    });
    await sales.tryPostVente(reloaded.id, userId);
    const cmv = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: { sourceType: 'CMV_VENTE', sourceId: vente.id },
      },
      include: { lignes: { include: { compte: true } } },
    });
    const byRole = Object.fromEntries(
      cmv.lignes.map((line) => [line.roleSnapshot, line]),
    );
    expect(byRole.CHARGE.compte.numero).toBe('603');
    expect(byRole.CHARGE.debit.toFixed(2)).toBe('400.00');
    expect(byRole.STOCK.compte.numero).toBe('31');
    expect(byRole.STOCK.credit.toFixed(2)).toBe('400.00');
  });

  it('queues the sale when the period is closed and still keeps the POS ticket', async () => {
    await env.prisma.periodeComptable.updateMany({
      where: { societeId: companyId, code: '2026-08' },
      data: { cloture: true },
    });
    const vente = await createVente();
    await sales.tryPostVente(vente.id, userId);
    const persisted = await env.prisma.vente.findUniqueOrThrow({
      where: { id: vente.id },
    });
    expect(persisted.montantTotal.toFixed(2)).toBe('1180.00');
    const queued = await env.prisma.fileEcritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: { sourceType: 'VENTE_POS', sourceId: vente.id },
      },
    });
    expect(queued.statut).toBe('EN_ATTENTE');
    await env.prisma.periodeComptable.updateMany({
      where: { societeId: companyId, code: '2026-08' },
      data: { cloture: false },
    });
    const flushed = await sales.flushQueue(companyId, userId);
    expect(
      flushed.some((item) => item.id === queued.id && item.statut === 'POSTEE'),
    ).toBe(true);
  });

  it('shows unlettered 411 on customer aging and posts a 6xx charge invoice', async () => {
    const unpaid = await createVente({ paid: false });
    await sales.tryPostVente(unpaid.id, userId);
    const aging = await accounting.customerAging({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    expect(aging.some((row) => Number(row.netAPayer) > 0)).toBe(true);

    const nature = await env.prisma.natureDepense.create({
      data: {
        societeId: companyId,
        code: 'DIVERS',
        libelle: 'Divers',
        compteId: (
          await env.prisma.compteComptable.findFirstOrThrow({
            where: { societeId: companyId, numero: '628' },
          })
        ).id,
      },
    });
    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'Loyer CI' },
    });
    const invoice = await env.prisma.factureFournisseur.create({
      data: {
        numero: `CH-${crypto.randomUUID()}`,
        societeId: companyId,
        nature: 'CHARGE',
        fournisseurId: supplier.id,
        createurId: userId,
        statutRapprochement: 'RAPPROCHEE',
        dateDocument: new Date('2026-08-12'),
        montant: 1180,
        totalHt: 1000,
        totalTaxes: 180,
        totalRetenues: 0,
        totalTtc: 1180,
        netAPayer: 1180,
        lignes: {
          create: {
            natureDepenseId: nature.id,
            quantite: 1,
            prixUnitaire: 1000,
            montantHt: 1000,
          },
        },
      },
    });
    const entry = await accounting.postInvoice(
      invoice.id,
      { clientOperationId: crypto.randomUUID() },
      raf,
    );
    const chargeLine = entry.lignes.find(
      (line) => line.roleSnapshot === 'CHARGE',
    );
    expect(chargeLine?.debit.toFixed(2)).toBe('1000.00');
    const compte = await env.prisma.compteComptable.findUniqueOrThrow({
      where: { id: chargeLine!.compteId },
    });
    expect(compte.numero).toBe('628');
  });

  it('lets RAF manage the chart of accounts without deleting moved numbers', async () => {
    const created = await accounting.createAccount(
      {
        societeId: companyId,
        numero: '606',
        intitule: 'Fournitures non stockables',
      },
      raf,
    );
    expect(created.numero).toBe('606');
    const listed = await accounting.listAccounts(companyId);
    expect(listed.some((row) => row.numero === '411')).toBe(true);
  });

  it('backfills historical POS tickets onto VENTES and CAISSE', async () => {
    const vente = await createVente();
    const before = await env.prisma.ecritureComptable.findUnique({
      where: {
        sourceType_sourceId: { sourceType: 'VENTE_POS', sourceId: vente.id },
      },
    });
    expect(before).toBeNull();
    const result = await sales.backfillOperational(companyId, userId);
    expect(result.ventes).toBeGreaterThanOrEqual(1);
    const posted = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: { sourceType: 'VENTE_POS', sourceId: vente.id },
      },
    });
    expect(posted.journalId).toBeTruthy();
    const paiement = await env.prisma.paiementVente.findFirstOrThrow({
      where: { venteId: vente.id },
    });
    await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: {
          sourceType: 'ENCAISSEMENT_CLIENT',
          sourceId: paiement.id,
        },
      },
    });
  });

  it('posts a B2B customer invoice on 411/701/4457 without VENTE_POS', async () => {
    const client = await env.prisma.client.create({
      data: { nom: 'Client Facture GL', typeClient: 'MORALE' },
    });
    const facture = await env.prisma.factureClient.create({
      data: {
        numero: `FAC-GL-${crypto.randomUUID().slice(0, 8)}`,
        statut: 'EMISE',
        clientId: client.id,
        dateFacture: new Date('2026-08-10T10:00:00Z'),
        emiseAt: new Date('2026-08-10T10:00:00Z'),
        montantHt: 1000,
        montantTva: 180,
        montantTtc: 1180,
        createdById: userId,
        emiseParId: userId,
        lignes: {
          create: {
            designation: 'Lot B2B',
            quantite: 1,
            prixUnitaire: 1000,
            tauxTva: 18,
            montantHt: 1000,
            montantTva: 180,
            montantTtc: 1180,
          },
        },
      },
    });
    await sales.tryPostFactureClient(facture.id, userId);
    const posted = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: {
        sourceType_sourceId: {
          sourceType: 'FACTURE_CLIENT',
          sourceId: facture.id,
        },
      },
      include: { lignes: { include: { compte: true } } },
    });
    const byNumero = Object.fromEntries(
      posted.lignes.map((line) => [line.compte.numero, line]),
    );
    expect(byNumero['411']?.debit.toFixed(2)).toBe('1180.00');
    expect(byNumero['701']?.credit.toFixed(2)).toBe('1000.00');
    expect(byNumero['4457']?.credit.toFixed(2)).toBe('180.00');
    const pos = await env.prisma.ecritureComptable.findUnique({
      where: {
        sourceType_sourceId: { sourceType: 'VENTE_POS', sourceId: facture.id },
      },
    });
    expect(pos).toBeNull();
  });
});
