import { Injectable } from '@nestjs/common';
import { ComplianceInput } from './accounting-ai.types';

const RULES: Array<[keyof ComplianceInput, string, boolean]> = [
  ['periodOpen', 'SYSCOHADA.PERIOD_OPEN', true],
  ['accountMappingValid', 'SYSCOHADA.ACCOUNT_MAPPING_VERSIONED', true],
  ['taxMappingValid', 'CI.TAX_MAPPING_VERSIONED', true],
  ['sourceTraceable', 'SYSCOHADA.SOURCE_TRACEABILITY', true],
  ['sequenceValid', 'SYSCOHADA.DOCUMENT_SEQUENCE', true],
  ['duplicate', 'SYSCOHADA.DUPLICATE_SOURCE', false],
  ['treasuryReconciled', 'CONTROL.TREASURY_RECONCILIATION', true],
  ['stockReconciled', 'CONTROL.STOCK_RECONCILIATION', true],
  ['salesReconciled', 'CONTROL.SALES_RECONCILIATION', true],
];

@Injectable()
export class AccountingAiComplianceEngine {
  evaluate(input: ComplianceInput) {
    const checks: Record<string, boolean> = {
      'SYSCOHADA.BALANCED_ENTRY':
        Number.isFinite(input.debitTotal) &&
        Number.isFinite(input.creditTotal) &&
        Math.abs(input.debitTotal - input.creditTotal) < 0.005,
    };
    for (const [property, rule, expected] of RULES) {
      checks[rule] = input[property] === expected;
    }
    return {
      checks,
      blockers: Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([rule]) => rule),
    };
  }
}
