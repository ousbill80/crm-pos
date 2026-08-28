import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type PostingRole =
  | 'PURCHASE'
  | 'STOCK'
  | 'LANDED_COST'
  | 'TAX'
  | 'WITHHOLDING'
  | 'SUPPLIER'
  | 'TREASURY'
  | 'ADVANCE'
  | 'FX_GAIN'
  | 'FX_LOSS'
  | 'CUSTOMER'
  | 'SALE'
  | 'OUTPUT_TAX'
  | 'EXPENSE'
  | 'DEPRECIATION';

export interface CalculatedPostingLine {
  role: PostingRole;
  debit: Prisma.Decimal | number | string;
  credit: Prisma.Decimal | number | string;
  compteId?: string;
}

@Injectable()
export class P2pAccountingCalculator {
  supplierInvoice(input: {
    netHt: Prisma.Decimal | number | string;
    tax: Prisma.Decimal | number | string;
    withholding: Prisma.Decimal | number | string;
    payable: Prisma.Decimal | number | string;
  }): CalculatedPostingLine[] {
    const lines: CalculatedPostingLine[] = [
      { role: 'PURCHASE', debit: input.netHt, credit: 0 },
      { role: 'TAX', debit: input.tax, credit: 0 },
      { role: 'WITHHOLDING', debit: 0, credit: input.withholding },
      { role: 'SUPPLIER', debit: 0, credit: input.payable },
    ];
    this.assertBalanced(lines);
    return lines.filter(
      (line) =>
        !new Prisma.Decimal(line.debit).isZero() ||
        !new Prisma.Decimal(line.credit).isZero(),
    );
  }

  creditNote(lines: CalculatedPostingLine[]): CalculatedPostingLine[] {
    const reversed = lines.map((line) => ({
      role: line.role,
      debit: line.credit,
      credit: line.debit,
      compteId: line.compteId,
    }));
    this.assertBalanced(reversed);
    return reversed;
  }

  /**
   * Ticket POS / encaissement : le montant collecté est le TTC.
   * La TVA est extraite au taux de chaque ligne (produit, sinon défaut shop).
   * On n’ajoute pas la TVA par-dessus le ticket, sinon le 411 divergerait de la caisse.
   */
  saleFromCollectedTtc(
    lines: Array<{ ttc: Prisma.Decimal | number | string; tauxTva: number }>,
  ): CalculatedPostingLine[] {
    let ht = new Prisma.Decimal(0);
    let tva = new Prisma.Decimal(0);
    let ttc = new Prisma.Decimal(0);
    for (const line of lines) {
      const split = this.splitTtc(line.ttc, line.tauxTva);
      ht = ht.plus(split.ht);
      tva = tva.plus(split.tva);
      ttc = ttc.plus(split.ttc);
    }
    const posting: CalculatedPostingLine[] = [
      { role: 'CUSTOMER', debit: ttc, credit: 0 },
      { role: 'SALE', debit: 0, credit: ht },
      { role: 'OUTPUT_TAX', debit: 0, credit: tva },
    ];
    this.assertBalanced(posting);
    return posting.filter(
      (line) =>
        !new Prisma.Decimal(line.debit).isZero() ||
        !new Prisma.Decimal(line.credit).isZero(),
    );
  }

  saleFromHtTva(input: {
    ht: Prisma.Decimal | number | string;
    tva: Prisma.Decimal | number | string;
    ttc: Prisma.Decimal | number | string;
  }): CalculatedPostingLine[] {
    const posting: CalculatedPostingLine[] = [
      { role: 'CUSTOMER', debit: input.ttc, credit: 0 },
      { role: 'SALE', debit: 0, credit: input.ht },
      { role: 'OUTPUT_TAX', debit: 0, credit: input.tva },
    ];
    this.assertBalanced(posting);
    return posting.filter(
      (line) =>
        !new Prisma.Decimal(line.debit).isZero() ||
        !new Prisma.Decimal(line.credit).isZero(),
    );
  }

  /**
   * Mise en stock (inventaire permanent) : D 31 / C 408 à la valeur rendue.
   * La facture marchandises débitera ensuite le 408 (plus le 601).
   */
  stockReceipt(
    value: Prisma.Decimal | number | string,
  ): CalculatedPostingLine[] {
    const amount = new Prisma.Decimal(value).toDecimalPlaces(2);
    if (amount.lte(0)) return [];
    const lines: CalculatedPostingLine[] = [
      { role: 'STOCK', debit: amount, credit: 0 },
      { role: 'SUPPLIER', debit: 0, credit: amount },
    ];
    this.assertBalanced(lines);
    return lines;
  }

  /**
   * Coût des marchandises vendues / sortie de stock :
   * D 603 Variation des stocks / C 31.
   */
  cogs(amount: Prisma.Decimal | number | string): CalculatedPostingLine[] {
    const value = new Prisma.Decimal(amount).toDecimalPlaces(2);
    if (value.lte(0)) return [];
    const lines: CalculatedPostingLine[] = [
      { role: 'EXPENSE', debit: value, credit: 0 },
      { role: 'STOCK', debit: 0, credit: value },
    ];
    this.assertBalanced(lines);
    return lines;
  }

  /** Dotation d’amortissement : D 6813 / C 28. */
  depreciation(
    amount: Prisma.Decimal | number | string,
  ): CalculatedPostingLine[] {
    const value = new Prisma.Decimal(amount).toDecimalPlaces(2);
    if (value.lte(0)) return [];
    const lines: CalculatedPostingLine[] = [
      { role: 'EXPENSE', debit: value, credit: 0 },
      { role: 'DEPRECIATION', debit: 0, credit: value },
    ];
    this.assertBalanced(lines);
    return lines;
  }

  /**
   * Écart d’inventaire valorisé au CMP, netté sur le 31 unique.
   * Surplus (net > 0) : D 31 / C 603. Manquant (net < 0) : D 603 / C 31.
   */
  inventoryVariance(
    netValue: Prisma.Decimal | number | string,
  ): CalculatedPostingLine[] {
    const net = new Prisma.Decimal(netValue).toDecimalPlaces(2);
    if (net.isZero()) return [];
    return net.gt(0) ? this.creditNote(this.cogs(net)) : this.cogs(net.abs());
  }

  /** Encaissement client : Dr trésorerie (571/521/572) / Cr 411. */
  customerCollection(
    ttc: Prisma.Decimal | number | string,
  ): CalculatedPostingLine[] {
    const amount = new Prisma.Decimal(ttc);
    const posting: CalculatedPostingLine[] = [
      { role: 'TREASURY', debit: amount, credit: 0 },
      { role: 'CUSTOMER', debit: 0, credit: amount },
    ];
    this.assertBalanced(posting);
    return posting;
  }

  chargeInvoice(input: {
    charges: Array<{
      compteId: string;
      ht: Prisma.Decimal | number | string;
    }>;
    tax: Prisma.Decimal | number | string;
    withholding: Prisma.Decimal | number | string;
    payable: Prisma.Decimal | number | string;
  }): CalculatedPostingLine[] {
    const lines: CalculatedPostingLine[] = [
      ...input.charges.map((charge) => ({
        role: 'EXPENSE' as const,
        debit: charge.ht,
        credit: 0,
        compteId: charge.compteId,
      })),
      { role: 'TAX', debit: input.tax, credit: 0 },
      { role: 'WITHHOLDING', debit: 0, credit: input.withholding },
      { role: 'SUPPLIER', debit: 0, credit: input.payable },
    ];
    this.assertBalanced(lines);
    return lines.filter(
      (line) =>
        !new Prisma.Decimal(line.debit).isZero() ||
        !new Prisma.Decimal(line.credit).isZero(),
    );
  }

  splitTtc(ttcInput: Prisma.Decimal | number | string, tauxTva: number) {
    const ttc = new Prisma.Decimal(ttcInput).toDecimalPlaces(2);
    if (ttc.lte(0)) {
      throw new BadRequestException(
        'Un montant de vente doit être strictement positif.',
      );
    }
    if (!Number.isFinite(tauxTva) || tauxTva < 0) {
      throw new BadRequestException('Taux de TVA vente invalide.');
    }
    if (tauxTva === 0) {
      return { ht: ttc, tva: new Prisma.Decimal(0), ttc };
    }
    const ht = ttc
      .div(new Prisma.Decimal(1).plus(tauxTva / 100))
      .toDecimalPlaces(2);
    return { ht, tva: ttc.minus(ht), ttc };
  }

  paymentFx(input: {
    foreignAmount: Prisma.Decimal | number | string;
    invoiceRate: Prisma.Decimal | number | string;
    paymentRate: Prisma.Decimal | number | string;
  }) {
    const foreign = new Prisma.Decimal(input.foreignAmount);
    const invoiceBase = foreign.mul(input.invoiceRate).toDecimalPlaces(2);
    const basePayment = foreign.mul(input.paymentRate).toDecimalPlaces(2);
    const difference = basePayment.minus(invoiceBase);
    return {
      basePayment: basePayment.toFixed(2),
      gain: Prisma.Decimal.max(difference.negated(), 0).toFixed(2),
      loss: Prisma.Decimal.max(difference, 0).toFixed(2),
    };
  }

  assertAllocations(
    paymentAmount: Prisma.Decimal | number | string,
    allocations: Array<{
      amount: Prisma.Decimal | number | string;
      outstanding: Prisma.Decimal | number | string;
    }>,
  ): void {
    const payment = new Prisma.Decimal(paymentAmount);
    const allocated = allocations.reduce((sum, item) => {
      const amount = new Prisma.Decimal(item.amount);
      if (amount.lte(0)) {
        throw new BadRequestException(
          'Une allocation doit être strictement positive.',
        );
      }
      if (amount.gt(item.outstanding)) {
        throw new BadRequestException(
          'Une allocation dépasse le solde de la facture.',
        );
      }
      return sum.plus(amount);
    }, new Prisma.Decimal(0));
    if (!allocated.eq(payment)) {
      throw new BadRequestException(
        'La somme des allocations doit égaler le montant du paiement.',
      );
    }
  }

  totals(lines: CalculatedPostingLine[]) {
    const debit = lines.reduce(
      (sum, line) => sum.plus(line.debit),
      new Prisma.Decimal(0),
    );
    const credit = lines.reduce(
      (sum, line) => sum.plus(line.credit),
      new Prisma.Decimal(0),
    );
    return { debit: debit.toFixed(2), credit: credit.toFixed(2) };
  }

  assertBalanced(lines: CalculatedPostingLine[]): void {
    if (lines.length < 2) {
      throw new BadRequestException(
        'Une écriture comptable doit contenir au moins deux lignes.',
      );
    }
    for (const line of lines) {
      const debit = new Prisma.Decimal(line.debit);
      const credit = new Prisma.Decimal(line.credit);
      if (
        debit.isNegative() ||
        credit.isNegative() ||
        (debit.gt(0) && credit.gt(0))
      ) {
        throw new BadRequestException('Ligne comptable débit/crédit invalide.');
      }
    }
    const totals = this.totals(lines);
    if (totals.debit !== totals.credit || totals.debit === '0.00') {
      throw new BadRequestException(
        `Écriture déséquilibrée : débit ${totals.debit}, crédit ${totals.credit}.`,
      );
    }
  }
}
