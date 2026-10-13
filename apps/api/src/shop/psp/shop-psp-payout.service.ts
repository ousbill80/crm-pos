import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type CommandeWeb } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { WaveAdapter } from './wave.adapter';

// Reversement automatique Wave (ZenAPI -> Wave Business Major Auto Parts) :
// l'encaissement client atterrit sur le compte Wave de l'intégrateur, cette
// méthode transfère le net (moins commission) vers le compte Wave Business
// de Major Auto Parts. Un échec de reversement ne doit jamais faire échouer
// ou annuler la capture du paiement client déjà actée — toute erreur ici est
// catchée et journalisée, jamais propagée.
@Injectable()
export class ShopPspPayoutService {
  private readonly logger = new Logger(ShopPspPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waveAdapter: WaveAdapter,
  ) {}

  async declencherPayout(commande: CommandeWeb): Promise<void> {
    try {
      if (commande.providerPsp !== 'WAVE') return;

      const parametre = await this.prisma.parametreShop.findFirst();
      const mobile = parametre?.waveBeneficiaireMobile?.trim();
      if (!parametre || !mobile) {
        this.logger.warn(
          `Reversement Wave ignoré (bénéficiaire non configuré) — commande ${commande.id}`,
        );
        return;
      }

      const montantBrut = Number(commande.montantTotal);
      const commissionPourcent = Number(parametre.waveCommissionPourcent);
      const montantNet = Math.round(
        montantBrut * (1 - commissionPourcent / 100),
      );
      const commissionMontant = montantBrut - montantNet;
      const idempotencyKey = `wave-payout:${commande.clientOperationId}`;

      let payout: { id: string };
      try {
        payout = await this.prisma.payoutWave.create({
          data: {
            commandeWebId: commande.id,
            montantBrut,
            commissionPourcent,
            commissionMontant,
            montantNet,
            mobileBeneficiaire: mobile,
            idempotencyKey,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Déjà traité (webhook Wave renvoyé) — ignoré silencieusement.
          return;
        }
        throw error;
      }

      await this.auditSysteme(
        'PAYOUT_WAVE_INITIE',
        commande.id,
        `Reversement Wave initié — ${montantNet} XOF vers ${mobile}`,
      );

      try {
        const result = await this.waveAdapter.payout({
          mobile,
          montantNet,
          idempotencyKey,
          clientReference: commande.clientOperationId,
          ...(parametre.waveBeneficiaireNom
            ? { nom: parametre.waveBeneficiaireNom }
            : {}),
        });

        const statut =
          result.status === 'succeeded'
            ? 'REUSSI'
            : result.status === 'failed'
              ? 'ECHEC'
              : 'EN_COURS';

        await this.prisma.payoutWave.update({
          where: { id: payout.id },
          data: {
            referenceProvider: result.id,
            statut,
            ...(result.erreurCode ? { erreurCode: result.erreurCode } : {}),
          },
        });

        if (statut === 'REUSSI') {
          await this.auditSysteme(
            'PAYOUT_WAVE_REUSSI',
            commande.id,
            `Reversement Wave réussi — ${result.id}`,
          );
        } else if (statut === 'ECHEC') {
          await this.auditSysteme(
            'PAYOUT_WAVE_ECHEC',
            commande.id,
            `Reversement Wave échoué — ${result.erreurCode ?? 'inconnu'}`,
          );
        }
      } catch (error) {
        await this.prisma.payoutWave.update({
          where: { id: payout.id },
          data: {
            statut: 'ECHEC',
            erreurMessage: String(error),
          },
        });
        await this.auditSysteme(
          'PAYOUT_WAVE_ECHEC',
          commande.id,
          `Reversement Wave en échec (appel Wave) — ${String(error)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `declencherPayout en échec pour commande ${commande.id}: ${String(error)}`,
      );
    }
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
