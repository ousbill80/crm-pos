import { describe, expect, it } from 'vitest';
import { classeSyscohada, emptyAgingCopy, groupBalanceByClasse } from './compta-reports';
import { journalActifPourType, type AccountingJournal } from './p2p';

function journal(
  partial: Partial<AccountingJournal> & Pick<AccountingJournal, 'id' | 'type'>,
): AccountingJournal {
  return {
    code: partial.type,
    libelle: partial.type,
    actif: true,
    exercice: { id: 'ex', code: '2026', cloture: false },
    _count: { ecritures: 0, modeles: 0 },
    ...partial,
  };
}

describe('classes SYSCOHADA', () => {
  it('prend le premier chiffre du numéro de compte', () => {
    expect(classeSyscohada('401')).toBe('4');
    expect(classeSyscohada('571')).toBe('5');
    expect(classeSyscohada('701')).toBe('7');
    expect(classeSyscohada('31')).toBe('3');
  });

  it('regroupe la balance par classe, tiers 4 séparés des produits 7', () => {
    const groups = groupBalanceByClasse([
      { id: 'a', numero: '401', intitule: 'Fournisseurs', debit: '1', credit: '1', solde: '0' },
      { id: 'b', numero: '411', intitule: 'Clients', debit: '2', credit: '0', solde: '2' },
      { id: 'c', numero: '701', intitule: 'Ventes', debit: '0', credit: '3', solde: '-3' },
    ]);
    expect(groups.map((g) => g.classe)).toEqual(['4', '7']);
    expect(groups[0].libelle).toBe('Tiers');
    expect(groups[0].rows.map((r) => r.numero)).toEqual(['401', '411']);
    expect(groups[1].libelle).toBe('Produits');
  });
});

describe('emptyAgingCopy', () => {
  it('explique pourquoi le 411 peut être vide en magasin', () => {
    expect(emptyAgingCopy('clients').description).toMatch(/411/);
    expect(emptyAgingCopy('fournisseurs').description).toMatch(/factures fournisseurs/i);
  });
});

describe('journalActifPourType', () => {
  it('préfère le journal actif d’un exercice ouvert', () => {
    const items = [
      journal({ id: 'old', type: 'VENTES', actif: true, exercice: { id: 'e1', code: '2025', cloture: true } }),
      journal({ id: 'open', type: 'VENTES', actif: true, exercice: { id: 'e2', code: '2026', cloture: false } }),
      journal({ id: 'off', type: 'VENTES', actif: false, exercice: { id: 'e2', code: '2026', cloture: false } }),
    ];
    expect(journalActifPourType(items, 'VENTES')?.id).toBe('open');
  });

  it('ignore les autres types de journal', () => {
    const items = [journal({ id: 'caisse', type: 'CAISSE' })];
    expect(journalActifPourType(items, 'VENTES')).toBeUndefined();
  });
});
