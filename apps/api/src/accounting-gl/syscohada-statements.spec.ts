import {
  buildSyscohadaStatements,
  buildVatReturn,
  classeCompte,
} from './syscohada-statements';

describe('SYSCOHADA statements', () => {
  it('maps account numbers to SYSCOHADA classes', () => {
    expect(classeCompte('401')).toBe('4');
    expect(classeCompte('4457')).toBe('4');
    expect(classeCompte('701')).toBe('7');
  });

  it('builds a balanced bilan and a profit from classes 1–7', () => {
    const statements = buildSyscohadaStatements([
      {
        numero: '521',
        intitule: 'Banque',
        debit: '11800',
        credit: '0',
        solde: '11800',
      },
      {
        numero: '401',
        intitule: 'Fournisseurs',
        debit: '0',
        credit: '1800',
        solde: '-1800',
      },
      {
        numero: '601',
        intitule: 'Achats',
        debit: '1000',
        credit: '0',
        solde: '1000',
      },
      {
        numero: '701',
        intitule: 'Ventes',
        debit: '0',
        credit: '11000',
        solde: '-11000',
      },
    ]);
    expect(statements.bilan.totalActif).toBe('11800.00');
    expect(statements.bilan.totalPassif).toBe('11800.00');
    expect(statements.bilan.equilibre).toBe(true);
    expect(statements.bilan.passif.some((line) => line.numero === 'RN')).toBe(
      true,
    );
    expect(statements.compteResultat.totalCharges).toBe('1000.00');
    expect(statements.compteResultat.totalProduits).toBe('-11000.00');
    expect(statements.compteResultat.resultat).toBe('10000.00');
    expect(statements.compteResultat.benefice).toBe(true);
  });

  it('puts a period loss on the actif so the bilan still balances', () => {
    const statements = buildSyscohadaStatements([
      {
        numero: '401',
        intitule: 'Fournisseurs',
        debit: '0',
        credit: '500',
        solde: '-500',
      },
      {
        numero: '601',
        intitule: 'Achats',
        debit: '500',
        credit: '0',
        solde: '500',
      },
    ]);
    expect(statements.compteResultat.resultat).toBe('-500.00');
    expect(statements.bilan.totalActif).toBe('500.00');
    expect(statements.bilan.totalPassif).toBe('500.00');
    expect(statements.bilan.equilibre).toBe(true);
    expect(statements.bilan.actif.some((line) => line.numero === 'RN')).toBe(
      true,
    );
  });

  it('computes TVA nette à payer from 4452 / 4457', () => {
    const vat = buildVatReturn([
      {
        numero: '4452',
        intitule: 'TVA récupérable',
        debit: '180',
        credit: '0',
        solde: '180',
      },
      {
        numero: '4457',
        intitule: 'TVA collectée',
        debit: '0',
        credit: '1980',
        solde: '-1980',
      },
    ]);
    expect(vat.deductible).toBe('180.00');
    expect(vat.collectee).toBe('1980.00');
    expect(vat.netAPayer).toBe('1800.00');
    expect(vat.creditTva).toBe(false);
  });
});
