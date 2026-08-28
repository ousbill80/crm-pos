import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface LandedCostLine {
  type: string;
  amount: Prisma.Decimal.Value;
  currency: string;
  exchangeRate: Prisma.Decimal.Value;
  label?: string;
}

export interface LandedCostInput {
  goodsAmount: Prisma.Decimal.Value;
  exchangeRate: Prisma.Decimal.Value;
  costs: LandedCostLine[];
}

export interface LandedCostScenario extends LandedCostInput {
  name: string;
  transitDays?: number;
}

@Injectable()
export class LandedCostCalculator {
  calculate(input: LandedCostInput) {
    const goods = this.positive(input.goodsAmount, 'Montant marchandises');
    const goodsRate = this.positive(input.exchangeRate, 'Taux de change');
    const goodsBase = goods.mul(goodsRate);
    const breakdown = [
      {
        type: 'GOODS',
        label: 'Marchandises',
        currency: null,
        amountOriginal: goods.toFixed(2),
        exchangeRate: goodsRate.toFixed(6),
        formula: `${goods.toFixed(2)} × ${goodsRate.toFixed(6)}`,
        amountBase: goodsBase.toFixed(2),
      },
      ...input.costs.map((cost) => {
        const amount = this.nonNegative(cost.amount, cost.label ?? cost.type);
        const rate = this.positive(cost.exchangeRate, `Taux ${cost.type}`);
        return {
          type: cost.type,
          label: cost.label ?? cost.type,
          currency: cost.currency,
          amountOriginal: amount.toFixed(2),
          exchangeRate: rate.toFixed(6),
          formula: `${amount.toFixed(2)} ${cost.currency} × ${rate.toFixed(6)}`,
          amountBase: amount.mul(rate).toFixed(2),
        };
      }),
    ];
    const total = breakdown.reduce(
      (sum, line) => sum.add(line.amountBase),
      new Prisma.Decimal(0),
    );
    return {
      baseCurrencyFormula:
        'montant marchandises × taux snapshot + somme(coût × taux snapshot du coût)',
      goodsBase: goodsBase.toFixed(2),
      totalLandedCost: total.toFixed(2),
      breakdown,
    };
  }

  compare(scenarios: LandedCostScenario[]) {
    return scenarios.map((scenario) => ({
      name: scenario.name,
      transitDays: scenario.transitDays ?? null,
      assumptions: {
        goodsAmount: new Prisma.Decimal(scenario.goodsAmount).toFixed(2),
        exchangeRate: new Prisma.Decimal(scenario.exchangeRate).toFixed(6),
        costLines: scenario.costs.length,
      },
      ...this.calculate(scenario),
    }));
  }

  private positive(value: Prisma.Decimal.Value, label: string) {
    const result = new Prisma.Decimal(value);
    if (!result.isPositive()) {
      throw new BadRequestException(`${label} doit être strictement positif.`);
    }
    return result;
  }

  private nonNegative(value: Prisma.Decimal.Value, label: string) {
    const result = new Prisma.Decimal(value);
    if (result.isNegative()) {
      throw new BadRequestException(`${label} ne peut pas être négatif.`);
    }
    return result;
  }
}
