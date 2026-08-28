import {
  buildPerimetre,
  buildSyscohadaLiasse,
  LIASSE_MENTION_AGREGAT,
  LIASSE_MENTION_NON_DEPOT,
  LIASSE_MENTION_UNE_SOCIETE,
  mergeTrialBalances,
  posteForAccount,
  POSTES_ACTIF,
  POSTES_CR,
  POSTES_PASSIF,
  previousWindow,
} from './syscohada-liasse';
import type { TrialBalanceRow } from './syscohada-statements';

function row(
  numero: string,
  debit: string,
  credit: string,
  intitule = numero,
): TrialBalanceRow {
  return {
    numero,
    intitule,
    debit,
    credit,
    solde: String(Number(debit) - Number(credit)),
  };
}

/** Grand livre équilibré (D = C = 23 000) — retail XOF. */
const N: TrialBalanceRow[] = [
  row('21', '10000', '0', 'Immobilisations corporelles'),
  row('28', '0', '2000', 'Amortissements'),
  row('31', '3000', '0', 'Marchandises'),
  row('411', '1180', '0', 'Clients'),
  row('521', '5820', '0', 'Banques'),
  row('101', '0', '10000', 'Capital social'),
  row('401', '0', '3000', 'Fournisseurs'),
  row('601', '1000', '0', 'Achats'),
  row('6813', '2000', '0', 'Dotations aux amortissements'),
  row('701', '0', '8000', 'Ventes'),
];

describe('SYSCOHADA liasse masses', () => {
  it('maps prefixes to official masses (longest prefix wins)', () => {
    expect(posteForAccount('21', POSTES_ACTIF)?.code).toBe('AD');
    expect(posteForAccount('28', POSTES_ACTIF)?.code).toBe('AE');
    expect(posteForAccount('281', POSTES_ACTIF)?.code).toBe('AE');
    expect(posteForAccount('31', POSTES_ACTIF)?.code).toBe('AG');
    expect(posteForAccount('411', POSTES_ACTIF)?.code).toBe('AH');
    expect(posteForAccount('4452', POSTES_ACTIF)?.code).toBe('AH');
    expect(posteForAccount('409', POSTES_ACTIF)?.code).toBe('AH');
    expect(posteForAccount('521', POSTES_ACTIF)?.code).toBe('AI');
    expect(posteForAccount('101', POSTES_PASSIF)?.code).toBe('PA');
    expect(posteForAccount('401', POSTES_PASSIF)?.code).toBe('PE');
    expect(posteForAccount('408', POSTES_PASSIF)?.code).toBe('PE');
    expect(posteForAccount('4457', POSTES_PASSIF)?.code).toBe('PG');
    expect(posteForAccount('701', POSTES_CR)?.code).toBe('TA');
    expect(posteForAccount('603', POSTES_CR)?.code).toBe('RB');
    expect(posteForAccount('601', POSTES_CR)?.code).toBe('RA');
    expect(posteForAccount('6813', POSTES_CR)?.code).toBe('RD');
    expect(posteForAccount('613', POSTES_CR)?.code).toBe('RC');
  });

  it('builds a balanced mass bilan, retail CR and N-only TFT', () => {
    const pack = buildSyscohadaLiasse({
      rowsN: N,
      rowsN1: [],
      perimetre: buildPerimetre({
        societeCount: 1,
        societeLibelle: 'Marché des Accessoires',
      }),
      notes: {
        methodes: ['XOF', 'SYSCOHADA', 'inventaire permanent 31/603'],
        immobilisations: {
          brute: '10000.00',
          amortissements: '2000.00',
          nette: '8000.00',
          source: 'grand_livre',
        },
        encours: { fournisseurs401: '3000.00', clients411: '1180.00' },
        tva: { deductible: '0.00', collectee: '0.00', netAPayer: '0.00' },
      },
    });

    expect(pack.mention).toBe(LIASSE_MENTION_NON_DEPOT);
    expect(pack.perimetre.mode).toBe('UNE_SOCIETE');
    expect(pack.perimetre.message).toContain('Marché des Accessoires');
    expect(pack.perimetre.message).toContain(LIASSE_MENTION_UNE_SOCIETE);

    expect(pack.bilan.actif.find((l) => l.code === 'AD')?.montant).toBe(
      '10000.00',
    );
    expect(pack.bilan.actif.find((l) => l.code === 'AE')?.montant).toBe(
      '-2000.00',
    );
    expect(pack.bilan.actif.find((l) => l.code === 'AF')?.montant).toBe(
      '8000.00',
    );
    expect(pack.bilan.actif.find((l) => l.code === 'AG')?.montant).toBe(
      '3000.00',
    );
    expect(pack.bilan.actif.find((l) => l.code === 'AH')?.montant).toBe(
      '1180.00',
    );
    expect(pack.bilan.actif.find((l) => l.code === 'AI')?.montant).toBe(
      '5820.00',
    );
    expect(pack.bilan.totalActif).toBe('18000.00');
    expect(pack.bilan.totalPassif).toBe('18000.00');
    expect(pack.bilan.equilibre).toBe(true);
    expect(pack.bilan.passif.some((l) => l.code === 'RN')).toBe(true);

    expect(pack.compteResultat.ventes).toBe('8000.00');
    expect(pack.compteResultat.achatsCmv).toBe('1000.00');
    expect(pack.compteResultat.margeCommerciale).toBe('7000.00');
    expect(pack.compteResultat.resultat).toBe('5000.00');
    expect(pack.compteResultat.benefice).toBe(true);

    expect(pack.tft.mode).toBe('N_SEULEMENT');
    expect(pack.tft.mention).toMatch(/N−1 absent/);
  });

  it('computes TFT deltas when N−1 exists', () => {
    const n1 = [
      row('21', '10000', '0'),
      row('28', '0', '1000'),
      row('31', '4000', '0'),
      row('411', '500', '0'),
      row('521', '4000', '0'),
      row('101', '0', '10000'),
      row('401', '0', '2500'),
    ];
    const pack = buildSyscohadaLiasse({
      rowsN: N,
      rowsN1: n1,
      perimetre: buildPerimetre({ societeCount: 1, societeLibelle: 'S' }),
      notes: {
        methodes: [],
        immobilisations: {
          brute: '0',
          amortissements: '0',
          nette: '0',
          source: 'registre',
        },
        encours: { fournisseurs401: '0', clients411: '0' },
        tva: { deductible: '0', collectee: '0', netAPayer: '0' },
      },
    });
    expect(pack.tft.mode).toBe('INDIRECT_N_N1');
    expect(pack.tft.mention).toBeNull();
    const deltaTreso = pack.tft.lignes.find((l) => l.code === 'T5');
    expect(deltaTreso?.montant).toBe('1820.00');
  });

  it('labels an aggregate as non-consolidated when several companies exist', () => {
    const one = buildPerimetre({
      societeCount: 2,
      societeLibelle: 'Alpha',
    });
    expect(one.mode).toBe('SOCIETE_DANS_MULTI');
    expect(one.message).toContain(LIASSE_MENTION_AGREGAT);

    const agregat = buildPerimetre({ societeCount: 2, agregat: true });
    expect(agregat.mode).toBe('AGREGAT_NON_CONSOLIDE');
    expect(agregat.message).toBe(LIASSE_MENTION_AGREGAT);
  });

  it('sums trial balances without intra-group elimination', () => {
    const merged = mergeTrialBalances([
      [row('521', '100', '0')],
      [row('521', '50', '0'), row('401', '0', '50')],
    ]);
    expect(merged.find((r) => r.numero === '521')?.debit).toBe('150.00');
    expect(merged.find((r) => r.numero === '401')?.credit).toBe('50.00');
  });

  it('computes the previous window as the same length ending the day before du', () => {
    const { du, au } = previousWindow(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-12-31T23:59:59.999Z'),
    );
    expect(au.toISOString()).toBe('2025-12-31T23:59:59.999Z');
    expect(du.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });
});
