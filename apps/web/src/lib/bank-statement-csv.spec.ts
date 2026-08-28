import { describe, expect, it } from 'vitest';
import { parseBankStatementCsv } from './bank-statement-csv';

describe('parseBankStatementCsv', () => {
  it('parses semicolon lines used by West African bank exports', () => {
    const lines = parseBankStatementCsv(
      'Date;Libellé;Montant\n01/08/2026;Virement fournisseur;-150000\n02/08/2026;Encaissement carte;1180',
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].dateOperation).toBe('2026-08-01');
    expect(lines[0].montant).toBe(-150000);
    expect(lines[1].libelle).toBe('Encaissement carte');
  });
});
