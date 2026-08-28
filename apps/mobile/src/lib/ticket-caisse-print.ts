import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { ENSEIGNE, ModePaiement } from '@caisse-crm/shared';
import { formatFcfa } from '../circuit/actions';
import { MODES_POS } from '../pos-panier';
import type { TicketVenteData } from '../components/PosTicketRecu';

export interface SocieteTicket {
  raisonSociale?: string | null;
  adresse?: string | null;
  telephone?: string | null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelMode(mode: string): string {
  return MODES_POS.find((m) => m.mode === mode)?.label ?? mode;
}

/**
 * HTML ticket thermique (~72 mm) — impression isolée, hors chrome app.
 */
export function buildTicketCaisseHtml(params: {
  ticket: TicketVenteData;
  boutiqueNom?: string | null;
  caissier?: string | null;
  clientLabel?: string | null;
  societe?: SocieteTicket | null;
}): string {
  const { ticket, boutiqueNom, caissier, clientLabel, societe } = params;
  const parts =
    ticket.paiements && ticket.paiements.length > 0
      ? ticket.paiements
      : [
          {
            modePaiement: ticket.modePaiement || ModePaiement.ESPECES,
            montant: ticket.montantTotal,
          },
        ];

  const lignes = ticket.lignes
    .map((l) => {
      const remise = Number(l.remise) || 0;
      const montant = Number(l.prixUnitaire) * l.quantite - remise;
      const pu = Number(l.prixUnitaire);
      return `
      <tr>
        <td>
          <div class="nom">${esc(l.produit.designation)}</div>
          <div class="detail">${l.quantite} × ${esc(formatFcfa(pu))}${
            remise > 0 ? ` · remise −${esc(formatFcfa(remise))}` : ''
          }</div>
        </td>
        <td class="num">${esc(formatFcfa(montant))}</td>
      </tr>`;
    })
    .join('');

  const paiementsHtml =
    parts.length > 1
      ? `<table class="pay">${parts
          .map(
            (p) =>
              `<tr><td>${esc(labelMode(p.modePaiement))}</td><td class="num">${esc(
                formatFcfa(p.montant),
              )}</td></tr>`,
          )
          .join('')}</table>`
      : `<p class="pay-one">${esc(
          labelMode(parts[0]?.modePaiement ?? ModePaiement.ESPECES),
        )}</p>`;

  const cashHtml =
    ticket.montantRecu != null && ticket.montantRecu > 0
      ? `<table class="pay">
          <tr><td>Reçu (espèces)</td><td class="num">${esc(formatFcfa(ticket.montantRecu))}</td></tr>
          <tr><td><strong>Monnaie</strong></td><td class="num"><strong>${esc(
            formatFcfa(Math.max(0, ticket.monnaie ?? 0)),
          )}</strong></td></tr>
        </table>`
      : '';

  const date = new Date(ticket.dateVente).toLocaleString('fr-FR');
  const idCourt = ticket.id.slice(0, 8).toUpperCase();

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${esc(idCourt)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap"
    rel="stylesheet"
  />
  <style>
    @page { size: 72mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: "Courier New", Courier, ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ticket {
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 3mm 8mm;
    }
    .center { text-align: center; }
    .logo { text-align: center; line-height: 1; margin: 0 0 6px; }
    .logo-major {
      display: block;
      font-family: "Bebas Neue", Impact, "Arial Narrow", sans-serif;
      font-size: 28px;
      letter-spacing: 0.12em;
      color: #000;
    }
    .logo-auto {
      display: block;
      font-family: "Bebas Neue", Impact, "Arial Narrow", sans-serif;
      font-size: 12px;
      letter-spacing: 0.32em;
      color: #000;
      margin-top: 3px;
    }
    .shop { font-weight: 700; margin-top: 2px; }
    .addr { font-size: 11px; color: #222; margin: 1px 0; }
    .rule {
      border: none;
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .meta { font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 3px 0; }
    td.num { text-align: right; white-space: nowrap; font-weight: 700; }
    .nom { font-weight: 700; }
    .detail { font-size: 10px; color: #333; }
    .pay-one { margin: 4px 0; }
    .total {
      text-align: center;
      font-size: 16px;
      font-weight: 800;
      margin: 8px 0 4px;
    }
    .thanks {
      text-align: center;
      font-size: 11px;
      margin-top: 10px;
      font-style: italic;
    }
    .offline {
      text-align: center;
      font-size: 10px;
      margin-top: 6px;
      border: 1px solid #000;
      padding: 4px;
    }
    @media screen {
      body { background: #e8e8e8; padding: 16px; }
      .ticket {
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,.15);
      }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="logo" aria-label="${esc(ENSEIGNE.nom)}">
      <span class="logo-major">${esc(ENSEIGNE.ligne1)}</span>
      <span class="logo-auto">${esc(ENSEIGNE.ligne2)}</span>
    </div>
    ${boutiqueNom ? `<div class="center shop">${esc(boutiqueNom)}</div>` : ''}
    ${
      societe?.adresse
        ? `<div class="center addr">${esc(societe.adresse)}</div>`
        : ''
    }
    ${
      societe?.telephone
        ? `<div class="center addr">Tél. ${esc(societe.telephone)}</div>`
        : ''
    }
    <hr class="rule" />
    <div class="center"><strong>TICKET ${esc(idCourt)}</strong></div>
    <div class="center meta">${esc(date)}</div>
    ${caissier ? `<div class="center meta">Caissier : ${esc(caissier)}</div>` : ''}
    <hr class="rule" />
    <table>${lignes}</table>
    <hr class="rule" />
    ${
      clientLabel
        ? `<div class="meta">Client : ${esc(clientLabel)}</div>`
        : ''
    }
    ${paiementsHtml}
    <div class="total">${esc(formatFcfa(ticket.montantTotal))} FCFA</div>
    ${cashHtml}
    <div class="thanks">Merci de votre visite</div>
    ${
      ticket.offline
        ? `<div class="offline">Hors ligne — sync à la reconnexion</div>`
        : ''
    }
  </div>
</body>
</html>`;
}

/**
 * Impression ticket caisse : document HTML thermique.
 * Web : fenêtre d'impression dédiée. Natif (Android/iOS) : dialogue
 * d'impression OS natif via `expo-print`, à partir du même HTML.
 */
export async function imprimerTicketCaisse(params: {
  ticket: TicketVenteData;
  boutiqueNom?: string | null;
  caissier?: string | null;
  clientLabel?: string | null;
  societe?: SocieteTicket | null;
}): Promise<void> {
  const html = buildTicketCaisseHtml(params);

  if (Platform.OS !== 'web') {
    try {
      await Print.printAsync({ html });
    } catch (err) {
      throw new Error(
        err instanceof Error && err.message
          ? `Impression du ticket impossible : ${err.message}`
          : 'Impression du ticket impossible.',
      );
    }
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }
  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    const run = () => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    };
    w.addEventListener('load', run);
    window.setTimeout(run, 250);
    return;
  }
  // Fallback iframe si popup bloquée
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* ignore */
        }
      }, 1000);
    }
  }, 200);
}
