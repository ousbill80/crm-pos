import { AccountingAiComplianceEngine } from './accounting-ai.compliance';
import { AccountingAiPolicyEvaluator } from './accounting-ai.policy';

describe('Accounting AI deterministic authority', () => {
  const engine = new AccountingAiComplianceEngine();
  const policy = new AccountingAiPolicyEvaluator();

  const compliant = {
    debitTotal: 100,
    creditTotal: 100,
    periodOpen: true,
    accountMappingValid: true,
    taxMappingValid: true,
    sourceTraceable: true,
    sequenceValid: true,
    duplicate: false,
    treasuryReconciled: true,
    stockReconciled: true,
    salesReconciled: true,
  };

  it('lets a deterministic blocker override high-confidence AI', () => {
    const checks = engine.evaluate({ ...compliant, periodOpen: false });
    expect(checks.blockers).toContain('SYSCOHADA.PERIOD_OPEN');
    expect(
      policy.evaluate({
        confidence: 0.999,
        risk: 'LOW',
        policyApproved: true,
        threshold: 0.9,
        deterministicBlockers: checks.blockers,
      }),
    ).toEqual({ eligible: false, route: 'RAF_REVIEW' });
  });

  it('requires every deterministic reconciliation and control', () => {
    for (const key of [
      'treasuryReconciled',
      'stockReconciled',
      'salesReconciled',
      'sequenceValid',
      'sourceTraceable',
      'taxMappingValid',
      'accountMappingValid',
    ] as const) {
      expect(
        engine.evaluate({ ...compliant, [key]: false }).blockers,
      ).not.toHaveLength(0);
    }
  });

  it('allows auto-post eligibility only under an approved low-risk policy', () => {
    expect(
      policy.evaluate({
        confidence: 0.95,
        risk: 'LOW',
        policyApproved: true,
        threshold: 0.9,
        deterministicBlockers: [],
      }),
    ).toEqual({ eligible: true, route: 'AUTO_POST_ELIGIBLE' });
    expect(
      policy.evaluate({
        confidence: 0.95,
        risk: 'MEDIUM',
        policyApproved: true,
        threshold: 0.9,
        deterministicBlockers: [],
      }).eligible,
    ).toBe(false);
  });
});
