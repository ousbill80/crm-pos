import { Prisma } from '@prisma/client';
import { P2pAccountingCalculator } from '../src/fournisseurs/p2p-accounting.calculator';
import { P2pAccountingService } from '../src/fournisseurs/p2p-accounting.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

describe('P2P accounting/payments (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let service: P2pAccountingService;
  let invoiceId: string;
  let userId: string;
  let dafUserId: string;
  let centralUserId: string;
  let periodId: string;
  let companyId: string;
  let exerciseId: string;
  let treasuryCashId: string;

  beforeAll(async () => {
    await env.start();
    service = new P2pAccountingService(
      env.prisma,
      new P2pAccountingCalculator(),
    );
    const role = await env.prisma.role.create({
      data: { libelle: 'RAF_COMPTABLE', niveauHabilitation: 1 },
    });
    userId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'RAF',
          prenom: 'Test',
          login: `raf-${crypto.randomUUID()}`,
          passwordHash: 'not-used-in-service-test',
          roleId: role.id,
        },
      })
    ).id;
    const dafRole = await env.prisma.role.create({
      data: { libelle: 'DAF', niveauHabilitation: 1 },
    });
    dafUserId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'DAF',
          prenom: 'Test',
          login: `daf-${crypto.randomUUID()}`,
          passwordHash: 'not-used-in-service-test',
          roleId: dafRole.id,
        },
      })
    ).id;
    const centralRole = await env.prisma.role.create({
      data: { libelle: 'CAISSIER_CENTRAL', niveauHabilitation: 1 },
    });
    centralUserId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'Central',
          prenom: 'Test',
          login: `cc-${crypto.randomUUID()}`,
          passwordHash: 'not-used-in-service-test',
          roleId: centralRole.id,
        },
      })
    ).id;
    const company = await env.prisma.societe.create({
      data: { raisonSociale: 'P2P Accounting', adresse: 'Abidjan' },
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
    exerciseId = exercise.id;
    periodId = (
      await env.prisma.periodeComptable.create({
        data: {
          societeId: company.id,
          exerciceId: exercise.id,
          code: '2026-08',
          dateDebut: new Date('2026-08-01'),
          dateFin: new Date('2026-08-31T23:59:59.999Z'),
        },
      })
    ).id;
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
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journal.id,
        code: 'SUPPLIER_CREDIT_NOTE',
        version: 1,
        sourceType: 'AVOIR_FOURNISSEUR',
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
      data: { nom: 'Supplier GL' },
    });
    const product = await env.prisma.produit.create({
      data: { designation: 'Accounting product', prixUnitaire: 100 },
    });
    const order = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-${crypto.randomUUID()}`,
        fournisseurId: supplier.id,
        societeId: company.id,
        initiateurId: userId,
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
          createurId: userId,
          dateDocument: new Date('2026-08-24'),
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
  }, 120_000);

  afterAll(() => env.stop(), 30_000);

  it('posts and flips COMPTABILISEE atomically with a balanced entry', async () => {
    const operation = crypto.randomUUID();
    const entry = await service.postInvoice(
      invoiceId,
      { clientOperationId: operation },
      {
        userId,
        login: 'raf',
        role: 'RAF_COMPTABLE',
        boutiqueId: null,
      },
    );
    const debit = entry.lignes.reduce(
      (sum, line) => sum.plus(line.debit),
      new Prisma.Decimal(0),
    );
    const credit = entry.lignes.reduce(
      (sum, line) => sum.plus(line.credit),
      new Prisma.Decimal(0),
    );
    expect(debit.eq(credit)).toBe(true);
    expect(entry.numero).toBe('ACH-2026-000001');
    expect(entry.lignes.some((line) => line.fournisseurId)).toBe(true);
    expect(
      (
        await env.prisma.factureFournisseur.findUniqueOrThrow({
          where: { id: invoiceId },
        })
      ).statut,
    ).toBe('COMPTABILISEE');
    expect(
      (
        await service.postInvoice(
          invoiceId,
          { clientOperationId: operation },
          { userId, login: 'raf', role: 'RAF_COMPTABLE', boutiqueId: null },
        )
      ).id,
    ).toBe(entry.id);
    await expect(
      env.prisma.ecritureComptable.delete({ where: { id: entry.id } }),
    ).rejects.toThrow('append-only');
  });

  it('database rejects status flip without GL', async () => {
    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'No GL' },
    });
    const invoice = await env.prisma.factureFournisseur.create({
      data: {
        numero: `NOGL-${crypto.randomUUID()}`,
        societeId: companyId,
        fournisseurId: supplier.id,
        createurId: userId,
        montant: 10,
        statutRapprochement: 'RAPPROCHEE',
      },
    });
    await expect(
      env.prisma.factureFournisseur.update({
        where: { id: invoice.id },
        data: { statut: 'COMPTABILISEE' },
      }),
    ).rejects.toThrow('COMPTABILISEE exige');
  });

  it('letters executed payments into aging, enforces SoD and sequential cash pieces', async () => {
    const raf = {
      userId,
      login: 'raf',
      role: 'RAF_COMPTABLE' as const,
      boutiqueId: null,
    };
    const daf = {
      userId: dafUserId,
      login: 'daf',
      role: 'DAF' as const,
      boutiqueId: null,
    };
    const central = {
      userId: centralUserId,
      login: 'central',
      role: 'CAISSIER_CENTRAL' as const,
      boutiqueId: null,
    };
    const agingBefore = await service.supplierAging({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    const before = agingBefore.find((row) => row.id === invoiceId);
    expect(before).toBeDefined();
    expect(before!.allocationsPaiement).toHaveLength(0);

    const proposal = await service.preparePayment(
      {
        societeId: companyId,
        compteTresorerieId: treasuryCashId,
        mode: 'CAISSE_CENTRALE',
        devise: 'XOF',
        dateExecutionPrevue: '2026-08-26',
        clientOperationId: crypto.randomUUID(),
        allocations: [{ factureId: invoiceId, montant: 1130 }],
      },
      raf,
    );
    await service.approvePayment(
      proposal.id,
      { clientOperationId: crypto.randomUUID() },
      daf,
    );
    await expect(
      service.executePayment(
        proposal.id,
        {
          clientOperationId: crypto.randomUUID(),
          challengeId: crypto.randomUUID(),
          dateComptable: '2026-08-26',
        },
        daf,
      ),
    ).rejects.toThrow(/personnes distinctes/);
    const payment = await service.executePayment(
      proposal.id,
      {
        clientOperationId: crypto.randomUUID(),
        challengeId: crypto.randomUUID(),
        dateComptable: '2026-08-26',
      },
      central,
    );
    expect(payment.montant.toFixed(2)).toBe('1130.00');
    const entry = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: { id: payment.ecritureComptableId! },
    });
    expect(entry.numero).toBe('CAI-2026-000001');

    const allocation =
      await env.prisma.allocationPaiementFournisseur.findFirstOrThrow({
        where: { propositionId: proposal.id },
      });
    expect(allocation.paiementId).toBe(payment.id);
    expect(allocation.lettrage).toBe(`LT-${proposal.numero}`);

    const agingAfter = await service.supplierAging({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    const after = agingAfter.find((row) => row.id === invoiceId);
    expect(after).toBeDefined();
    expect(
      after!.allocationsPaiement.reduce(
        (sum, row) => sum + Number(row.montant),
        0,
      ),
    ).toBe(1130);

    const exported = await service.accountingExport({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    expect(exported.journal).toBe('GRAND_LIVRE');
    expect(exported.rows.some((row) => row.journal === 'CAI')).toBe(true);
    expect(exported.rows.some((row) => row.piece === 'CAI-2026-000001')).toBe(
      true,
    );

    await expect(
      env.prisma.paiementFournisseur.delete({ where: { id: payment.id } }),
    ).rejects.toThrow('append-only');
  });

  it('rejects a treasury GL from another company and hides foreign aging', async () => {
    const other = await env.prisma.societe.create({
      data: { raisonSociale: 'Other Co', adresse: 'Bouake' },
    });
    const foreignGl = await env.prisma.compteComptable.create({
      data: {
        societeId: other.id,
        numero: '521999',
        intitule: 'Banque étrangère',
      },
    });
    await expect(
      service.createTreasuryAccount(
        {
          societeId: companyId,
          code: 'FOREIGN',
          libelle: 'Compte pirate',
          type: 'BANK',
          devise: 'XOF',
          compteComptableId: foreignGl.id,
        },
        {
          userId,
          login: 'raf',
          role: 'RAF_COMPTABLE',
          boutiqueId: null,
        },
      ),
    ).rejects.toThrow(/appartenir à la société/);

    const otherExercise = await env.prisma.exerciceComptable.create({
      data: {
        societeId: other.id,
        code: '2026',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      },
    });
    await env.prisma.periodeComptable.create({
      data: {
        societeId: other.id,
        exerciceId: otherExercise.id,
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
      },
    });
    const otherJournal = await env.prisma.journalComptable.create({
      data: {
        societeId: other.id,
        exerciceId: otherExercise.id,
        code: 'ACHX',
        libelle: 'Achats',
        type: 'ACHATS',
      },
    });
    const otherAccounts = await Promise.all(
      [
        ['601000', 'Achats'],
        ['445000', 'TVA'],
        ['447000', 'Retenues'],
        ['401000', 'Fournisseurs'],
      ].map(([numero, intitule]) =>
        env.prisma.compteComptable.create({
          data: { societeId: other.id, numero, intitule },
        }),
      ),
    );
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: other.id,
        journalId: otherJournal.id,
        code: 'SUPPLIER_INVOICE',
        version: 1,
        sourceType: 'FACTURE_FOURNISSEUR',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            ['ACHAT', otherAccounts[0].id],
            ['TAXE', otherAccounts[1].id],
            ['RETENUE', otherAccounts[2].id],
            ['FOURNISSEUR', otherAccounts[3].id],
          ].map(([role, compteId], index) => ({
            role: role as 'ACHAT' | 'TAXE' | 'RETENUE' | 'FOURNISSEUR',
            compteId,
            ordre: index + 1,
          })),
        },
      },
    });
    const otherSupplier = await env.prisma.fournisseur.create({
      data: { nom: 'Other supplier' },
    });
    const otherProduct = await env.prisma.produit.create({
      data: { designation: 'Other SKU', prixUnitaire: 50 },
    });
    const otherOrder = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-${crypto.randomUUID()}`,
        fournisseurId: otherSupplier.id,
        societeId: other.id,
        initiateurId: userId,
        lignes: {
          create: {
            produitId: otherProduct.id,
            quantite: 1,
            prixUnitaire: 1000,
          },
        },
      },
      include: { lignes: true },
    });
    const otherInvoiceId = (
      await env.prisma.factureFournisseur.create({
        data: {
          numero: `INV-${crypto.randomUUID()}`,
          societeId: other.id,
          fournisseurId: otherSupplier.id,
          createurId: userId,
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
              ligneCommandeId: otherOrder.lignes[0].id,
              produitId: otherProduct.id,
              quantite: 1,
              prixUnitaire: 1000,
              montantHt: 1000,
            },
          },
        },
      })
    ).id;
    const aging = await service.supplierAging({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    expect(aging.some((row) => row.id === otherInvoiceId)).toBe(false);
  });

  it('posts a credit note on the AVOIR template and opens/closes periods', async () => {
    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'Credit note supplier' },
    });
    const product = await env.prisma.produit.create({
      data: { designation: 'CN product', prixUnitaire: 100 },
    });
    const order = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-${crypto.randomUUID()}`,
        fournisseurId: supplier.id,
        societeId: companyId,
        initiateurId: userId,
        lignes: {
          create: { produitId: product.id, quantite: 1, prixUnitaire: 1000 },
        },
      },
      include: { lignes: true },
    });
    const creditId = (
      await env.prisma.factureFournisseur.create({
        data: {
          numero: `CN-${crypto.randomUUID()}`,
          societeId: companyId,
          fournisseurId: supplier.id,
          createurId: userId,
          typeDocument: 'AVOIR',
          dateDocument: new Date('2026-08-24'),
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
    const entry = await service.postInvoice(
      creditId,
      { clientOperationId: crypto.randomUUID() },
      {
        userId,
        login: 'raf',
        role: 'RAF_COMPTABLE',
        boutiqueId: null,
      },
    );
    expect(entry.sourceType).toBe('AVOIR_FOURNISSEUR');
    expect(entry.numero).toBe('ACH-2026-000002');

    const listed = await service.listPeriods(companyId);
    expect(listed.some((row) => row.id === periodId && !row.cloture)).toBe(
      true,
    );
    await expect(
      service.openPeriod(
        {
          societeId: companyId,
          code: '2026-08b',
          dateDebut: '2026-08-15',
          dateFin: '2026-08-20',
        },
        {
          userId,
          login: 'raf',
          role: 'RAF_COMPTABLE',
          boutiqueId: null,
        },
      ),
    ).rejects.toThrow(/chevauche/);
  });

  it('lists, creates and updates every journal type without deleting posted ones', async () => {
    const raf = {
      userId,
      login: 'raf',
      role: 'RAF_COMPTABLE' as const,
      boutiqueId: null,
    };
    const listed = await service.listJournals(companyId);
    expect(
      listed.items.some((row) => row.code === 'ACH' && row.type === 'ACHATS'),
    ).toBe(true);
    expect(
      listed.exercices.some((row) => row.id === exerciseId && !row.cloture),
    ).toBe(true);

    const created: Array<{
      code: string;
      type: 'BANQUE' | 'VENTES' | 'OPERATIONS_DIVERSES';
    }> = [
      { code: 'BQ1', type: 'BANQUE' },
      { code: 'VTE', type: 'VENTES' },
      { code: 'OD1', type: 'OPERATIONS_DIVERSES' },
    ];
    for (const journal of created) {
      const row = await service.createJournal(
        {
          societeId: companyId,
          exerciceId: exerciseId,
          code: journal.code,
          libelle: `Journal ${journal.code}`,
          type: journal.type,
        },
        raf,
      );
      expect(row.code).toBe(journal.code);
      expect(row.type).toBe(journal.type);
      expect(row.actif).toBe(true);
    }

    const all = await service.listJournals(companyId, exerciseId);
    expect(all.items.map((row) => row.type).sort()).toEqual(
      ['ACHATS', 'BANQUE', 'CAISSE', 'OPERATIONS_DIVERSES', 'VENTES'].sort(),
    );

    await expect(
      service.createJournal(
        {
          societeId: companyId,
          exerciceId: exerciseId,
          code: 'ACH',
          libelle: 'Doublon',
          type: 'ACHATS',
        },
        raf,
      ),
    ).rejects.toThrow(/existe déjà/);

    const banque = all.items.find((row) => row.code === 'BQ1')!;
    const renamed = await service.updateJournal(
      banque.id,
      { libelle: 'Banque principale' },
      raf,
    );
    expect(renamed.libelle).toBe('Banque principale');
    const inactive = await service.updateJournal(
      banque.id,
      { actif: false },
      raf,
    );
    expect(inactive.actif).toBe(false);

    const ledger = await service.generalLedger({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
      journalId: listed.items.find((row) => row.code === 'ACH')!.id,
    });
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger.every((row) => row.ecriture.journal.code === 'ACH')).toBe(
      true,
    );
  });

  it('rejects posting in a closed period', async () => {
    await env.prisma.periodeComptable.update({
      where: { id: periodId },
      data: { cloture: true },
    });
    const invoice = await env.prisma.factureFournisseur.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    await expect(
      service.postInvoice(
        invoice.id,
        { clientOperationId: crypto.randomUUID() },
        { userId, login: 'raf', role: 'RAF_COMPTABLE', boutiqueId: null },
      ),
    ).rejects.toThrow();
  });
});
