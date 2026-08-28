import { Injectable } from '@nestjs/common';
import { Prisma, TypeTaxeAchat } from '@prisma/client';

type DecimalInput = Prisma.Decimal | string | number;

export interface InvoiceMatchInput {
  lineId?: string;
  orderSupplierId: string;
  invoiceSupplierId: string;
  orderCurrency: string;
  invoiceCurrency: string;
  orderedQuantity: number;
  acceptedQuantity: number;
  invoicedQuantity: number;
  orderUnitPrice: DecimalInput;
  invoiceUnitPrice: DecimalInput;
  orderTaxCode: string | null;
  invoiceTaxCode: string | null;
  orderTaxRate: DecimalInput | null;
  invoiceTaxRate: DecimalInput | null;
}

export interface InvoiceDiscrepancy {
  lineId?: string;
  dimension: 'QUANTITE' | 'PRIX_UNITAIRE' | 'TAXE' | 'DEVISE' | 'FOURNISSEUR';
  attendu: string;
  constate: string;
  bloquant: true;
}

interface TaxInput {
  type: TypeTaxeAchat;
  rate: DecimalInput;
}

interface TotalsInput {
  lines: Array<{
    quantity: number;
    unitPrice: DecimalInput;
    discountAmount?: DecimalInput;
    taxes: TaxInput[];
  }>;
  globalDiscount?: DecimalInput;
  otherTaxes?: DecimalInput;
}

export interface InvoiceTotals {
  grossHt: string;
  lineDiscounts: string;
  globalDiscount: string;
  netHt: string;
  vat: string;
  duties: string;
  withholding: string;
  otherTaxes: string;
  totalTaxes: string;
  totalTtc: string;
  netPayable: string;
}

@Injectable()
export class InvoiceMatchCalculator {
  match(lines: InvoiceMatchInput[]): InvoiceDiscrepancy[] {
    return lines.flatMap((line) => {
      const result: InvoiceDiscrepancy[] = [];
      const add = (
        dimension: InvoiceDiscrepancy['dimension'],
        attendu: DecimalInput | string,
        constate: DecimalInput | string,
      ) =>
        result.push({
          lineId: line.lineId,
          dimension,
          attendu: String(attendu),
          constate: String(constate),
          bloquant: true,
        });

      if (line.invoicedQuantity !== line.acceptedQuantity) {
        add('QUANTITE', line.acceptedQuantity, line.invoicedQuantity);
      }
      if (!this.decimal(line.invoiceUnitPrice).eq(line.orderUnitPrice)) {
        add('PRIX_UNITAIRE', line.orderUnitPrice, line.invoiceUnitPrice);
      }
      if (
        line.invoiceTaxCode !== line.orderTaxCode ||
        !this.optionalDecimalEquals(line.invoiceTaxRate, line.orderTaxRate)
      ) {
        add(
          'TAXE',
          `${line.orderTaxCode ?? 'SANS_TAXE'}@${String(line.orderTaxRate ?? 0)}`,
          `${line.invoiceTaxCode ?? 'SANS_TAXE'}@${String(line.invoiceTaxRate ?? 0)}`,
        );
      }
      if (
        line.invoiceCurrency.toUpperCase() !== line.orderCurrency.toUpperCase()
      ) {
        add('DEVISE', line.orderCurrency, line.invoiceCurrency);
      }
      if (line.invoiceSupplierId !== line.orderSupplierId) {
        add('FOURNISSEUR', line.orderSupplierId, line.invoiceSupplierId);
      }
      return result;
    });
  }

  totals(input: TotalsInput): InvoiceTotals {
    const zero = this.decimal(0);
    const lineValues = input.lines.map((line) => {
      const gross = this.decimal(line.unitPrice).mul(line.quantity);
      const discount = this.decimal(line.discountAmount ?? 0);
      return { ...line, gross, discount, net: gross.minus(discount) };
    });
    const grossHt = lineValues.reduce(
      (sum, line) => sum.plus(line.gross),
      zero,
    );
    const lineDiscounts = lineValues.reduce(
      (sum, line) => sum.plus(line.discount),
      zero,
    );
    const beforeGlobal = grossHt.minus(lineDiscounts);
    const globalDiscount = this.decimal(input.globalDiscount ?? 0);
    const netHt = beforeGlobal.minus(globalDiscount);
    const ratio = beforeGlobal.isZero() ? zero : netHt.div(beforeGlobal);
    let vat = zero;
    let duties = zero;
    let withholding = zero;
    let calculatedOther = zero;
    for (const line of lineValues) {
      const base = line.net.mul(ratio);
      for (const tax of line.taxes) {
        const amount = base.mul(tax.rate).div(100);
        if (tax.type === 'TVA') vat = vat.plus(amount);
        else if (tax.type === 'DROIT_DOUANE') duties = duties.plus(amount);
        else if (tax.type === 'RETENUE') withholding = withholding.plus(amount);
        else calculatedOther = calculatedOther.plus(amount);
      }
    }
    const otherTaxes = calculatedOther.plus(input.otherTaxes ?? 0);
    const totalTaxes = vat.plus(duties).plus(otherTaxes);
    const totalTtc = netHt.plus(totalTaxes);
    const netPayable = totalTtc.minus(withholding);
    return {
      grossHt: this.money(grossHt),
      lineDiscounts: this.money(lineDiscounts),
      globalDiscount: this.money(globalDiscount),
      netHt: this.money(netHt),
      vat: this.money(vat),
      duties: this.money(duties),
      withholding: this.money(withholding),
      otherTaxes: this.money(otherTaxes),
      totalTaxes: this.money(totalTaxes),
      totalTtc: this.money(totalTtc),
      netPayable: this.money(netPayable),
    };
  }

  private decimal(value: DecimalInput): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }

  private optionalDecimalEquals(
    left: DecimalInput | null,
    right: DecimalInput | null,
  ) {
    if (left === null || right === null) return left === right;
    return this.decimal(left).eq(right);
  }

  private money(value: Prisma.Decimal) {
    return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
  }
}
