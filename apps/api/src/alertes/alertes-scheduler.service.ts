import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsGateway } from '../transactions/transactions.gateway';
import { envoyerEmail, envoyerSms } from '../crm/campagne-envoi';
import { AlertesService, AlerteDto } from './alertes.service';

const INTERVALLE_MINUTES = Math.max(
  1,
  Number(process.env.ALERTES_INTERVALLE_MINUTES ?? 15),
);

// Notifications proactives (§6.7, §5.1) : diffusion temps réel (WebSocket,
// AlertesRealtimePayload) pour toute alerte réseau, plus SMS/email
// individuel ciblé pour les trois catégories explicitement mandatées par le
// cahier — écart de caisse (responsable boutique + contrôle interne),
// versement en retard (DAF + caissier central), accès non autorisé
// (responsable SI + contrôle interne).
//
// Dédoublonnage append-only (AlerteNotifiee) : une alerte n'est notifiée
// qu'une seule fois par clé. Pour les alertes dérivées du journal (écart,
// retard, litige) la clé est liée à l'entité immuable concernée — une fois
// régularisée, l'alerte disparaît du calcul et sa clé ne réapparaît jamais.
// Pour les alertes de type snapshot (stock bas, seuil de caisse), la clé
// est bornée au jour courant pour permettre une relance quotidienne tant
// que la condition persiste.
@Injectable()
export class AlertesSchedulerService {
  private readonly logger = new Logger(AlertesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertesService: AlertesService,
    private readonly gateway: TransactionsGateway,
  ) {}

  @Cron(`*/${INTERVALLE_MINUTES} * * * *`)
  async verifierEtNotifier(): Promise<void> {
    try {
      await this.cycle();
    } catch (err) {
      this.logger.error(`Cycle d'alertes en échec : ${String(err)}`);
    }
  }

  async cycle(): Promise<void> {
    const alertes = await this.alertesService.listerReseau();

    for (const alerte of alertes) {
      const cleUnique = this.cleUniqueDe(alerte);
      const dejaNotifiee = await this.prisma.alerteNotifiee.findUnique({
        where: { cleUnique },
      });
      if (dejaNotifiee) continue;

      await this.prisma.alerteNotifiee.create({
        data: { type: alerte.type, cleUnique },
      });

      await this.diffuser(alerte);
    }
  }

  private cleUniqueDe(alerte: AlerteDto): string {
    if (alerte.type === 'STOCK_BAS' || alerte.type === 'SEUIL_CAISSE_DEPASSE') {
      const jour = new Date().toISOString().slice(0, 10);
      return `${alerte.type}:${alerte.entiteId}:${jour}`;
    }
    return `${alerte.type}:${alerte.entiteId}`;
  }

  private async diffuser(alerte: AlerteDto): Promise<void> {
    const boutiqueId = alerte.details?.boutiqueId as string | undefined;
    let zoneId: string | null = null;
    if (boutiqueId) {
      const boutique = await this.prisma.boutique.findUnique({
        where: { id: boutiqueId },
        select: { zoneId: true },
      });
      zoneId = boutique?.zoneId ?? null;
    }

    this.gateway.emitAlerte(alerte, zoneId);

    switch (alerte.type) {
      case 'ECART_CAISSE':
        await this.notifierRoles(alerte, [RoleLibelle.CONTROLEUR_INTERNE]);
        if (boutiqueId) {
          await this.notifierRoles(
            alerte,
            [RoleLibelle.RESPONSABLE_BOUTIQUE],
            boutiqueId,
          );
        }
        break;
      case 'VERSEMENT_EN_RETARD':
        await this.notifierRoles(alerte, [
          RoleLibelle.DAF,
          RoleLibelle.CAISSIER_CENTRAL,
        ]);
        break;
      case 'ACCES_REFUSE':
        await this.notifierRoles(alerte, [
          RoleLibelle.RESPONSABLE_SI,
          RoleLibelle.CONTROLEUR_INTERNE,
        ]);
        break;
      default:
        break;
    }
  }

  private async notifierRoles(
    alerte: AlerteDto,
    roles: string[],
    boutiqueId?: string,
  ): Promise<void> {
    const utilisateurs = await this.prisma.utilisateur.findMany({
      where: {
        actif: true,
        role: { libelle: { in: roles } },
        ...(boutiqueId ? { boutiqueId } : {}),
      },
      select: { id: true, email: true, telephone: true },
    });

    for (const u of utilisateurs) {
      try {
        if (u.email) {
          await envoyerEmail(
            u.email,
            `Alerte — ${alerte.type}`,
            alerte.message,
          );
        }
        if (u.telephone) {
          await envoyerSms(u.telephone, alerte.message);
        }
      } catch (err) {
        this.logger.warn(
          `Échec de notification (${alerte.type} → utilisateur ${u.id}) : ${String(err)}`,
        );
      }
    }
  }
}
