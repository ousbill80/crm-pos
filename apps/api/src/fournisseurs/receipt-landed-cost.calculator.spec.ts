import { BadRequestException } from '@nestjs/common';
import { ReceiptLandedCostCalculator } from './receipt-landed-cost.calculator';

describe('ReceiptLandedCostCalculator', () => {
  const calculator = new ReceiptLandedCostCalculator();
  const lines = [
    { lineId: 'a', acceptedQuantity: 10, goodsValue: '1000' },
    { lineId: 'b', acceptedQuantity: 30, goodsValue: '9000' },
  ];

  it('alloue par valeur avec conservation exacte du total', () => {
    expect(calculator.allocate('VALEUR', '1000', lines)).toEqual([
      { lineId: 'a', amount: '100.00' },
      { lineId: 'b', amount: '900.00' },
    ]);
  });

  it('alloue par quantité avec conservation exacte du total', () => {
    expect(calculator.allocate('QUANTITE', '1000', lines)).toEqual([
      { lineId: 'a', amount: '250.00' },
      { lineId: 'b', amount: '750.00' },
    ]);
  });

  it('valide une allocation manuelle exhaustive', () => {
    expect(
      calculator.allocate('MANUELLE', '1000', lines, [
        { lineId: 'a', amount: '333.33' },
        { lineId: 'b', amount: '666.67' },
      ]),
    ).toEqual([
      { lineId: 'a', amount: '333.33' },
      { lineId: 'b', amount: '666.67' },
    ]);
    expect(() =>
      calculator.allocate('MANUELLE', '1000', lines, [
        { lineId: 'a', amount: '999.99' },
      ]),
    ).toThrow(BadRequestException);
  });

  it('calcule le CMP atomique sur le stock antérieur', () => {
    expect(
      calculator.weightedAverage({
        stockBefore: 20,
        cmpBefore: '500',
        acceptedQuantity: 10,
        acceptedValue: '9000',
      }),
    ).toBe('633.33');
  });
});
