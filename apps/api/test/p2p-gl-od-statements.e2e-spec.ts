import { P2pAccountingCalculator } from '../src/fournisseurs/p2p-accounting.calculator';
import { P2pAccountingService } from '../src/fournisseurs/p2p-accounting.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

describe('GL OD / états SYSCOHADA / clôture (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  const raf = {
    userId: '',
    role: 'RAF_COMPTABLE' as const,
    boutiqueId: null,
    login: 'raf-od',
  };
  const daf = {
    userId: '',
    role: 'DAF' as const,
    boutiqueId: null,
    login: 'daf-od',
  };
  let companyId: string;
  let exerciceId: string;
  let chargeId: string;
  let saleId: string;
  let resultatId: string;
  let accounting: P2pAccountingService;

  beforeAll(async () => {
    await env.start();
    accounting = new P2pAccountingService(
      env.prisma,
      new P2pAccountingCalculator(),
    );
    const rafRole = await env.prisma.role.create({
      data: { libelle: 'RAF_COMPTABLE', niveauHabilitation: 1 },
    });
    raf.userId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'RAF',
          prenom: 'OD',
          login: `raf-od-${crypto.randomUUID()}`,
          passwordHash: 'x',
          roleId: rafRole.id,
        },
      })
    ).id;
    const dafRole = await env.prisma.role.create({
      data: { libelle: 'DAF', niveauHabilitation: 1 },
    });
    daf.userId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'DAF',
          prenom: 'OD',
          login: `daf-od-${crypto.randomUUID()}`,
          passwordHash: 'x',
          roleId: dafRole.id,
        },
      })
    ).id;
    const company = await env.prisma.societe.create({
      data: { raisonSociale: 'GL OD', adresse: 'Abidjan' },
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
    exerciceId = exercise.id;
    await env.prisma.periodeComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
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
          ['628', 'Charges diverses'],
          ['701', 'Ventes'],
          ['13', 'Résultat net'],
          ['411', 'Clients'],
          ['4457', 'TVA collectée'],
          ['4452', 'TVA récupérable'],
          ['401', 'Fournisseurs'],
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
    chargeId = accounts['628'];
    saleId = accounts['701'];
    resultatId = accounts['13'];
    const odLines = [
      ['CHARGE', chargeId],
      ['VENTE', saleId],
    ] as const;
    for (const [code, sourceType] of [
      ['MANUAL_OD', 'OD_MANUELLE'],
      ['YEAR_CLOSE', 'CLOTURE_EXERCICE'],
      ['OPENING_BALANCE', 'A_NOUVEAUX'],
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
            create: odLines.map(([role, compteId], index) => ({
              role,
              compteId,
              ordre: index + 1,
            })),
          },
        },
      });
    }
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  });

  it('posts a balanced manual OD then builds bilan / CR / TVA', async () => {
    const entry = await accounting.postManualJournal(
      {
        societeId: companyId,
        clientOperationId: crypto.randomUUID(),
        dateComptable: '2026-08-12',
        libelle: 'Reclassement charge / produit',
        referencePiece: 'NI-2026-014',
        lignes: [
          { compteId: chargeId, debit: 1000, credit: 0 },
          { compteId: saleId, debit: 0, credit: 1000 },
        ],
      },
      raf,
    );
    expect(entry.lignes).toHaveLength(2);
    expect(entry.libelle).toContain('NI-2026-014');
    const statements = await accounting.financialStatements({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    expect(statements.compteResultat.totalCharges).toBe('1000.00');
    expect(Number(statements.compteResultat.totalProduits)).toBe(-1000);
    expect(statements.compteResultat.resultat).toBe('0.00');
    const vat = await accounting.vatReturn({
      societeId: companyId,
      du: '2026-08-01',
      au: '2026-08-31',
    });
    expect(vat.netAPayer).toBe('0.00');
  });

  it('letters balanced 401 lines and refuses to change a posted letter', async () => {
    const fournisseur = await env.prisma.fournisseur.create({
      data: { nom: 'Lettrage CI' },
    });
    const period = await env.prisma.periodeComptable.findFirstOrThrow({
      where: { societeId: companyId },
    });
    const journal = await env.prisma.journalComptable.findFirstOrThrow({
      where: { societeId: companyId, code: 'OD' },
    });
    const modele = await env.prisma.modeleComptabilisation.findFirstOrThrow({
      where: { societeId: companyId, code: 'MANUAL_OD' },
    });
    const account401 = await env.prisma.compteComptable.findFirstOrThrow({
      where: { societeId: companyId, numero: '401' },
    });
    async function piece401(sens: 'credit' | 'debit', sourceId: string) {
      return env.prisma.ecritureComptable.create({
        data: {
          numero: `TST-401-${sourceId.slice(0, 6)}`,
          societeId: companyId,
          exerciceId,
          periodeId: period.id,
          journalId: journal.id,
          modeleId: modele.id,
          modeleCodeSnapshot: modele.code,
          modeleVersionSnapshot: modele.version,
          sourceType: 'OD_MANUELLE',
          sourceId,
          libelle: 'Pièce 401 test',
          dateComptable: new Date('2026-08-10'),
          devise: 'XOF',
          clientOperationId: crypto.randomUUID(),
          auteurId: raf.userId,
          lignes: {
            create: [
              {
                numeroLigne: 1,
                compteId: account401.id,
                roleSnapshot: 'FOURNISSEUR',
                libelle: '401',
                debit: sens === 'debit' ? 500 : 0,
                credit: sens === 'credit' ? 500 : 0,
                fournisseurId: fournisseur.id,
              },
              {
                numeroLigne: 2,
                compteId: chargeId,
                roleSnapshot: 'CHARGE',
                libelle: 'contrepartie',
                debit: sens === 'credit' ? 500 : 0,
                credit: sens === 'debit' ? 500 : 0,
              },
            ],
          },
        },
        include: { lignes: true },
      });
    }
    const facture = await piece401('credit', crypto.randomUUID());
    const paiement = await piece401('debit', crypto.randomUUID());
    const ligne401Facture = facture.lignes.find(
      (line) => line.roleSnapshot === 'FOURNISSEUR',
    )!;
    const ligne401Paiement = paiement.lignes.find(
      (line) => line.roleSnapshot === 'FOURNISSEUR',
    )!;
    const lettered = await accounting.letterLines(
      {
        societeId: companyId,
        clientOperationId: crypto.randomUUID(),
        code: 'A1',
        ligneIds: [ligne401Facture.id, ligne401Paiement.id],
      },
      raf,
    );
    expect(lettered.code).toBe('A1');
    await expect(
      accounting.letterLines(
        {
          societeId: companyId,
          clientOperationId: crypto.randomUUID(),
          code: 'B2',
          ligneIds: [ligne401Facture.id, ligne401Paiement.id],
        },
        raf,
      ),
    ).rejects.toThrow(/déjà lettrée/);
  });

  it('posts a storno OD that reverses an existing entry without updating it', async () => {
    const original = await accounting.postManualJournal(
      {
        societeId: companyId,
        clientOperationId: crypto.randomUUID(),
        dateComptable: '2026-08-12',
        libelle: 'À contre-passer',
        referencePiece: 'NI-ORIG-001',
        lignes: [
          { compteId: chargeId, debit: 250, credit: 0 },
          { compteId: saleId, debit: 0, credit: 250 },
        ],
      },
      raf,
    );
    const storno = await accounting.stornoEntry(
      original.id,
      {
        societeId: companyId,
        clientOperationId: crypto.randomUUID(),
        referencePiece: 'NI-STORNO-001',
      },
      raf,
    );
    expect(storno.sourceId).toBe(`storno:${original.id}`);
    expect(storno.libelle).toContain('NI-STORNO-001');
    const byCompte = Object.fromEntries(
      storno.lignes.map((line) => [line.compteId, line]),
    );
    expect(byCompte[chargeId].credit.toFixed(2)).toBe('250.00');
    expect(byCompte[saleId].debit.toFixed(2)).toBe('250.00');
    const unchanged = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: { id: original.id },
      include: { lignes: true },
    });
    expect(
      unchanged.lignes
        .find((line) => line.compteId === chargeId)
        ?.debit.toFixed(2),
    ).toBe('250.00');
    const replay = await accounting.stornoEntry(
      original.id,
      {
        societeId: companyId,
        clientOperationId: crypto.randomUUID(),
        referencePiece: 'NI-STORNO-002',
      },
      raf,
    );
    expect(replay.id).toBe(storno.id);
  });

  it('refuses a manual OD without a supporting document reference', async () => {
    await expect(
      accounting.postManualJournal(
        {
          societeId: companyId,
          clientOperationId: crypto.randomUUID(),
          dateComptable: '2026-08-12',
          libelle: 'Sans pièce',
          referencePiece: '',
          lignes: [
            { compteId: chargeId, debit: 1000, credit: 0 },
            { compteId: saleId, debit: 0, credit: 1000 },
          ],
        },
        raf,
      ),
    ).rejects.toThrow(/pièce justificative/);
  });

  it('lets DAF close the exercise on the last open period and opens à-nouveaux year', async () => {
    const closed = await accounting.closeExercice(
      exerciceId,
      { societeId: companyId, clientOperationId: crypto.randomUUID() },
      daf,
    );
    expect(closed.cloture).toBe(true);
    const next = await env.prisma.exerciceComptable.findFirstOrThrow({
      where: { societeId: companyId, code: '2027' },
    });
    expect(next.cloture).toBe(false);
    const cloture = await env.prisma.ecritureComptable.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: 'CLOTURE_EXERCICE',
          sourceId: `cloture-${exerciceId}`,
        },
      },
      include: { lignes: { include: { compte: true } }, periode: true },
    });
    expect(cloture).toBeTruthy();
    expect(cloture?.periode.code).toBe('2026-08');
    expect(cloture?.lignes.some((line) => line.compteId === resultatId)).toBe(
      true,
    );
    const jan = await env.prisma.periodeComptable.findFirstOrThrow({
      where: { exerciceId: next.id, code: '2027-01' },
    });
    expect(jan.cloture).toBe(false);
    const months = await env.prisma.periodeComptable.count({
      where: { exerciceId: next.id },
    });
    expect(months).toBe(12);
  });

  it('lets RAF open the next exercise with twelve months and cloned journals', async () => {
    const opened = await accounting.openExercice(
      {
        societeId: companyId,
        code: '2028',
        clientOperationId: crypto.randomUUID(),
      },
      raf,
    );
    expect(opened.cloture).toBe(false);
    expect(opened._count.periodes).toBe(12);
    expect(opened._count.journaux).toBeGreaterThan(0);
    await expect(
      accounting.openExercice(
        {
          societeId: companyId,
          code: '2026',
          clientOperationId: crypto.randomUUID(),
        },
        raf,
      ),
    ).rejects.toThrow(/clôturé/);
  });
});
