import { Injectable } from '@nestjs/common';
import { AccountingAiRiskLevel } from './accounting-ai.types';

@Injectable()
export class AccountingAiPolicyEvaluator {
  evaluate(input: {
    confidence: number;
    risk: AccountingAiRiskLevel;
    policyApproved: boolean;
    threshold: number;
    deterministicBlockers: string[];
  }): { eligible: boolean; route: 'AUTO_POST_ELIGIBLE' | 'RAF_REVIEW' } {
    const eligible =
      input.policyApproved &&
      input.risk === 'LOW' &&
      input.confidence >= input.threshold &&
      input.deterministicBlockers.length === 0;
    return { eligible, route: eligible ? 'AUTO_POST_ELIGIBLE' : 'RAF_REVIEW' };
  }
}
