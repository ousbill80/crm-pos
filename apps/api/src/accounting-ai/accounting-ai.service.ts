import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AccountingAiDecision,
  AccountingAiSuggestionKind,
  AccountingAuditFindingStatus,
  PurposeActionSensible,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import { SensitiveActionChallengeService } from '../auth/sensitive-action-challenge.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingAiComplianceEngine } from './accounting-ai.compliance';
import { ACCOUNTING_AI_PROVIDER } from './accounting-ai.tokens';
import {
  ACCOUNTING_AI_PROMPT_VERSION,
  AccountingAiProviderError,
} from './accounting-ai.provider';
import type { AccountingAiProvider } from './accounting-ai.provider';
import { AccountingAiPolicyEvaluator } from './accounting-ai.policy';
import { sha256, stableJson, suggestionTrace } from './accounting-ai.types';
import {
  AssignFindingDto,
  CreateAccountingAiPolicyDto,
  DecideSuggestionDto,
  EnqueueAccountingWorkDto,
  ResolveFindingDto,
} from './dto/accounting-ai.dto';
import { Inject } from '@nestjs/common';

const FORBIDDEN_SNAPSHOT_KEYS =
  /(?:secret|password|token|api.?key|customer.?name|client.?name|raw.?document|document.?content)/i;

function sanitizeSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSnapshot);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !FORBIDDEN_SNAPSHOT_KEYS.test(key))
      .map(([key, item]) => [key, sanitizeSnapshot(item)]),
  );
}

@Injectable()
export class AccountingAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: AccountingAiComplianceEngine,
    private readonly policy: AccountingAiPolicyEvaluator,
    @Inject(ACCOUNTING_AI_PROVIDER)
    private readonly provider: AccountingAiProvider,
    @Optional()
    private readonly sensitiveActions?: SensitiveActionChallengeService,
  ) {}

  async enqueue(dto: EnqueueAccountingWorkDto, user: AuthenticatedUser) {
    const existing = await this.prisma.accountingAiWorkItem.findUnique({
      where: {
        societeId_sourceType_sourceId: {
          societeId: dto.societeId,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
        },
      },
      include: { suggestions: true, findings: true },
    });
    if (existing) return existing;

    const snapshot = sanitizeSnapshot(dto.snapshot) as Prisma.InputJsonValue;
    const result = this.compliance.evaluate(dto.compliance);
    let providerResult = {
      modelVersion: 'disabled',
      suggestions: [] as Awaited<
        ReturnType<AccountingAiProvider['analyze']>
      >['suggestions'],
    };
    let providerErrorCode: string | null = null;
    try {
      providerResult = await this.provider.analyze({
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        snapshot: snapshot as Record<string, unknown>,
      });
    } catch (error) {
      if (!(error instanceof AccountingAiProviderError)) throw error;
      providerErrorCode = error.code;
    }

    const policies = await this.prisma.accountingAiPolicy.findMany({
      where: {
        societeId: dto.societeId,
        sourceType: dto.sourceType,
        active: true,
        approvedByDafId: { not: null },
      },
      orderBy: { version: 'desc' },
    });
    const policyByKind = new Map(
      policies.map((item) => [item.suggestionKind, item]),
    );
    const eligibility = providerResult.suggestions.map((suggestion) => {
      const activePolicy = policyByKind.get(
        suggestion.kind as AccountingAiSuggestionKind,
      );
      return this.policy.evaluate({
        confidence: suggestion.confidence,
        risk: suggestion.risk,
        policyApproved: Boolean(activePolicy?.approvedByDafId),
        threshold: Number(activePolicy?.minimumConfidence ?? 1),
        deterministicBlockers: result.blockers,
      });
    });
    const autoEligible =
      eligibility.length > 0 && eligibility.every((item) => item.eligible);
    const trace = suggestionTrace(
      providerResult.modelVersion,
      ACCOUNTING_AI_PROMPT_VERSION,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const workItem = await tx.accountingAiWorkItem.create({
          data: {
            societeId: dto.societeId,
            sourceType: dto.sourceType,
            sourceId: dto.sourceId,
            sourceSnapshot: snapshot,
            sourceHash: sha256(stableJson(snapshot)),
            status: autoEligible ? 'AUTO_POST_ELIGIBLE' : 'RAF_REVIEW',
            deterministicChecks: result.checks,
            deterministicBlockers: result.blockers,
            providerMode: this.provider.mode,
            providerErrorCode,
            createdById: user.userId,
            suggestions: {
              create: providerResult.suggestions.map((suggestion) => ({
                kind: suggestion.kind as AccountingAiSuggestionKind,
                value: suggestion.value as Prisma.InputJsonValue,
                confidence: suggestion.confidence,
                evidence: suggestion.evidence,
                ruleCitations: suggestion.ruleCitations,
                risk: suggestion.risk,
                ...trace,
              })),
            },
            findings: {
              create: [
                ...result.blockers.map((rule) => ({
                  severity:
                    rule.includes('BALANCED') || rule.includes('DUPLICATE')
                      ? ('HIGH' as const)
                      : ('MEDIUM' as const),
                  ruleCode: rule,
                  title: `Blocage déterministe ${rule}`,
                  details: { authoritative: true },
                })),
                ...providerResult.suggestions
                  .filter((suggestion) => suggestion.kind === 'ANOMALY')
                  .map((suggestion) => ({
                    severity:
                      suggestion.risk === 'HIGH'
                        ? ('HIGH' as const)
                        : suggestion.risk === 'MEDIUM'
                          ? ('MEDIUM' as const)
                          : ('LOW' as const),
                    ruleCode: suggestion.ruleCitations[0] ?? 'AI.ANOMALY',
                    title: 'Anomalie comptable à examiner',
                    details: {
                      advisory: true,
                      confidence: suggestion.confidence,
                      evidence: suggestion.evidence,
                    },
                  })),
              ],
            },
          },
          include: { suggestions: true, findings: true },
        });
        await this.evidence(
          tx,
          workItem.id,
          'WORK_ITEM_ANALYZED',
          user.userId,
          {
            sourceHash: workItem.sourceHash,
            providerMode: this.provider.mode,
            providerErrorCode,
            blockers: result.blockers,
          },
        );
        return workItem;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.accountingAiWorkItem.findUniqueOrThrow({
          where: {
            societeId_sourceType_sourceId: {
              societeId: dto.societeId,
              sourceType: dto.sourceType,
              sourceId: dto.sourceId,
            },
          },
          include: { suggestions: true, findings: true },
        });
      }
      throw error;
    }
  }

  async createPolicy(
    dto: CreateAccountingAiPolicyDto,
    user: AuthenticatedUser,
  ) {
    await this.challengeService().consume(
      dto.challengeId,
      user.userId,
      PurposeActionSensible.ACCOUNTING_AI_POLICY_CREATE,
    );
    const latest = await this.prisma.accountingAiPolicy.aggregate({
      where: {
        societeId: dto.societeId,
        sourceType: dto.sourceType,
        suggestionKind: dto.suggestionKind as AccountingAiSuggestionKind,
      },
      _max: { version: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.accountingAiPolicy.create({
        data: {
          societeId: dto.societeId,
          sourceType: dto.sourceType,
          suggestionKind: dto.suggestionKind as AccountingAiSuggestionKind,
          minimumConfidence: dto.minimumConfidence,
          maximumRisk: 'LOW',
          version: (latest._max.version ?? 0) + 1,
          active: false,
          createdById: user.userId,
        },
      });
      await tx.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action: 'ACCOUNTING_AI_POLICY_DRAFTED',
          entite: 'ACCOUNTING_AI_POLICY',
          entiteId: policy.id,
          details: stableJson({ version: policy.version, active: false }),
        },
      });
      return policy;
    });
  }

  async approvePolicy(
    id: string,
    challengeId: string,
    user: AuthenticatedUser,
  ) {
    await this.challengeService().consume(
      challengeId,
      user.userId,
      PurposeActionSensible.ACCOUNTING_AI_POLICY_APPROVE,
    );
    const policy = await this.prisma.accountingAiPolicy.findUnique({
      where: { id },
    });
    if (!policy) throw new NotFoundException('Politique introuvable.');
    return this.prisma.$transaction(async (tx) => {
      await tx.accountingAiPolicy.updateMany({
        where: {
          societeId: policy.societeId,
          sourceType: policy.sourceType,
          suggestionKind: policy.suggestionKind,
          active: true,
          id: { not: id },
        },
        data: { active: false },
      });
      const approved = await tx.accountingAiPolicy.update({
        where: { id },
        data: {
          approvedByDafId: user.userId,
          approvedAt: new Date(),
          active: true,
        },
      });
      await tx.journalAudit.create({
        data: {
          utilisateurId: user.userId,
          action: 'ACCOUNTING_AI_POLICY_APPROVED_DAF',
          entite: 'ACCOUNTING_AI_POLICY',
          entiteId: id,
          details: stableJson({ version: approved.version, active: true }),
        },
      });
      return approved;
    });
  }

  async decide(id: string, dto: DecideSuggestionDto, user: AuthenticatedUser) {
    const suggestion = await this.prisma.accountingAiSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException('Suggestion introuvable.');
    const prior = await this.prisma.accountingAiDecisionEvent.findFirst({
      where: { suggestionId: id },
    });
    if (prior) throw new ConflictException('Suggestion déjà décidée.');
    return this.prisma.$transaction(async (tx) => {
      const eventData = {
        suggestionId: id,
        decision: dto.decision as AccountingAiDecision,
        actorId: user.userId,
        reason: dto.reason,
      };
      const decision = await tx.accountingAiDecisionEvent.create({
        data: {
          ...eventData,
          evidenceHash: sha256(stableJson(eventData)),
        },
      });
      await this.evidence(
        tx,
        suggestion.workItemId,
        'HUMAN_DECISION',
        user.userId,
        {
          suggestionId: id,
          decision: dto.decision,
          reason: dto.reason ?? null,
        },
      );
      return decision;
    });
  }

  private challengeService(): SensitiveActionChallengeService {
    if (!this.sensitiveActions) {
      throw new ServiceUnavailableException(
        'Le service de ré-authentification sensible est indisponible.',
      );
    }
    return this.sensitiveActions;
  }

  async assignFinding(
    id: string,
    dto: AssignFindingDto,
    user: AuthenticatedUser,
  ) {
    const finding = await this.prisma.accountingAuditFinding.findUnique({
      where: { id },
    });
    if (!finding) throw new NotFoundException('Constat introuvable.');
    return this.prisma.$transaction(async (tx) => {
      const assigned = await tx.accountingAuditFinding.update({
        where: { id },
        data: { assignedToId: dto.assignedToId, status: 'ASSIGNED' },
      });
      await this.evidence(
        tx,
        finding.workItemId,
        'FINDING_ASSIGNED',
        user.userId,
        {
          findingId: id,
          assignedToId: dto.assignedToId,
        },
      );
      return assigned;
    });
  }

  async resolveFinding(
    id: string,
    dto: ResolveFindingDto,
    user: AuthenticatedUser,
  ) {
    const finding = await this.prisma.accountingAuditFinding.findUnique({
      where: { id },
    });
    if (!finding) throw new NotFoundException('Constat introuvable.');
    if (['HIGH', 'CRITICAL'].includes(finding.severity) && !dto.stornoEntryId) {
      throw new BadRequestException(
        'Un constat élevé exige une écriture de storno/compensation.',
      );
    }
    const status: AccountingAuditFindingStatus = dto.stornoEntryId
      ? 'RESOLVED'
      : 'STORNO_REQUIRED';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountingAuditFinding.update({
        where: { id },
        data: {
          status,
          resolution: dto.resolution,
          stornoEntryId: dto.stornoEntryId,
          resolvedById: status === 'RESOLVED' ? user.userId : null,
          resolvedAt: status === 'RESOLVED' ? new Date() : null,
        },
      });
      await this.evidence(
        tx,
        finding.workItemId,
        'FINDING_REMEDIATION',
        user.userId,
        {
          findingId: id,
          status,
          stornoEntryId: dto.stornoEntryId ?? null,
        },
      );
      return updated;
    });
  }

  listWorkItems(societeId: string) {
    return this.prisma.accountingAiWorkItem.findMany({
      where: { societeId },
      include: {
        suggestions: { include: { decisions: true } },
        findings: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listFindings(societeId: string) {
    return this.prisma.accountingAuditFinding.findMany({
      where: { workItem: { societeId } },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listPolicies(societeId: string) {
    return this.prisma.accountingAiPolicy.findMany({
      where: { societeId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }, { version: 'desc' }],
    });
  }

  async dashboard(societeId: string) {
    const [workItems, findings, suggestions] = await Promise.all([
      this.prisma.accountingAiWorkItem.groupBy({
        by: ['status'],
        where: { societeId },
        _count: { _all: true },
      }),
      this.prisma.accountingAuditFinding.groupBy({
        by: ['severity', 'status'],
        where: { workItem: { societeId } },
        _count: { _all: true },
      }),
      this.prisma.accountingAiSuggestion.count({
        where: { workItem: { societeId } },
      }),
    ]);
    return { workItems, findings, suggestions };
  }

  private evidence(
    tx: Prisma.TransactionClient,
    workItemId: string,
    eventType: string,
    actorId: string | null,
    evidence: Record<string, unknown>,
  ) {
    return tx.accountingAiEvidence.create({
      data: {
        workItemId,
        eventType,
        actorId,
        evidence: evidence as Prisma.InputJsonValue,
        evidenceHash: sha256(stableJson(evidence)),
      },
    });
  }
}
