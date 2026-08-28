import { InvoiceMatchCalculator } from './invoice-match.calculator';

describe('InvoiceMatchCalculator', () => {
  const calculator = new InvoiceMatchCalculator();
  const compliant = {
    orderSupplierId: 'supplier-a',
    invoiceSupplierId: 'supplier-a',
    orderCurrency: 'XOF',
    invoiceCurrency: 'XOF',
    orderedQuantity: 10,
    acceptedQuantity: 8,
    invoicedQuantity: 8,
    orderUnitPrice: '1000',
    invoiceUnitPrice: '1000',
    orderTaxCode: 'TVA18',
    invoiceTaxCode: 'TVA18',
    orderTaxRate: '18',
    invoiceTaxRate: '18',
  };

  it.each([
    ['QUANTITE', { invoicedQuantity: 9 }],
    ['PRIX_UNITAIRE', { invoiceUnitPrice: '1001' }],
    ['TAXE', { invoiceTaxCode: 'TVA0' }],
    ['TAXE', { invoiceTaxRate: '0' }],
    ['DEVISE', { invoiceCurrency: 'EUR' }],
    ['FOURNISSEUR', { invoiceSupplierId: 'supplier-b' }],
  ])('crée un litige bloquant pour un écart %s', (dimension, override) => {
    expect(calculator.match([{ ...compliant, ...override }])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension, bloquant: true }),
      ]),
    );
  });

  it('interdit de facturer une quantité rejetée', () => {
    const result = calculator.match([
      { ...compliant, acceptedQuantity: 6, invoicedQuantity: 8 },
    ]);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: 'QUANTITE',
          attendu: '6',
          constate: '8',
          bloquant: true,
        }),
      ]),
    );
  });

  it('accepte une ligne strictement conforme', () => {
    expect(calculator.match([compliant])).toEqual([]);
  });

  it('calcule HT, remises, taxes, retenues et TTC sans flottants JS', () => {
    expect(
      calculator.totals({
        lines: [
          {
            quantity: 2,
            unitPrice: '1000',
            discountAmount: '100',
            taxes: [
              { type: 'TVA', rate: '18' },
              { type: 'DROIT_DOUANE', rate: '5' },
              { type: 'RETENUE', rate: '2' },
            ],
          },
        ],
        globalDiscount: '100',
        otherTaxes: '25',
      }),
    ).toEqual({
      grossHt: '2000.00',
      lineDiscounts: '100.00',
      globalDiscount: '100.00',
      netHt: '1800.00',
      vat: '324.00',
      duties: '90.00',
      withholding: '36.00',
      otherTaxes: '25.00',
      totalTaxes: '439.00',
      totalTtc: '2239.00',
      netPayable: '2203.00',
    });
  });
});
