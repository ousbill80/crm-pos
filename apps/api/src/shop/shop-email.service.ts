import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type ShopEmailTemplate =
  | 'confirmation_commande'
  | 'commande_recue_attente_paiement'
  | 'paiement_echec'
  | 'commande_en_preparation'
  | 'commande_prete'
  | 'expedition'
  | 'livraison_effectuee'
  | 'remise_boutique'
  | 'fidelite_et_avis'
  | 'admin_nouvelle_commande'
  | 'admin_statut_commande'
  | 'mot_de_passe_oublie';

const SUBJECTS: Record<ShopEmailTemplate, string> = {
  confirmation_commande:
    'Confirmation de votre commande — merci pour votre confiance',
  commande_recue_attente_paiement:
    'Commande enregistrée — finalisez votre paiement',
  paiement_echec: 'Paiement non abouti — votre commande',
  commande_en_preparation: 'Votre commande est en préparation',
  commande_prete: 'Votre commande est prête au retrait',
  expedition: 'Votre commande a été expédiée',
  livraison_effectuee: 'Votre commande a été livrée',
  remise_boutique: 'Votre commande a été remise',
  fidelite_et_avis: 'Merci ! Points fidélité & votre avis',
  admin_nouvelle_commande: '[Shop] Nouvelle commande',
  admin_statut_commande: '[Shop] Mise à jour commande',
  mot_de_passe_oublie: 'Réinitialisation de votre mot de passe',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(
  template: ShopEmailTemplate,
  context: Record<string, string>,
): string {
  const ref = esc(context.reference ?? context.commandeId?.slice(0, 8) ?? '—');
  const montant = esc(context.montant ?? '');
  const suivi = context.suiviUrl ? esc(context.suiviUrl) : '';
  const avis = context.avisUrl ? esc(context.avisUrl) : '';
  const message = esc(context.message ?? '');
  const articles = esc(context.articles ?? '');

  const lines: string[] = [
    `<p style="margin:0 0 12px;font-family:system-ui,sans-serif;color:#111">MAJOR AUTO PARTS</p>`,
    `<h1 style="margin:0 0 16px;font-size:20px;font-family:system-ui,sans-serif">${esc(SUBJECTS[template])}</h1>`,
    `<p style="margin:0 0 8px;font-family:system-ui,sans-serif;color:#333">Réf. <strong>${ref}</strong>${montant ? ` · ${montant} FCFA` : ''}</p>`,
  ];

  if (message) {
    lines.push(
      `<p style="margin:12px 0;font-family:system-ui,sans-serif;color:#333">${message}</p>`,
    );
  }
  if (articles) {
    lines.push(
      `<p style="margin:8px 0;font-family:system-ui,sans-serif;color:#555;font-size:14px">Articles : ${articles}</p>`,
    );
  }

  switch (template) {
    case 'commande_prete':
      if (context.boutique) {
        lines.push(
          `<p style="font-family:system-ui,sans-serif">Boutique : <strong>${esc(context.boutique)}</strong><br/>${esc(context.adresseBoutique ?? '')}</p>`,
        );
      }
      break;
    case 'expedition':
      if (context.numeroSuivi) {
        lines.push(
          `<p style="font-family:system-ui,sans-serif">N° suivi : <strong>${esc(context.numeroSuivi)}</strong></p>`,
        );
      }
      break;
    case 'fidelite_et_avis':
      if (context.points && context.points !== '0') {
        lines.push(
          `<p style="font-family:system-ui,sans-serif">Points fidélité crédités : <strong>${esc(context.points)}</strong></p>`,
        );
      }
      if (avis) {
        lines.push(
          `<p style="margin:20px 0"><a href="${avis}" style="background:#b8921f;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-family:system-ui,sans-serif">Noter le service</a></p>`,
        );
      }
      break;
    case 'admin_nouvelle_commande':
    case 'admin_statut_commande':
      lines.push(
        `<p style="font-family:system-ui,sans-serif;font-size:14px">Client : ${esc(context.emailClient ?? '')}<br/>Événement : ${esc(context.evenement ?? context.statut ?? '')}<br/>Mode : ${esc(context.modeFulfillment ?? '')} / ${esc(context.modeReglement ?? '')}</p>`,
      );
      break;
    case 'mot_de_passe_oublie':
      if (context.resetUrl) {
        lines.push(
          `<p style="margin:20px 0"><a href="${esc(context.resetUrl)}" style="background:#111;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-family:system-ui,sans-serif">Réinitialiser</a></p>`,
        );
      }
      break;
    default:
      break;
  }

  if (suivi && !template.startsWith('admin_')) {
    lines.push(
      `<p style="margin:20px 0"><a href="${suivi}" style="color:#b8921f;font-family:system-ui,sans-serif">Suivre ma commande</a></p>`,
    );
  }

  lines.push(
    `<p style="margin-top:28px;font-size:12px;color:#888;font-family:system-ui,sans-serif">MAJOR AUTO PARTS — Cet e-mail est automatique.</p>`,
  );

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f2f3f5">${lines.join('')}</body></html>`;
}

@Injectable()
export class ShopEmailService {
  private readonly logger = new Logger(ShopEmailService.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (key) {
      this.resend = new Resend(key);
      this.logger.log('Passerelle e-mail Resend activée.');
    }
  }

  adminInbox(): string | null {
    return (
      this.config.get<string>('SHOP_ADMIN_EMAIL')?.trim() ||
      this.config.get<string>('ADMIN_EMAIL')?.trim() ||
      null
    );
  }

  private fromAddress(): string {
    return (
      this.config.get<string>('SHOP_EMAIL_FROM')?.trim() ||
      this.config.get<string>('RESEND_FROM')?.trim() ||
      'MAJOR AUTO PARTS <onboarding@resend.dev>'
    );
  }

  async envoyer(
    to: string,
    template: ShopEmailTemplate,
    context: Record<string, string>,
  ): Promise<void> {
    if (!to?.includes('@')) return;

    const subject = SUBJECTS[template] ?? template;
    const html = renderHtml(template, context);
    const provider =
      this.config.get<string>('EMAIL_PROVIDER')?.trim().toLowerCase() ||
      (this.resend ? 'resend' : 'mock');

    this.logger.log(`E-mail ${template} → ${to} | ${subject} [${provider}]`);

    if (provider === 'mock' || !this.resend) {
      this.logger.debug(
        `Mock e-mail ${template} → ${to} ${JSON.stringify(context)}`,
      );
      return;
    }

    if (provider !== 'resend') {
      this.logger.warn(`EMAIL_PROVIDER inconnu (${provider}) — envoi ignoré.`);
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress(),
        to: [to],
        subject,
        html,
        tags: [{ name: 'template', value: template.slice(0, 50) }],
      });
      if (error) {
        this.logger.warn(`Resend erreur ${template} → ${to}: ${error.message}`);
        return;
      }
      this.logger.log(`Resend OK ${template} → ${to} id=${data?.id ?? '?'}`);
    } catch (err) {
      this.logger.error(
        `Échec Resend ${template}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
