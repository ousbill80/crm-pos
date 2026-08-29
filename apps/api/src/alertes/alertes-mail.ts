function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type LigneAlerteFonds = {
  boutique: string;
  montant: string;
  etape: string;
  age: string;
};

export type MailAlerteFonds = {
  objet: string;
  text: string;
  html: string;
};

function cadre(title: string, inner: string, ctaUrl: string, ctaLabel: string): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Georgia,system-ui,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#fff">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
      <tr><td align="center" style="padding:8px 0 12px;border-bottom:1px solid #eee">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;letter-spacing:.08em;color:#b8921f;line-height:1">MAJOR</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;font-weight:500;letter-spacing:.34em;color:#14171c;margin-top:6px">AUTO PARTS</div>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;letter-spacing:.12em;font-size:11px;color:#888">TRÉSORERIE · ALERTE FONDS</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#14171c">${esc(title)}</h1>
    ${inner}
    <p style="margin:28px 0 8px">
      <a href="${esc(ctaUrl)}" style="background:#14171c;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">${esc(ctaLabel)}</a>
    </p>
    <p style="font-size:12px;color:#888;margin-top:24px">
      E-mail automatique §6.7 — versement non transmis / réception DAF. Ne contient aucun mot de passe.
    </p>
  </div>
</body></html>`;
}

function tableau(lignes: LigneAlerteFonds[]): string {
  if (lignes.length === 0) {
    return '<p style="color:#555">Aucune ligne.</p>';
  }
  const rows = lignes
    .map(
      (l) => `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(l.boutique)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${esc(l.montant)} FCFA</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(l.etape)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#666">${esc(l.age)}</td>
    </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
    <thead><tr style="background:#f7f4ea;color:#14171c">
      <th align="left" style="padding:8px 10px">Boutique</th>
      <th align="right" style="padding:8px 10px">Montant</th>
      <th align="left" style="padding:8px 10px">Étape</th>
      <th align="left" style="padding:8px 10px">Délai</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderMailPointNonVerse(opts: {
  boutique: string;
  montant: string;
  ageHeures: number;
  ctaUrl: string;
}): MailAlerteFonds {
  const objet = `Fonds du jour non transférés — ${opts.boutique}`;
  const intro = `La journée est clôturée mais le point du jour (${opts.montant} FCFA) n’a pas été transféré vers la trésorerie principale (${opts.ageHeures} h). Initiez le versement ; la réception est réservée au DAF / Caissier central.`;
  return {
    objet,
    text: intro,
    html: cadre(
      objet,
      `<p style="color:#333;line-height:1.5">${esc(intro)}</p>
       ${tableau([{ boutique: opts.boutique, montant: opts.montant, etape: 'Non transféré', age: `${opts.ageHeures} h` }])}`,
      opts.ctaUrl,
      'Ouvrir le POS',
    ),
  };
}

export function renderMailReceptionDaf(opts: {
  boutique: string;
  montant: string;
  ctaUrl: string;
}): MailAlerteFonds {
  const objet = `Réception DAF — fonds en transit (${opts.boutique})`;
  const intro = `Un versement de ${opts.montant} FCFA est en transit depuis ${opts.boutique}. Réception et rapprochement : DAF ou Caissier central uniquement (§6.4).`;
  return {
    objet,
    text: intro,
    html: cadre(
      objet,
      `<p style="color:#333;line-height:1.5">${esc(intro)}</p>
       ${tableau([{ boutique: opts.boutique, montant: opts.montant, etape: 'En transit — à réceptionner', age: 'immédiat' }])}`,
      opts.ctaUrl,
      'Réceptionner',
    ),
  };
}

export function renderMailDigestDaf(opts: {
  nonTransferes: LigneAlerteFonds[];
  aReceptionner: LigneAlerteFonds[];
  ctaUrl: string;
}): MailAlerteFonds {
  const n = opts.nonTransferes.length + opts.aReceptionner.length;
  const objet = `Alerte fonds — ${n} point(s) à sécuriser`;
  const blocs: string[] = [];
  const textParts: string[] = [`Alerte trésorerie : ${n} dossier(s).`];
  if (opts.nonTransferes.length > 0) {
    blocs.push(
      `<h2 style="font-size:16px;margin:20px 0 8px">Non transférés vers la centrale</h2>
       <p style="color:#555;margin:0 0 8px">Journées clôturées, point du jour encore en boutique.</p>
       ${tableau(opts.nonTransferes)}`,
    );
    textParts.push(
      'Non transférés :',
      ...opts.nonTransferes.map(
        (l) => `- ${l.boutique} : ${l.montant} FCFA (${l.etape}, ${l.age})`,
      ),
    );
  }
  if (opts.aReceptionner.length > 0) {
    blocs.push(
      `<h2 style="font-size:16px;margin:20px 0 8px">En attente de réception DAF</h2>
       <p style="color:#555;margin:0 0 8px">Fonds en transit — à réceptionner puis rapprocher.</p>
       ${tableau(opts.aReceptionner)}`,
    );
    textParts.push(
      'À réceptionner :',
      ...opts.aReceptionner.map(
        (l) => `- ${l.boutique} : ${l.montant} FCFA (${l.etape}, ${l.age})`,
      ),
    );
  }
  return {
    objet,
    text: textParts.join('\n'),
    html: cadre(objet, blocs.join(''), opts.ctaUrl, 'Ouvrir la réception centrale'),
  };
}
