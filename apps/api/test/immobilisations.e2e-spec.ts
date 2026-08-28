import { P2pAccountingCalculator } from '../src/fournisseurs/p2p-accounting.calculator';
import { ImmobilisationsService } from '../src/immobilisations/immobilisations.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

describe('Immobilisations — dotation linéaire 6813/28 (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  const raf = {
    userId: '',
    role: 'RAF_COMPTABLE' as const,
    boutiqueId: null,
    login: 'raf-immo',
  };
  let companyId: string;
  let periodeId: string;
  let compte21: string;
  let compte28: string;
  let compte6813: string;
  let immos: ImmobilisationsService;

  beforeAll(async () => {
    await env.start();
    immos = new ImmobilisationsService(
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
          prenom: 'Immo',
          login: `raf-immo-${crypto.randomUUID()}`,
          passwordHash: 'x',
          roleId: rafRole.id,
        },
      })
    ).id;
    const company = await env.prisma.societe.create({
      data: { raisonSociale: 'Immos', adresse: 'Abidjan' },
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
    const periode = await env.prisma.periodeComptable.create({
      data: {
        societeId: company.id,
        exerciceId: exercise.id,
        code: '2026-08',
        dateDebut: new Date('2026-08-01'),
        dateFin: new Date('2026-08-31T23:59:59.999Z'),
      },
    });
    periodeId = periode.id;
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
          ['21', 'Immobilisations corporelles'],
          ['28', 'Amortissements'],
          ['6813', 'Dotations aux amortissements'],
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
    compte21 = accounts['21'];
    compte28 = accounts['28'];
    compte6813 = accounts['6813'];
    await env.prisma.modeleComptabilisation.create({
      data: {
        societeId: company.id,
        journalId: journalOd.id,
        code: 'DEPRECIATION',
        version: 1,
        sourceType: 'AMORTISSEMENT_IMMO',
        valideDu: new Date('2026-01-01'),
        lignes: {
          create: [
            { role: 'CHARGE', compteId: compte6813, ordre: 1 },
            { role: 'AMORTISSEMENT', compteId: compte28, ordre: 2 },
          ],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  });

  it('creates an asset, posts Dr 6813 / Cr 28, and is idempotent on replay', async () => {
    const fiche = await immos.create(
      {
        societeId: companyId,
        compteId: compte21,
        libelle: 'Agencement boutique Plateau',
        dateMiseEnService: '2026-08-01',
        valeurBrute: 1200,
        dureeMois: 12,
        valeurResiduelle: 0,
      },
      raf,
    );
    expect(fiche.statut).toBe('EN_SERVICE');

    const first = await immos.genererMois(
      { societeId: companyId, periodeId },
      raf,
    );
    expect(first.dotations).toHaveLength(1);
    expect(first.dotations[0].creee).toBe(true);
    expect(first.dotations[0].montant).toBe('100.00');

    const entry = await env.prisma.ecritureComptable.findUniqueOrThrow({
      where: { id: first.dotations[0].ecritureId },
      include: {
        lignes: { include: { compte: true }, orderBy: { numeroLigne: 'asc' } },
      },
    });
    expect(entry.sourceType).toBe('AMORTISSEMENT_IMMO');
    const debit6813 = entry.lignes.find((l) => l.compte.numero === '6813');
    const credit28 = entry.lignes.find((l) => l.compte.numero === '28');
    expect(debit6813?.debit.toFixed(2)).toBe('100.00');
    expect(debit6813?.credit.toFixed(2)).toBe('0.00');
    expect(credit28?.credit.toFixed(2)).toBe('100.00');
    expect(credit28?.debit.toFixed(2)).toBe('0.00');

    const second = await immos.genererMois(
      { societeId: companyId, periodeId },
      raf,
    );
    expect(second.dotations[0].creee).toBe(false);
    expect(second.dotations[0].ecritureId).toBe(first.dotations[0].ecritureId);
    const count = await env.prisma.ecritureComptable.count({
      where: { societeId: companyId, sourceType: 'AMORTISSEMENT_IMMO' },
    });
    expect(count).toBe(1);
  });
});
