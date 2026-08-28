import { describe, expect, it } from 'vitest';
import { buildQualityLine, buildReceiptLine, parseSerials, sumAmounts } from './payloads';

describe('payloads terrain P2P', () => {
  it('normalise lots, séries et réception quantitative', () => {
    const serials = parseSerials(' S-1, S-2\nS-1 ');
    expect(serials).toEqual(['S-1', 'S-2']);
    expect(buildReceiptLine({
      ligneCommandeId: 'line',
      quantiteRecue: 2,
      numeroLot: ' LOT-24 ',
      numerosSerie: serials,
    })).toEqual({
      ligneCommandeId: 'line',
      quantiteRecue: 2,
      numeroLot: 'LOT-24',
      numerosSerie: ['S-1', 'S-2'],
    });
  });

  it('refuse une incohérence entre quantité et séries', () => {
    expect(() => buildReceiptLine({
      ligneCommandeId: 'line',
      quantiteRecue: 2,
      numerosSerie: ['S-1'],
    })).toThrow(/numéros de série/);
  });

  it('calcule le rejet qualité sans quantité négative', () => {
    expect(buildQualityLine({
      ligneReceptionId: 'receipt-line',
      quantiteRecue: 10,
      quantiteAcceptee: 7,
      motifRejet: 'Emballages endommagés',
    })).toEqual({
      ligneReceptionId: 'receipt-line',
      quantiteAcceptee: 7,
      quantiteRejetee: 3,
      motifRejet: 'Emballages endommagés',
    });
    expect(() => buildQualityLine({
      ligneReceptionId: 'receipt-line',
      quantiteRecue: 10,
      quantiteAcceptee: 7,
    })).toThrow(/motif/);
  });

  it('additionne les montants et rejette les valeurs invalides', () => {
    expect(sumAmounts(['1000', 250, '50'])).toBe(1300);
    expect(() => sumAmounts(['NaN'])).toThrow(/Montant/);
  });
});
