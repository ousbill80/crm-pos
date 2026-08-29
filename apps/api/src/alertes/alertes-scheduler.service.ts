import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsGateway } from '../transactions/transactions.gateway';
import { envoyerSms } from '../crm/campagne-envoi';
import { AlertesService, AlerteDto } from './alertes.service';
import { AlertesMailer } from './alertes-mailer';
import {
  renderMailDigestDaf,
  renderMailPointNonVerse,
  renderMailReceptionDaf,
  type LigneAlerteFonds,
} from './alertes-mail';

const INTERVALLE_MINUTES = Math.max(
  1,
  Number(process.env.ALERTES_INTERVALLE_MINUTES ?? 15),
);

// Notifications proactives (§6.7, §5.1) : diffusion temps réel (WebSocket)
// + e-mail HTML (Resend) / SMS. Dédoublonnage append-only (AlerteNotifiee).
@Injectable()
export class AlertesSchedulerService {
  private readonly logger = new Logger(AlertesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertesService: AlertesService,
    private readonly gateway: TransactionsGateway,
    private readonly mailer: AlertesMailer,
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

    await this.diffuserDigestDaf(alertes);
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
        if (boutiqueId) {
          await this.notifierRoles(
            alerte,
            [RoleLibelle.RESPONSABLE_BOUTIQUE, RoleLibelle.CAISSIER_BOUTIQUE],
            boutiqueId,
          );
        }
        break;
      case 'POINT_JOUR_NON_VERSE':
        await this.notifierRoles(alerte, [
          RoleLibelle.DAF,
          RoleLibelle.CAISSIER_CENTRAL,
        ]);
        if (boutiqueId) {
          await this.notifierRoles(
            alerte,
            [RoleLibelle.RESPONSABLE_BOUTIQUE, RoleLibelle.CAISSIER_BOUTIQUE],
            boutiqueId,
          );
        }
        break;
      case 'RECEPTION_DAF_EN_ATTENTE':
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

  private async diffuserDigestDaf(alertes: AlerteDto[]): Promise<void> {
    const nonTransferes = alertes.filter((a) => a.type === 'POINT_JOUR_NON_VERSE');
    const aReceptionner = alertes.filter(
      (a) => a.type === 'RECEPTION_DAF_EN_ATTENTE',
    );
    if (nonTransferes.length === 0 && aReceptionner.length === 0) return;

    const jour = new Date().toISOString().slice(0, 10);
    const empreinte = [...nonTransferes, ...aReceptionner]
      .map((a) => a.entiteId)
      .sort()
      .join(',');
    const cleUnique = `DIGEST_FONDS_DAF:${jour}:${empreinte}`;
    const deja = await this.prisma.alerteNotifiee.findUnique({
      where: { cleUnique },
    });
    if (deja) return;

    await this.prisma.alerteNotifiee.create({
      data: { type: 'DIGEST_FONDS_DAF', cleUnique },
    });

    const mail = renderMailDigestDaf({
      nonTransferes: nonTransferes.map(ligneDepuisAlerte),
      aReceptionner: aReceptionner.map(ligneDepuisAlerte),
      ctaUrl: this.mailer.crmUrl('/tresorerie/reception'),
    });

    const destinataires = await this.prisma.utilisateur.findMany({
      where: {
        actif: true,
        role: {
          libelle: { in: [RoleLibelle.DAF, RoleLibelle.CAISSIER_CENTRAL] },
        },
      },
      select: { email: true },
    });
    for (const u of destinataires) {
      if (!u.email) continue;
      try {
        await this.mailer.envoyer(u.email, mail);
      } catch (err) {
        this.logger.warn(`Échec digest DAF : ${String(err)}`);
      }
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

    const mail = this.mailPour(alerte);

    for (const u of utilisateurs) {
      try {
        if (u.email && mail) {
          await this.mailer.envoyer(u.email, mail);
        } else if (u.email) {
          await this.mailer.envoyer(u.email, {
            objet: `Alerte — ${alerte.type}`,
            text: alerte.message,
            html: `<p>${alerte.message}</p>`,
          });
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

  private mailPour(alerte: AlerteDto) {
    const boutique =
      (alerte.details?.boutiqueNom as string | undefined) ?? 'Boutique';
    const montant = (alerte.details?.montant as string | undefined) ?? '—';
    const ageHeures = Number(alerte.details?.ageHeures ?? 0);
    if (alerte.type === 'POINT_JOUR_NON_VERSE') {
      return renderMailPointNonVerse({
        boutique,
        montant,
        ageHeures,
        ctaUrl: this.mailer.crmUrl('/pos'),
      });
    }
    if (alerte.type === 'RECEPTION_DAF_EN_ATTENTE') {
      return renderMailReceptionDaf({
        boutique,
        montant,
        ctaUrl: this.mailer.crmUrl(`/transactions/${alerte.entiteId}`),
      });
    }
    if (alerte.type === 'VERSEMENT_EN_RETARD') {
      if (alerte.details?.statut === 'EN_TRANSIT') {
        return renderMailReceptionDaf({
          boutique,
          montant,
          ctaUrl: this.mailer.crmUrl(`/transactions/${alerte.entiteId}`),
        });
      }
      return renderMailPointNonVerse({
        boutique,
        montant,
        ageHeures,
        ctaUrl: this.mailer.crmUrl(`/transactions/${alerte.entiteId}`),
      });
    }
    return null;
  }
}

function ligneDepuisAlerte(a: AlerteDto): LigneAlerteFonds {
  return {
    boutique: (a.details?.boutiqueNom as string | undefined) ?? '—',
    montant: (a.details?.montant as string | undefined) ?? '—',
    etape: a.type === 'POINT_JOUR_NON_VERSE' ? 'Non transféré' : 'En transit',
    age: `${Number(a.details?.ageHeures ?? 0)} h`,
  };
}
