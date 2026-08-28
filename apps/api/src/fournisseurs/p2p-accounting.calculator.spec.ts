import { P2pAccountingCalculator } from './p2p-accounting.calculator';

describe('P2pAccountingCalculator', () => {
  const calculator = new P2pAccountingCalculator();

  it.each([
    [1000, 180, 0, 1180],
    [1000, 180, 50, 1130],
    [999.99, 0, 0, 999.99],
  ])(
    'produces a balanced supplier invoice posting',
    (netHt, tax, withholding, payable) => {
      const lines = calculator.supplierInvoice({
        netHt,
        tax,
        withholding,
        payable,
      });
      expect(calculator.totals(lines)).toEqual({
        debit: (netHt + tax).toFixed(2),
        credit: (payable + withholding).toFixed(2),
      });
      expect(() => calculator.assertBalanced(lines)).not.toThrow();
    },
  );

  it('posts a customer collection as treasury debit and 411 credit', () => {
    const lines = calculator.customerCollection(1180);
    expect(calculator.totals(lines)).toEqual({
      debit: '1180.00',
      credit: '1180.00',
    });
    expect(
      lines.find((line) => line.role === 'TREASURY')?.debit.toString(),
    ).toBe('1180');
    expect(
      lines.find((line) => line.role === 'CUSTOMER')?.credit.toString(),
    ).toBe('1180');
    const refund = calculator.creditNote(lines);
    expect(
      refund.find((line) => line.role === 'TREASURY')?.credit.toString(),
    ).toBe('1180');
  });

  it('extracts VAT from a collected TTC ticket without changing cash', () => {
    const lines = calculator.saleFromCollectedTtc([{ ttc: 1180, tauxTva: 18 }]);
    expect(calculator.totals(lines)).toEqual({
      debit: '1180.00',
      credit: '1180.00',
    });
    const customer = lines.find((line) => line.role === 'CUSTOMER');
    const sale = lines.find((line) => line.role === 'SALE');
    const tax = lines.find((line) => line.role === 'OUTPUT_TAX');
    expect(customer?.debit.toString()).toBe('1180');
    expect(sale?.credit.toString()).toBe('1000');
    expect(tax?.credit.toString()).toBe('180');
  });

  it('posts a stock putaway as D 31 / C 408 and CMV as D 603 / C 31', () => {
    const receipt = calculator.stockReceipt(860);
    expect(calculator.totals(receipt)).toEqual({
      debit: '860.00',
      credit: '860.00',
    });
    expect(
      receipt.find((line) => line.role === 'STOCK')?.debit.toString(),
    ).toBe('860');
    expect(
      receipt.find((line) => line.role === 'SUPPLIER')?.credit.toString(),
    ).toBe('860');
    const sold = calculator.cogs(400);
    expect(sold.find((line) => line.role === 'EXPENSE')?.debit.toString()).toBe(
      '400',
    );
    expect(sold.find((line) => line.role === 'STOCK')?.credit.toString()).toBe(
      '400',
    );
    const reverse = calculator.creditNote(receipt);
    expect(
      reverse.find((line) => line.role === 'STOCK')?.credit.toString(),
    ).toBe('860');
  });

  it('nets an inventory surplus as D 31 / C 603 and a shortage as CMV', () => {
    const surplus = calculator.inventoryVariance(150);
    expect(
      surplus.find((line) => line.role === 'STOCK')?.debit.toString(),
    ).toBe('150');
    const shortage = calculator.inventoryVariance(-80);
    expect(
      shortage.find((line) => line.role === 'EXPENSE')?.debit.toString(),
    ).toBe('80');
    expect(calculator.inventoryVariance(0)).toEqual([]);
    expect(calculator.stockReceipt(0)).toEqual([]);
  });

  it('posts a charge invoice to 6xx without a stock line', () => {
    const lines = calculator.chargeInvoice({
      charges: [{ compteId: 'acc-613', ht: 1000 }],
      tax: 180,
      withholding: 0,
      payable: 1180,
    });
    expect(lines.find((line) => line.role === 'EXPENSE')?.compteId).toBe(
      'acc-613',
    );
    expect(calculator.totals(lines)).toEqual({
      debit: '1180.00',
      credit: '1180.00',
    });
  });

  it('rejects an unbalanced posting', () => {
    expect(() =>
      calculator.assertBalanced([
        { role: 'PURCHASE', debit: 100, credit: 0 },
        { role: 'SUPPLIER', debit: 0, credit: 99 },
      ]),
    ).toThrow('déséquilibrée');
  });

  it('calculates payment FX gain and loss without floating point drift', () => {
    expect(
      calculator.paymentFx({
        foreignAmount: 100,
        invoiceRate: 600,
        paymentRate: 610,
      }),
    ).toEqual({ basePayment: '61000.00', gain: '0.00', loss: '1000.00' });
    expect(
      calculator.paymentFx({
        foreignAmount: 100,
        invoiceRate: 610,
        paymentRate: 600,
      }),
    ).toEqual({ basePayment: '60000.00', gain: '1000.00', loss: '0.00' });
  });

  it('splits a POS TTC ticket into HT + TVA + client without inflating cash', () => {
    const lines = calculator.saleFromCollectedTtc([
      { ttc: 1180, tauxTva: 18 },
      { ttc: 1000, tauxTva: 0 },
    ]);
    expect(calculator.totals(lines)).toEqual({
      debit: '2180.00',
      credit: '2180.00',
    });
    const client = lines.find((line) => line.role === 'CUSTOMER');
    expect(Number(client?.debit)).toBe(2180);
  });

  it('posts a charge invoice to 6xx + tax + supplier', () => {
    const lines = calculator.chargeInvoice({
      charges: [
        { compteId: '605', ht: 80 },
        { compteId: '613', ht: 20 },
      ],
      tax: 18,
      withholding: 0,
      payable: 118,
    });
    expect(calculator.totals(lines)).toEqual({
      debit: '118.00',
      credit: '118.00',
    });
    expect(lines.filter((line) => line.role === 'EXPENSE')).toHaveLength(2);
  });

  it('posts depreciation as 6813 debit and 28 credit', () => {
    const lines = calculator.depreciation(333.33);
    expect(calculator.totals(lines)).toEqual({
      debit: '333.33',
      credit: '333.33',
    });
    expect(
      lines.find((line) => line.role === 'EXPENSE')?.debit.toString(),
    ).toBe('333.33');
    expect(
      lines.find((line) => line.role === 'DEPRECIATION')?.credit.toString(),
    ).toBe('333.33');
  });

  it('prevents allocation overpayment', () => {
    expect(() =>
      calculator.assertAllocations(100, [
        { amount: 60, outstanding: 60 },
        { amount: 41, outstanding: 50 },
      ]),
    ).toThrow('montant du paiement');
    expect(() =>
      calculator.assertAllocations(100, [{ amount: 51, outstanding: 50 }]),
    ).toThrow('solde de la facture');
  });
});
