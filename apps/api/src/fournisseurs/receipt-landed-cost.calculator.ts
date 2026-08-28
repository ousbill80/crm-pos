import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MethodeAllocationCout } from '@caisse-crm/shared';

interface AcceptedLine {
  lineId: string;
  acceptedQuantity: number;
  goodsValue: Prisma.Decimal.Value;
}

@Injectable()
export class ReceiptLandedCostCalculator {
  allocate(
    method: MethodeAllocationCout,
    totalValue: Prisma.Decimal.Value,
    lines: AcceptedLine[],
    manual?: { lineId: string; amount: Prisma.Decimal.Value }[],
  ): { lineId: string; amount: string }[] {
    const total = new Prisma.Decimal(totalValue);
    if (total.isNegative()) {
      throw new BadRequestException('Le coût réel ne peut pas être négatif.');
    }
    if (!lines.length || lines.some((line) => line.acceptedQuantity <= 0)) {
      throw new BadRequestException(
        'Une allocation exige des lignes acceptées strictement positives.',
      );
    }
    if (method === 'MANUELLE') {
      if (
        !manual ||
        manual.length !== lines.length ||
        new Set(manual.map((item) => item.lineId)).size !== lines.length ||
        manual.some(
          (item) => !lines.some((line) => line.lineId === item.lineId),
        )
      ) {
        throw new BadRequestException(
          'L’allocation manuelle doit couvrir chaque ligne acceptée une fois.',
        );
      }
      const sum = manual.reduce(
        (value, item) => value.plus(item.amount),
        new Prisma.Decimal(0),
      );
      if (!sum.equals(total)) {
        throw new BadRequestException(
          'La somme des allocations manuelles doit égaler le coût réel.',
        );
      }
      return manual.map((item) => ({
        lineId: item.lineId,
        amount: new Prisma.Decimal(item.amount).toFixed(2),
      }));
    }

    const weights = lines.map((line) =>
      method === 'VALEUR'
        ? new Prisma.Decimal(line.goodsValue)
        : new Prisma.Decimal(line.acceptedQuantity),
    );
    const weightTotal = weights.reduce(
      (sum, value) => sum.plus(value),
      new Prisma.Decimal(0),
    );
    if (!weightTotal.isPositive()) {
      throw new BadRequestException(
        'La base d’allocation doit être strictement positive.',
      );
    }

    let allocated = new Prisma.Decimal(0);
    return lines.map((line, index) => {
      const amount =
        index === lines.length - 1
          ? total.minus(allocated)
          : total.mul(weights[index]).div(weightTotal).toDecimalPlaces(2);
      allocated = allocated.plus(amount);
      return { lineId: line.lineId, amount: amount.toFixed(2) };
    });
  }

  weightedAverage(input: {
    stockBefore: number;
    cmpBefore: Prisma.Decimal.Value;
    acceptedQuantity: number;
    acceptedValue: Prisma.Decimal.Value;
  }): string {
    const stockAfter = input.stockBefore + input.acceptedQuantity;
    if (stockAfter <= 0) return '0.00';
    return new Prisma.Decimal(input.cmpBefore)
      .mul(input.stockBefore)
      .plus(input.acceptedValue)
      .div(stockAfter)
      .toFixed(2);
  }
}
