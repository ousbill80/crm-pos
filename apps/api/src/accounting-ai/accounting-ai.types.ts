import { createHash } from 'node:crypto';

export const ACCOUNTING_AI_SOURCE_TYPES = [
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
] as const;

export type AccountingAiSource = (typeof ACCOUNTING_AI_SOURCE_TYPES)[number];
export type AccountingAiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ComplianceInput {
  debitTotal: number;
  creditTotal: number;
  periodOpen: boolean;
  accountMappingValid: boolean;
  taxMappingValid: boolean;
  sourceTraceable: boolean;
  sequenceValid: boolean;
  duplicate: boolean;
  treasuryReconciled: boolean;
  stockReconciled: boolean;
  salesReconciled: boolean;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function suggestionTrace(modelVersion: string, promptVersion: string) {
  return {
    modelVersion,
    modelHash: sha256(modelVersion),
    promptHash: sha256(promptVersion),
  };
}
