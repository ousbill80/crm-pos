import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PurposeActionSensible } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class SensitiveActionChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async create(
    userId: string,
    password: string,
    purpose: PurposeActionSensible,
  ) {
    await this.auth.verifyCurrentPassword(userId, password);
    const challenge = await this.prisma.challengeActionSensible.create({
      data: {
        utilisateurId: userId,
        purpose,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
      select: { id: true, purpose: true, expiresAt: true },
    });
    await this.audit.record({
      utilisateurId: userId,
      action: 'SENSITIVE_ACTION_CHALLENGE_CREATED',
      entite: 'ChallengeActionSensible',
      entiteId: challenge.id,
      details: JSON.stringify({ purpose }),
    });
    return {
      challengeId: challenge.id,
      purpose: challenge.purpose,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async consume(
    challengeId: string,
    userId: string,
    purpose: PurposeActionSensible,
  ): Promise<void> {
    const now = new Date();
    const result = await this.prisma.challengeActionSensible.updateMany({
      where: {
        id: challengeId,
        utilisateurId: userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (result.count !== 1) {
      await this.audit.record({
        utilisateurId: userId,
        action: 'SENSITIVE_ACTION_CHALLENGE_REJECTED',
        entite: 'ChallengeActionSensible',
        entiteId: challengeId,
        details: JSON.stringify({ purpose }),
      });
      throw new UnauthorizedException(
        'Challenge de ré-authentification invalide, expiré ou déjà utilisé.',
      );
    }
    await this.audit.record({
      utilisateurId: userId,
      action: 'SENSITIVE_ACTION_CHALLENGE_CONSUMED',
      entite: 'ChallengeActionSensible',
      entiteId: challengeId,
      details: JSON.stringify({ purpose }),
    });
  }
}
