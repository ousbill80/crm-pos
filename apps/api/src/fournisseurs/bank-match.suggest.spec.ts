import {
  absMoney,
  bankMatchKey,
  suggestBankMatches,
} from './bank-match.suggest';

describe('bank match suggestions', () => {
  it('normalizes absolute amounts', () => {
    expect(absMoney(-1500)).toBe('1500.00');
    expect(absMoney('1500.5')).toBe('1500.50');
    expect(bankMatchKey(-1500, 'xof')).toBe('XOF|1500.00');
  });

  it('pairs a unique amount/devise and prefers the closest date', () => {
    const suggestions = suggestBankMatches(
      [
        {
          id: 'L1',
          montant: '-1180',
          devise: 'XOF',
          dateOperation: '2026-08-12',
        },
        {
          id: 'L2',
          montant: '5000',
          devise: 'XOF',
          dateOperation: '2026-08-13',
        },
      ],
      [
        {
          id: 'M-far',
          montant: '1180',
          devise: 'XOF',
          dateValeur: '2026-08-01',
        },
        {
          id: 'M-near',
          montant: '1180.00',
          devise: 'XOF',
          dateValeur: '2026-08-12',
        },
        {
          id: 'M-other',
          montant: '5000',
          devise: 'XOF',
          dateValeur: '2026-08-13',
        },
      ],
    );
    expect(suggestions.L1).toBe('M-near');
    expect(suggestions.L2).toBe('M-other');
  });

  it('does not reuse a movement for a second line', () => {
    const suggestions = suggestBankMatches(
      [
        {
          id: 'A',
          montant: '100',
          devise: 'XOF',
          dateOperation: '2026-08-01',
        },
        {
          id: 'B',
          montant: '100',
          devise: 'XOF',
          dateOperation: '2026-08-02',
        },
      ],
      [
        {
          id: 'ONLY',
          montant: 100,
          devise: 'XOF',
          dateValeur: '2026-08-01',
        },
      ],
    );
    expect(suggestions.A).toBe('ONLY');
    expect(suggestions.B).toBeUndefined();
  });
});
