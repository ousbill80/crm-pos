import {
  ACCOUNTING_AI_SOURCE_TYPES,
  suggestionTrace,
} from './accounting-ai.types';

describe('Accounting AI coverage and traceability', () => {
  it('covers every financial source family', () => {
    expect(ACCOUNTING_AI_SOURCE_TYPES).toEqual(
      expect.arrayContaining([
        'SUPPLIER_INVOICE',
        'SUPPLIER_CREDIT',
        'SUPPLIER_PAYMENT',
        'CUSTOMER_INVOICE',
        'POS_SALE',
        'POS_RETURN',
        'POS_DISCOUNT',
        'CASH_REMITTANCE',
        'BANK_MOVEMENT',
        'STOCK_MOVEMENT',
        'LANDED_COST',
        'CUSTOMS',
        'TAX',
      ]),
    );
  });

  it('records immutable model and prompt hashes on suggestions', () => {
    const trace = suggestionTrace('provider-model-v2', 'strict-prompt-v3');
    expect(trace.modelVersion).toBe('provider-model-v2');
    expect(trace.modelHash).toMatch(/^[a-f0-9]{64}$/);
    expect(trace.promptHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
