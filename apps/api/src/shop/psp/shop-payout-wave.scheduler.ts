import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { WaveAdapter } from './wave.adapter';

// Pas de webhook Wave pour les payouts : seul un sondage périodique de
// GET /v1/payout/:id permet de connaître le statut terminal (§ docs.wave.com/payout).
const PLAFOND_TENTATIVES = 20;

@Injectable()
export class ShopPayoutWaveScheduler {
  private readonly logger = new Logger(ShopPayoutWaveScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waveAdapter: WaveAdapter,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sonderPayoutsEnCours(): Promise<void> {
    const enCours = await this.prisma.payoutWave.findMany({
      where: { statut: 'EN_COURS' },
    });

    for (const payout of enCours) {
      await this.sonderUnPayout(payout);
    }
  }

  private async sonderUnPayout(payout: {
    id: string;
    commandeWebId: string;
    referenceProvider: string | null;
    tentatives: number;
  }): Promise<void> {
    if (!payout.referenceProvider) return;

    let result: { status: 'processing' | 'succeeded' | 'failed'; erreurCode?: string };
    try {
      result = await this.waveAdapter.verifierPayout(payout.referenceProvider);
    } catch (error) {
      this.logger.warn(
        `Sondage Wave payout ${payout.id} en échec (réessai au prochain cycle) : ${String(error)}`,
      );
      return;
    }

    if (result.status === 'succeeded') {
      await this.prisma.payoutWave.update({
        where: { id: payout.id },
        data: { statut: 'REUSSI' },
      });
      await this.auditSysteme(
        'PAYOUT_WAVE_REUSSI',
        payout.commandeWebId,
        `Reversement Wave réussi — ${payout.referenceProvider}`,
      );
      return;
    }

    if (result.status === 'failed') {
      await this.prisma.payoutWave.update({
        where: { id: payout.id },
        data: {
          statut: 'ECHEC',
          ...(result.erreurCode ? { erreurCode: result.erreurCode } : {}),
        },
      });
      await this.auditSysteme(
        'PAYOUT_WAVE_ECHEC',
        payout.commandeWebId,
        `Reversement Wave échoué — ${result.erreurCode ?? 'inconnu'}`,
      );
      return;
    }

    const tentatives = payout.tentatives + 1;
    if (tentatives >= PLAFOND_TENTATIVES) {
      await this.prisma.payoutWave.update({
        where: { id: payout.id },
        data: {
          tentatives,
          statut: 'ECHEC',
          erreurCode: 'plafond_tentatives_atteint',
          erreurMessage: `Aucun statut terminal après ${PLAFOND_TENTATIVES} sondages Wave.`,
        },
      });
      await this.auditSysteme(
        'PAYOUT_WAVE_ECHEC',
        payout.commandeWebId,
        `Reversement Wave en échec — plafond de ${PLAFOND_TENTATIVES} tentatives atteint sans statut terminal`,
      );
      return;
    }

    await this.prisma.payoutWave.update({
      where: { id: payout.id },
      data: { tentatives },
    });
  }

  private async auditSysteme(
    action: string,
    commandeId: string,
    details: string,
  ): Promise<void> {
    const si = await this.prisma.utilisateur.findFirst({
      where: { role: { libelle: 'RESPONSABLE_SI' } },
    });
    if (!si) return;
    await this.audit.record({
      utilisateurId: si.id,
      action,
      entite: 'CommandeWeb',
      entiteId: commandeId,
      details,
    });
  }
}
