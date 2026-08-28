import { AccountingAiComplianceEngine } from '../src/accounting-ai/accounting-ai.compliance';
import { AccountingAiDisabledProvider } from '../src/accounting-ai/accounting-ai.provider';
import { AccountingAiPolicyEvaluator } from '../src/accounting-ai/accounting-ai.policy';
import { AccountingAiService } from '../src/accounting-ai/accounting-ai.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

describe('Accounting AI intake (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let service: AccountingAiService;
  let societeId: string;
  let userId: string;

  beforeAll(async () => {
    await env.start();
    service = new AccountingAiService(
      env.prisma,
      new AccountingAiComplianceEngine(),
      new AccountingAiPolicyEvaluator(),
      new AccountingAiDisabledProvider(),
    );
    societeId = (
      await env.prisma.societe.create({
        data: { raisonSociale: 'Accounting AI', adresse: 'Abidjan' },
      })
    ).id;
    const role = await env.prisma.role.create({
      data: { libelle: 'RAF_COMPTABLE', niveauHabilitation: 1 },
    });
    userId = (
      await env.prisma.utilisateur.create({
        data: {
          nom: 'RAF',
          prenom: 'AI',
          login: `raf-ai-${crypto.randomUUID()}`,
          passwordHash: 'not-used-in-service-test',
          roleId: role.id,
        },
      })
    ).id;
  }, 120_000);

  afterAll(() => env.stop(), 30_000);

  it('creates one idempotent work item and immutable evidence', async () => {
    const dto = {
      societeId,
      sourceType: 'POS_SALE' as const,
      sourceId: crypto.randomUUID(),
      snapshot: {
        amount: 1000,
        currency: 'XOF',
        customerName: 'Must disappear',
      },
      compliance: {
        debitTotal: 1000,
        creditTotal: 1000,
        periodOpen: true,
        accountMappingValid: true,
        taxMappingValid: true,
        sourceTraceable: true,
        sequenceValid: true,
        duplicate: false,
        treasuryReconciled: true,
        stockReconciled: true,
        salesReconciled: true,
      },
    };
    const user = {
      userId,
      login: 'raf-ai',
      role: 'RAF_COMPTABLE' as const,
      boutiqueId: null,
    };
    const first = await service.enqueue(dto, user);
    const replay = await service.enqueue(dto, user);
    expect(replay.id).toBe(first.id);
    expect(JSON.stringify(first.sourceSnapshot)).not.toContain(
      'Must disappear',
    );
    expect(
      await env.prisma.accountingAiEvidence.count({
        where: { workItemId: first.id },
      }),
    ).toBe(1);
  });
});
