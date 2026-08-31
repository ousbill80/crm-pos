import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type ShopEmailTemplate =
  | 'bienvenue_compte'
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

/** Modèles sans référence de commande dans l'en-tête. */
const SANS_REF_COMMANDE = new Set<ShopEmailTemplate>([
  'bienvenue_compte',
  'mot_de_passe_oublie',
]);

const SUBJECTS: Record<ShopEmailTemplate, string> = {
  bienvenue_compte:
    'Bienvenue chez MAJOR AUTO PARTS — votre compte est prêt',
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

function renderBienvenueCompteHtml(context: Record<string, string>): string {
  const prenom = esc(context.prenom?.trim() || 'Client');
  const catalogueUrl = context.catalogueUrl ? esc(context.catalogueUrl) : '';
  const compteUrl = context.compteUrl ? esc(context.compteUrl) : '';
  const codeParrain = context.codeParrainage?.trim()
    ? esc(context.codeParrainage.trim())
    : '';

  const avantages = [
    'Suivre vos commandes et leur préparation en temps réel',
    'Enregistrer vos adresses de livraison pour un checkout plus rapide',
    'Cumuler des points fidélité à chaque achat en boutique ou en ligne',
    'Retrait gratuit au showroom ou livraison partout en Côte d’Ivoire',
  ]
    .map(
      (item) =>
        `<li style="margin:0 0 10px;padding-left:4px;line-height:1.45">${esc(item)}</li>`,
    )
    .join('');

  const boutons: string[] = [];
  if (catalogueUrl) {
    boutons.push(
      `<a href="${catalogueUrl}" style="background:#b8921f;color:#fff;padding:14px 22px;text-decoration:none;border-radius:8px;font-family:system-ui,sans-serif;font-weight:600;display:inline-block;margin:6px 10px 6px 0">Découvrir le catalogue</a>`,
    );
  }
  if (compteUrl) {
    boutons.push(
      `<a href="${compteUrl}" style="background:#14171c;color:#fff;padding:14px 22px;text-decoration:none;border-radius:8px;font-family:system-ui,sans-serif;font-weight:600;display:inline-block;margin:6px 10px 6px 0">Accéder à mon compte</a>`,
    );
  }

  const parrainBlock = codeParrain
    ? `<div style="margin:24px 0;padding:16px 18px;background:#fff9eb;border:1px solid #e8d9a8;border-radius:10px">
        <p style="margin:0 0 6px;font-family:system-ui,sans-serif;font-size:13px;font-weight:700;color:#8a6d12;text-transform:uppercase;letter-spacing:0.06em">Programme parrainage</p>
        <p style="margin:0;font-family:system-ui,sans-serif;color:#333;line-height:1.5">Partagez votre code avec vos proches : <strong style="font-size:18px;letter-spacing:0.04em">${codeParrain}</strong></p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#eceef2">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Votre compte MAJOR AUTO PARTS est actif — pièces auto, retrait showroom et livraison CIV.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e6eb">
        <tr><td style="height:5px;background:linear-gradient(90deg,#b8921f,#d4a017)"></td></tr>
        <tr><td style="padding:28px 32px 8px;font-family:system-ui,sans-serif">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#b8921f">MAJOR AUTO PARTS</p>
          <h1 style="margin:0;font-size:24px;line-height:1.25;color:#14171c">Bienvenue, ${prenom}&nbsp;!</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0;font-family:system-ui,sans-serif;color:#333;font-size:15px;line-height:1.6">
          <p style="margin:0 0 16px">Merci de rejoindre <strong>MAJOR AUTO PARTS</strong>, votre showroom pièces et accessoires automobiles à Abidjan. Votre espace client est prêt&nbsp;: commandez en ligne, suivez vos achats et profitez de nos services showroom.</p>
          <p style="margin:0 0 10px;font-weight:600;color:#14171c">Avec votre compte, vous pouvez&nbsp;:</p>
          <ul style="margin:0 0 20px;padding-left:18px;color:#444">${avantages}</ul>
          <p style="margin:0 0 8px;font-size:14px;color:#666">Phares, jantes, mécanique, électronique, tuning — toutes marques (Toyota, Mercedes, BMW, Hyundai…).</p>
        </td></tr>
        ${parrainBlock ? `<tr><td style="padding:0 32px;font-family:system-ui,sans-serif">${parrainBlock}</td></tr>` : ''}
        ${boutons.length ? `<tr><td style="padding:8px 32px 24px">${boutons.join('')}</td></tr>` : ''}
        <tr><td style="padding:0 32px 28px;font-family:system-ui,sans-serif;font-size:13px;color:#777;line-height:1.5">
          <p style="margin:0">Une question&nbsp;? Répondez à cet e-mail ou rendez-vous en boutique — notre équipe vous conseille sur le choix et la pose des pièces.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f7f8fa;border-top:1px solid #eceef2;font-family:system-ui,sans-serif;font-size:12px;color:#999;line-height:1.5">
          MAJOR AUTO PARTS · Abidjan, Côte d’Ivoire<br/>
          www.majorautoparts.shop · E-mail automatique, merci de ne pas transférer vos identifiants.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderShopEmailHtml(
  template: ShopEmailTemplate,
  context: Record<string, string>,
): string {
  if (template === 'bienvenue_compte') {
    return renderBienvenueCompteHtml(context);
  }

  const ref = esc(context.reference ?? context.commandeId?.slice(0, 8) ?? '—');
  const montant = esc(context.montant ?? '');
  const suivi = context.suiviUrl ? esc(context.suiviUrl) : '';
  const avis = context.avisUrl ? esc(context.avisUrl) : '';
  const message = esc(context.message ?? '');
  const articles = esc(context.articles ?? '');

  const lines: string[] = [
    `<p style="margin:0 0 12px;font-family:system-ui,sans-serif;color:#111">MAJOR AUTO PARTS</p>`,
    `<h1 style="margin:0 0 16px;font-size:20px;font-family:system-ui,sans-serif">${esc(SUBJECTS[template])}</h1>`,
  ];

  if (!SANS_REF_COMMANDE.has(template)) {
    lines.push(
      `<p style="margin:0 0 8px;font-family:system-ui,sans-serif;color:#333">Réf. <strong>${ref}</strong>${montant ? ` · ${montant} FCFA` : ''}</p>`,
    );
  }

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
      if (context.temporaryPassword) {
        lines.push(
          `<p style="margin:12px 0;font-family:system-ui,sans-serif;color:#333">Mot de passe temporaire : <strong>${esc(context.temporaryPassword)}</strong></p>`,
          `<p style="margin:8px 0;font-family:system-ui,sans-serif;color:#555;font-size:14px">Connectez-vous puis changez-le depuis Mon compte dès que possible.</p>`,
        );
        if (context.compteUrl) {
          lines.push(
            `<p style="margin:20px 0"><a href="${esc(context.compteUrl)}" style="background:#111;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-family:system-ui,sans-serif">Se connecter</a></p>`,
          );
        }
      } else if (context.resetUrl) {
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
      'MAJOR AUTO PARTS <majorautoparts@prodestic.net>'
    );
  }

  async envoyer(
    to: string,
    template: ShopEmailTemplate,
    context: Record<string, string>,
  ): Promise<void> {
    if (!to?.includes('@')) return;

    const subject = SUBJECTS[template] ?? template;
    const html = renderShopEmailHtml(template, context);
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
