import { RoleLibelle } from '@caisse-crm/shared';
import {
  astucesShop,
  classementBoutiques,
  formatFcfa,
  messageRelance,
  partCa,
  pointsAttentionVentes,
  type SnapshotFinance,
  type SnapshotShop,
  type SnapshotStocks,
  type SnapshotVentes,
  type TypeBriefing,
} from './staff-briefing.engine';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type LiensBriefing = {
  crm: string;
  shop: string;
  dashboard: string;
  finance: string;
  croissance: string;
};

export type BriefingHtml = {
  objet: string;
  text: string;
  html: string;
};

function cadre(title: string, inner: string, liens: LiensBriefing): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <p style="margin:0 0 8px;letter-spacing:.12em;font-size:11px;color:#888">MAJOR AUTO PARTS · CONFIDENTIEL</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#111">${esc(title)}</h1>
    ${inner}
    <p style="margin:28px 0 8px">
      <a href="${esc(liens.crm)}" style="background:#111;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Ouvrir le CRM</a>
    </p>
    <p style="font-size:12px;color:#888;margin-top:24px">
      E-mail automatique, agrégats uniquement — aucun mot de passe, aucun jeton, aucune fiche client.
      Ne pas transférer hors Direction / DAF / SI. Lien : ${esc(liens.crm)}
    </p>
  </div>
</body></html>`;
}

function liste(items: string[]): string {
  if (items.length === 0) return '';
  return `<ul style="padding-left:18px;color:#222">${items.map((i) => `<li style="margin:6px 0">${esc(i)}</li>`).join('')}</ul>`;
}

function tableauBoutiques(s: SnapshotVentes): string {
  const rows = classementBoutiques(s.parBoutique);
  if (rows.length === 0) {
    return `<p style="color:#555">Aucun ticket magasin sur la période.</p>`;
  }
  const body = rows
    .map(
      (b) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(b.nom)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(formatFcfa(b.ca))}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${b.tickets}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${partCa(b.ca, s.caReseau)} %</td></tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:#666"><th style="padding:6px 8px">Magasin</th><th style="padding:6px 8px;text-align:right">CA</th><th style="padding:6px 8px;text-align:right">Tickets</th><th style="padding:6px 8px;text-align:right">Part</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function renderSoir(
  role: RoleLibelle,
  prenom: string,
  s: SnapshotVentes,
  liens: LiensBriefing,
): BriefingHtml {
  const objet = `Récap ventes ${s.periodeLabel} — ${formatFcfa(s.caReseau)}`;
  const intro =
    role === RoleLibelle.DAF
      ? `${prenom}, synthèse encaissements du jour (POS + web) pour le pôle financier.`
      : `${prenom}, photographie du réseau ce soir — CA magasin, web, points d’attention.`;
  const html = cadre(
    `Récapitulatif du ${s.periodeLabel}`,
    `<p>${esc(intro)}</p>
     <p style="font-size:28px;margin:16px 0 4px;font-weight:700">${esc(formatFcfa(s.caReseau))}</p>
     <p style="color:#555;margin:0 0 16px">${s.tickets} ticket(s) magasin · ${s.commandesWeb} commande(s) web (${esc(formatFcfa(s.caWeb))})</p>
     ${tableauBoutiques(s)}
     ${liste(pointsAttentionVentes(s))}`,
    liens,
  );
  const text = [
    objet,
    intro,
    `CA réseau ${formatFcfa(s.caReseau)} / ${s.tickets} tickets / web ${formatFcfa(s.caWeb)}`,
    ...classementBoutiques(s.parBoutique).map(
      (b) => `${b.nom}: ${formatFcfa(b.ca)} (${b.tickets} t.)`,
    ),
    ...pointsAttentionVentes(s),
    liens.dashboard,
  ].join('\n');
  return { objet, text, html };
}

export function renderExecutif(
  type: 'HEBDO' | 'MOIS',
  role: RoleLibelle,
  prenom: string,
  ventes: SnapshotVentes,
  stocks: SnapshotStocks,
  finance: SnapshotFinance,
  liens: LiensBriefing,
): BriefingHtml {
  const titre =
    type === 'HEBDO' ? 'État exécutif — semaine' : 'État exécutif — mois';
  const objet = `${titre} — CA ${formatFcfa(ventes.caReseau)}`;
  const focus =
    role === RoleLibelle.DAF
      ? 'Lecture DAF : ventes, file de versements (grand livre), valorisation stock. Aucun solde n’est saisi à la main.'
      : 'Lecture Direction : performance réseau, file trésorerie, santé stocks — sans valider une caisse (§6.4).';
  const ligneFile = (lib: string, row: { n: number; montant: number }) =>
    `${lib} : ${row.n} (${formatFcfa(row.montant)})`;
  const html = cadre(
    `${titre} (${ventes.periodeLabel})`,
    `<p>${esc(prenom)}, ${esc(focus)}</p>
     <h2 style="font-size:16px">Ventes</h2>
     <p><strong>${esc(formatFcfa(ventes.caReseau))}</strong> · ${ventes.tickets} tickets magasin · web ${esc(formatFcfa(ventes.caWeb))} (${ventes.commandesWeb} cmd)</p>
     ${tableauBoutiques(ventes)}
     <h2 style="font-size:16px">Situation financière — versements magasin → centrale</h2>
     <p style="font-size:13px;color:#555">Machine à états §6.4 — soldes recalculés, jamais stockés.</p>
     ${liste([
       ligneFile('Initiée', finance.initiee),
       ligneFile('En transit', finance.enTransit),
       ligneFile('Réceptionnée (en attente de validation)', finance.receptionnee),
       ligneFile('Validée sur la période', finance.valideePeriode),
       ligneFile('Litige ouvert', finance.litige),
       finance.versementsEnRetard > 0
         ? `${finance.versementsEnRetard} versement(s) hors délai configuré.`
         : 'Aucun versement hors délai.',
     ])}
     <h2 style="font-size:16px">Stocks</h2>
     <p>Valorisation ${esc(formatFcfa(stocks.valeurStock))} · ${stocks.ruptures} rupture(s) · ${stocks.sousSeuil} sous seuil de réappro.</p>
     ${liste(pointsAttentionVentes(ventes))}`,
    liens,
  );
  const text = [
    objet,
    focus,
    `CA ${formatFcfa(ventes.caReseau)} | stock ${formatFcfa(stocks.valeurStock)} | ruptures ${stocks.ruptures}`,
    ligneFile('Transit', finance.enTransit),
    ligneFile('Litige', finance.litige),
    liens.finance,
  ].join('\n');
  return { objet, text, html };
}

export function renderRelance(
  role: RoleLibelle,
  prenom: string,
  heures: number,
  liens: LiensBriefing,
): BriefingHtml {
  const m = messageRelance(role, heures);
  const html = cadre(
    m.objet,
    `<p>${esc(prenom)},</p><p>${esc(m.accroche)}</p><p>${esc(m.pourquoi)}</p>
     <p style="font-size:13px;color:#666">Aucun identifiant n’est inclus dans cet e-mail. Utilisez votre accès habituel.</p>`,
    liens,
  );
  return { objet: m.objet, text: `${prenom},\n${m.accroche}\n${m.pourquoi}\n${liens.crm}`, html };
}

export function renderShopInactif(
  role: RoleLibelle,
  prenom: string,
  shop: SnapshotShop,
  liens: LiensBriefing,
): BriefingHtml {
  const objet = shop.produitsVisibles === 0
    ? 'Boutique en ligne : catalogue non publié'
    : 'Boutique en ligne : aucune commande depuis 7 jours';
  const html = cadre(
    objet,
    `<p>${esc(prenom)}, le site e-commerce est actif mais ne produit pas encore de commandes utiles.</p>
     <p>Catalogue visible : <strong>${shop.produitsVisibles}</strong> · commandes 7 j : <strong>${shop.commandes7j}</strong> · sessions 7 j : <strong>${shop.sessions7j}</strong></p>
     <p>Le showroom en ligne n’est pas un site vitrine : c’est un canal d’encaissement (retrait / livraison, Wave, Orange Money, carte) branché sur le stock réseau.</p>
     ${liste(astucesShop(shop, role))}
     <p style="font-size:13px"><a href="${esc(liens.shop)}">${esc(liens.shop)}</a> · <a href="${esc(liens.croissance)}">Pilotage croissance</a></p>`,
    liens,
  );
  const text = [objet, ...astucesShop(shop, role), liens.shop].join('\n');
  return { objet, text, html };
}

export function renderBriefing(
  type: TypeBriefing,
  role: RoleLibelle,
  prenom: string,
  ctx: {
    ventes?: SnapshotVentes;
    stocks?: SnapshotStocks;
    finance?: SnapshotFinance;
    shop?: SnapshotShop;
    heuresSansConnexion?: number;
    liens: LiensBriefing;
  },
): BriefingHtml {
  if (type === 'SOIR' && ctx.ventes) {
    return renderSoir(role, prenom, ctx.ventes, ctx.liens);
  }
  if ((type === 'HEBDO' || type === 'MOIS') && ctx.ventes && ctx.stocks && ctx.finance) {
    return renderExecutif(
      type,
      role,
      prenom,
      ctx.ventes,
      ctx.stocks,
      ctx.finance,
      ctx.liens,
    );
  }
  if (type === 'RELANCE_CONNEXION') {
    return renderRelance(role, prenom, ctx.heuresSansConnexion ?? 48, ctx.liens);
  }
  if (type === 'SHOP_INACTIF' && ctx.shop) {
    return renderShopInactif(role, prenom, ctx.shop, ctx.liens);
  }
  throw new Error(`Briefing incomplet: ${type}`);
}
