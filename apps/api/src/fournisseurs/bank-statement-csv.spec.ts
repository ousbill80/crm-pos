import {
  parseBankStatementCsv,
  parseDateOperation,
  parseMontantCsv,
} from './bank-statement-csv';

describe('parseBankStatementCsv', () => {
  it('parses a header-less semicolon file', () => {
    const lines = parseBankStatementCsv(
      '2026-08-01;Virement fournisseur;-150000\n2026-08-02;Encaissement carte;1180',
    );
    expect(lines).toEqual([
      {
        numeroLigne: 1,
        dateOperation: '2026-08-01',
        libelle: 'Virement fournisseur',
        montant: -150000,
        devise: 'XOF',
      },
      {
        numeroLigne: 2,
        dateOperation: '2026-08-02',
        libelle: 'Encaissement carte',
        montant: 1180,
        devise: 'XOF',
      },
    ]);
  });

  it('maps French debit/credit headers and DD/MM/YYYY dates', () => {
    const csv = [
      'Date;Libellé;Débit;Crédit;Référence',
      '12/08/2026;Frais Wave;1 500,00;;WV-1',
      '13/08/2026;Règlement client;;25 000,50;PX-9',
    ].join('\n');
    const lines = parseBankStatementCsv(csv);
    expect(lines[0]).toMatchObject({
      dateOperation: '2026-08-12',
      libelle: 'Frais Wave',
      montant: -1500,
      reference: 'WV-1',
    });
    expect(lines[1].montant).toBe(25000.5);
    expect(lines[1].dateOperation).toBe('2026-08-13');
  });

  it('rejects an empty file and a zero amount', () => {
    expect(() => parseBankStatementCsv('   ')).toThrow('vide');
    expect(() => parseBankStatementCsv('2026-08-01;Rien;0')).toThrow('nul');
  });

  it('parses French and ISO amounts', () => {
    expect(parseMontantCsv('1 180,50')).toBe(1180.5);
    expect(parseMontantCsv('1,180.50')).toBe(1180.5);
    expect(parseDateOperation('5/8/2026')).toBe('2026-08-05');
  });
});
