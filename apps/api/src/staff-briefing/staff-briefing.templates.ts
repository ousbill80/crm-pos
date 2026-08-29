import { RoleLibelle } from '@caisse-crm/shared';
import {
  astucesShop,
  classementBoutiques,
  chargesAffichees,
  formatFcfa,
  messageRelance,
  partCa,
  pointsAttentionVentes,
  produitsAffiches,
  type SnapshotCloture,
  type SnapshotFinance,
  type SnapshotGl,
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

function logoMajor(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
    <tr><td align="center" style="padding:8px 0 12px;border-bottom:1px solid #eee">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;letter-spacing:.08em;color:#b8921f;line-height:1">MAJOR</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;font-weight:500;letter-spacing:.34em;color:#14171c;margin-top:6px">AUTO PARTS</div>
    </td></tr>
  </table>`;
}

function cadre(title: string, inner: string, liens: LiensBriefing): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Georgia,system-ui,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#fff">
    ${logoMajor()}
    <p style="margin:0 0 8px;letter-spacing:.12em;font-size:11px;color:#888">MAJOR AUTO PARTS · CONFIDENTIEL</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#14171c">${esc(title)}</h1>
    ${inner}
    <p style="margin:28px 0 8px">
      <a href="${esc(liens.crm)}" style="background:#14171c;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Ouvrir le CRM</a>
    </p>
    <p style="font-size:12px;color:#888;margin-top:24px">
      E-mail automatique, agrégats uniquement — aucun mot de passe, aucun jeton, aucune fiche client.
      Ne pas transférer hors Direction / DAF / RAF. Lien : ${esc(liens.crm)}
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
  cloture?: SnapshotCloture,
): BriefingHtml {
  const objet = `Récap ventes ${s.periodeLabel} — ${formatFcfa(s.caReseau)}`;
  const intro =
    role === RoleLibelle.DAF
      ? `${prenom}, synthèse encaissements du jour (POS + web) pour le pôle financier.`
      : `${prenom}, photographie du réseau ce soir — CA magasin, web, points d’attention.`;
  const blocCloture = cloture ? htmlDisciplineCloture(cloture) : '';
  const html = cadre(
    `Récapitulatif du ${s.periodeLabel}`,
    `<p>${esc(intro)}</p>
     <p style="font-size:28px;margin:16px 0 4px;font-weight:700">${esc(formatFcfa(s.caReseau))}</p>
     <p style="color:#555;margin:0 0 16px">${s.tickets} ticket(s) magasin · ${s.commandesWeb} commande(s) web (${esc(formatFcfa(s.caWeb))})</p>
     ${tableauBoutiques(s)}
     ${liste(pointsAttentionVentes(s))}
     ${blocCloture}`,
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

function htmlDisciplineCloture(c: SnapshotCloture): string {
  const rows = c.parBoutique
    .map(
      (b) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(b.nom)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#1a7f37">${b.fermeesOk}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${b.fermeesSansTemoin}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:${b.encoreOuvertes ? '#b42318' : '#1a7f37'}">${b.encoreOuvertes}</td></tr>`,
    )
    .join('');
  const retards = c.enRetard.map(
    (s) =>
      `${s.boutiqueNom} · ${s.caisseLibelle} — ouverte depuis ${s.ouvertureDateHeure.toISOString().slice(11, 16)} UTC, non clôturée.`,
  );
  return `<h2 style="font-size:16px;color:#14171c">Clôture de caisse après service (${c.heureFinService}h Abidjan)</h2>
    <p style="font-size:13px;color:#555">Une clôture conforme = session fermée avec témoin ré-authentifié (§5.1). Classement : boutiques qui ferment bien en tête.</p>
    ${
      rows
        ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:#666"><th style="padding:6px 8px">Magasin</th><th style="padding:6px 8px;text-align:right">Clôturées OK</th><th style="padding:6px 8px;text-align:right">Sans témoin</th><th style="padding:6px 8px;text-align:right">Encore ouvertes</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<p style="color:#555">Aucune session POS sur la période.</p>`
    }
    ${liste(retards)}`;
}

export function renderCloture(
  role: RoleLibelle,
  prenom: string,
  c: SnapshotCloture,
  liens: LiensBriefing,
): BriefingHtml {
  const n = c.enRetard.length;
  const objet =
    n === 1
      ? `Alerte clôture : 1 caisse encore ouverte après ${c.heureFinService}h`
      : `Alerte clôture : ${n} caisses encore ouvertes après ${c.heureFinService}h`;
  const pourquoi =
    role === RoleLibelle.RAF_COMPTABLE
      ? 'Sans clôture Z, le bordereau espèces n’entre pas dans le grand livre (§5.1 → §6.4). À tracer dès demain matin.'
      : role === RoleLibelle.DAF
        ? 'Les espèces restent dans le tiroir boutique. Le versement magasin → centrale ne peut pas démarrer tant que la session n’est pas fermée.'
        : 'Après le service, chaque tiroir doit être clôturé (comptage + témoin). Voici qui le fait bien, et qui laisse la caisse ouverte.';
  const html = cadre(
    objet,
    `<p>${esc(prenom)}, ${esc(pourquoi)}</p>
     ${htmlDisciplineCloture(c)}
     <p style="font-size:13px;color:#666">Alerte immédiate — un nouvel e-mail part si une autre session reste ouverte.</p>`,
    liens,
  );
  const text = [
    objet,
    pourquoi,
    ...c.enRetard.map((s) => `NON CLÔTURÉE: ${s.boutiqueNom} (${s.caisseLibelle})`),
    ...c.bienFermees.map((s) => `OK: ${s.boutiqueNom} (${s.caisseLibelle})`),
    liens.crm,
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
  gl: SnapshotGl,
  liens: LiensBriefing,
): BriefingHtml {
  const periode = type === 'HEBDO' ? 'semaine' : 'mois';
  const titre = `État exécutif financier — ${periode}`;
  const produits = produitsAffiches(gl);
  const charges = chargesAffichees(gl);
  const objet = `${titre} — résultat ${formatFcfa(gl.resultat)}`;
  const focus =
    role === RoleLibelle.RAF_COMPTABLE
      ? 'Lecture RAF : compte de résultat (classes 6 / 7), détail des charges, file d’écritures. Saisie et comptabilisation — pas de paiement, pas de validation de caisse.'
      : role === RoleLibelle.DAF
        ? 'Lecture DAF : produits, charges 6xx, résultat, file de versements et lots à approuver. Grand livre uniquement, aucun solde saisi à la main.'
        : 'Lecture Direction : résultat réseau, charges, trésorerie magasin → centrale — sans valider une caisse (§6.4).';
  const ligneFile = (lib: string, row: { n: number; montant: number }) =>
    `${lib} : ${row.n} (${formatFcfa(row.montant)})`;
  const couleurResultat = gl.benefice ? '#1a7f37' : '#b42318';
  const libResultat = gl.benefice ? 'Bénéfice de période' : 'Perte de période';
  const postesRows = gl.postesCharges
    .map(
      (p) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(p.libelle)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(formatFcfa(p.montant))}</td></tr>`,
    )
    .join('');
  const detailRows = gl.detailCharges
    .map(
      (c) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(c.numero)} ${esc(c.intitule)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(formatFcfa(c.montant))}</td></tr>`,
    )
    .join('');
  const html = cadre(
    `${titre} (${ventes.periodeLabel})`,
    `<p>${esc(prenom)}, ${esc(focus)}</p>
     <p style="font-size:13px;color:#555;margin:0 0 16px">SYSCOHADA — produits classe 7, charges classe 6, soldes recalculés depuis le grand livre. Pas une liasse de dépôt légal.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
       <tr>
         <td style="padding:12px;background:#faf8f1;width:33%"><div style="font-size:11px;color:#888;letter-spacing:.08em">PRODUITS</div><div style="font-size:18px;font-weight:700;color:#14171c">${esc(formatFcfa(produits))}</div></td>
         <td style="padding:12px;background:#faf6f4;width:33%"><div style="font-size:11px;color:#888;letter-spacing:.08em">CHARGES</div><div style="font-size:18px;font-weight:700;color:#14171c">${esc(formatFcfa(charges))}</div></td>
         <td style="padding:12px;background:#f4f4f5;width:33%"><div style="font-size:11px;color:#888;letter-spacing:.08em">${esc(libResultat.toUpperCase())}</div><div style="font-size:18px;font-weight:700;color:${couleurResultat}">${esc(formatFcfa(gl.resultat))}</div></td>
       </tr>
     </table>
     <h2 style="font-size:16px;color:#14171c">1. Ventes (encaissements POS + web)</h2>
     <p><strong>${esc(formatFcfa(ventes.caReseau))}</strong> · ${ventes.tickets} ticket(s) magasin · web ${esc(formatFcfa(ventes.caWeb))} (${ventes.commandesWeb} cmd)</p>
     ${tableauBoutiques(ventes)}
     <h2 style="font-size:16px;color:#14171c">2. Dépenses / charges d’exploitation (classe 6)</h2>
     ${
       postesRows
         ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:#666"><th style="padding:6px 8px">Poste SYSCOHADA</th><th style="padding:6px 8px;text-align:right">Montant</th></tr></thead><tbody>${postesRows}</tbody></table>`
         : `<p style="color:#555">Aucune charge classe 6 comptabilisée sur la période.</p>`
     }
     ${
       detailRows
         ? `<p style="font-size:13px;color:#666;margin:12px 0 4px">Détail par compte</p><table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${detailRows}</tbody></table>`
         : ''
     }
     <p style="margin-top:12px"><strong>Total charges ${esc(formatFcfa(charges))}</strong></p>
     <h2 style="font-size:16px;color:#14171c">3. Trésorerie magasin → centrale (§6.4)</h2>
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
     <h2 style="font-size:16px;color:#14171c">4. Stocks &amp; dettes d’exploitation</h2>
     <p>Valorisation stock ${esc(formatFcfa(stocks.valeurStock))} · ${stocks.ruptures} rupture(s) · ${stocks.sousSeuil} sous seuil.</p>
     ${liste([
       gl.facturesFournisseurOuvertes > 0
         ? `${gl.facturesFournisseurOuvertes} facture(s) fournisseur ouvertes · ${formatFcfa(gl.montantFacturesOuvertes)}.`
         : 'Aucune facture fournisseur ouverte (comptabilisée / partiellement payée).',
       gl.lotsPaiementAApprouver > 0
         ? `${gl.lotsPaiementAApprouver} lot(s) de paiement en attente d’approbation DAF.`
         : 'Aucun lot de paiement en attente DAF.',
       gl.fileAttente + gl.fileErreur > 0
         ? `File d’écritures : ${gl.fileAttente} en attente · ${gl.fileErreur} en erreur.`
         : 'File d’écritures vide.',
     ])}
     ${liste(pointsAttentionVentes(ventes))}`,
    liens,
  );
  const text = [
    objet,
    focus,
    `Produits ${formatFcfa(produits)} | Charges ${formatFcfa(charges)} | Résultat ${formatFcfa(gl.resultat)}`,
    `CA magasin ${formatFcfa(ventes.caReseau)} | stock ${formatFcfa(stocks.valeurStock)}`,
    ...gl.postesCharges.map((p) => `${p.libelle}: ${formatFcfa(p.montant)}`),
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
    gl?: SnapshotGl;
    shop?: SnapshotShop;
    cloture?: SnapshotCloture;
    heuresSansConnexion?: number;
    liens: LiensBriefing;
  },
): BriefingHtml {
  if (type === 'SOIR' && ctx.ventes) {
    return renderSoir(role, prenom, ctx.ventes, ctx.liens, ctx.cloture);
  }
  if ((type === 'HEBDO' || type === 'MOIS') && ctx.ventes && ctx.stocks && ctx.finance && ctx.gl) {
    return renderExecutif(
      type,
      role,
      prenom,
      ctx.ventes,
      ctx.stocks,
      ctx.finance,
      ctx.gl,
      ctx.liens,
    );
  }
  if (type === 'RELANCE_CONNEXION') {
    return renderRelance(role, prenom, ctx.heuresSansConnexion ?? 48, ctx.liens);
  }
  if (type === 'SHOP_INACTIF' && ctx.shop) {
    return renderShopInactif(role, prenom, ctx.shop, ctx.liens);
  }
  if (type === 'CLOTURE_CAISSE' && ctx.cloture) {
    return renderCloture(role, prenom, ctx.cloture, ctx.liens);
  }
  throw new Error(`Briefing incomplet: ${type}`);
}
