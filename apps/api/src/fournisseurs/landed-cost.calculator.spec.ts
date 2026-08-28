import { LandedCostCalculator } from './landed-cost.calculator';

describe('LandedCostCalculator', () => {
  const calculator = new LandedCostCalculator();

  it('convertit le prix fournisseur au taux snapshot et explique chaque coût', () => {
    const result = calculator.calculate({
      goodsAmount: 1_000,
      exchangeRate: 600,
      costs: [
        { type: 'FREIGHT', amount: 50, currency: 'USD', exchangeRate: 600 },
        { type: 'INSURANCE', amount: 10_000, currency: 'XOF', exchangeRate: 1 },
        { type: 'DUTY', amount: 40_000, currency: 'XOF', exchangeRate: 1 },
        { type: 'TAX', amount: 20_000, currency: 'XOF', exchangeRate: 1 },
        { type: 'DEMURRAGE', amount: 5_000, currency: 'XOF', exchangeRate: 1 },
      ],
    });

    expect(result.goodsBase).toBe('600000.00');
    expect(result.totalLandedCost).toBe('705000.00');
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'FREIGHT',
          formula: '50.00 USD × 600.000000',
          amountBase: '30000.00',
        }),
      ]),
    );
  });

  it('compare mer et air sans masquer les hypothèses', () => {
    const result = calculator.compare([
      {
        name: 'MER',
        goodsAmount: 1_000,
        exchangeRate: 600,
        costs: [
          { type: 'FREIGHT', amount: 100, currency: 'USD', exchangeRate: 600 },
        ],
        transitDays: 35,
      },
      {
        name: 'AIR',
        goodsAmount: 1_000,
        exchangeRate: 600,
        costs: [
          { type: 'FREIGHT', amount: 250, currency: 'USD', exchangeRate: 600 },
        ],
        transitDays: 5,
      },
    ]);

    expect(result[0]).toMatchObject({
      name: 'MER',
      totalLandedCost: '660000.00',
      transitDays: 35,
    });
    expect(result[1]).toMatchObject({
      name: 'AIR',
      totalLandedCost: '750000.00',
      transitDays: 5,
    });
  });
});
