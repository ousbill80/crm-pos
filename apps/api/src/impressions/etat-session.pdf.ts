import {
  bandeauRapport,
  enTeteSociete,
  fmtDatePdf,
  fmtFcfaPdf,
  kpiRangee,
  MODE_PAIEMENT_PDF,
  sectionRapport,
  tableauPdf,
} from './pdf.util';

function heureCourte(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function libellePaiementEtat(v: EtatSessionPdfInput['ventes'][number]): string {
  const parts =
    v.paiements.length > 0
      ? v.paiements
      : [{ modePaiement: v.modePaiement, montant: v.montantTotal }];
  if (parts.length === 1) {
    return MODE_PAIEMENT_PDF[parts[0].modePaiement] ?? parts[0].modePaiement;
  }
  return parts
    .map((p) => MODE_PAIEMENT_PDF[p.modePaiement] ?? p.modePaiement)
    .join('+');
}

export type TypeEtatSession = 'X' | 'Z';

export interface EtatSessionPdfInput {
  typeEtat: TypeEtatSession;
  sessionId: string;
  statut: string;
  ouvertureDateHeure: Date;
  clotureDateHeure: Date | null;
  caisseLibelle: string;
  boutiqueNom: string | null;
  ouvreur: string | null;
  temoinOuverture: string | null;
  clotureur: string | null;
  temoinCloture: string | null;
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null;
  releve: Array<{
    modePaiement: string;
    total: string;
    nombreVentes: number;
  }>;
  ventes: Array<{
    id: string;
    dateVente: Date;
    montantTotal: string;
    modePaiement: string;
    paiements: Array<{ modePaiement: string; montant: string }>;
    nbLignes: number;
  }>;
  nombreVentes: number;
  fondInitial: string;
  totalEspecesNet: string;
  fondTheorique: string;
  fondCompteCloture: string | null;
  ecart: string | null;
  imprimeAt: Date;
}

/** État X (session ouverte) ou Z (session fermée) — §6.3.4. */
export function dessinerEtatSession(
  doc: PDFKit.PDFDocument,
  data: EtatSessionPdfInput,
): void {
  const titre =
    data.typeEtat === 'Z'
      ? 'Relevé de clôture — session fermée'
      : 'Relevé de contrôle — session encore ouverte';
  const totalCa = data.releve.reduce((s, l) => s + Number(l.total), 0);
  const sessionCourt = data.sessionId.slice(0, 8).toUpperCase();
  const jour = fmtDatePdf(data.ouvertureDateHeure);

  enTeteSociete(doc, data.societe);
  bandeauRapport(doc, titre, [
    `${data.boutiqueNom ?? 'Boutique'}  ·  ${data.caisseLibelle}  ·  ${jour}`,
    data.typeEtat === 'Z'
      ? 'La caisse est fermée. Ces totaux sont ceux de la fin de poste. L’écart tiroir est informatif.'
      : 'La caisse est encore ouverte. Aperçu des ventes en cours : ce document ne ferme pas le tiroir.',
  ]);

  kpiRangee(doc, [
    { label: 'CA du jour', valeur: fmtFcfaPdf(totalCa) },
    { label: 'Tickets', valeur: String(data.nombreVentes) },
    { label: 'Fond théorique', valeur: fmtFcfaPdf(data.fondTheorique) },
    data.typeEtat === 'Z'
      ? {
          label: 'Écart tiroir',
          valeur: fmtFcfaPdf(data.ecart),
          accent:
            data.ecart && Number(data.ecart) !== 0
              ? Number(data.ecart) > 0
                ? 'warn'
                : 'danger'
              : 'ok',
        }
      : { label: 'Fond initial', valeur: fmtFcfaPdf(data.fondInitial) },
  ]);

  sectionRapport(doc, 'Session');
  doc.font('Helvetica').fontSize(9);
  doc.text(
    `Ouverture : ${fmtDatePdf(data.ouvertureDateHeure)}  ·  ${data.ouvreur ?? '—'}`,
  );
  doc.text(`Témoin ouverture : ${data.temoinOuverture ?? '—'}`);
  if (data.typeEtat === 'Z') {
    doc.text(
      `Clôture : ${fmtDatePdf(data.clotureDateHeure)}  ·  ${data.clotureur ?? '—'}`,
    );
    doc.text(`Témoin clôture : ${data.temoinCloture ?? '—'}`);
  }
  doc.text(`Réf. session ${sessionCourt}`);
  doc.moveDown(0.5);

  sectionRapport(doc, 'Journal des ventes');
  tableauPdf(
    doc,
    [
      { header: 'Heure', width: 70 },
      { header: 'Ticket', width: 80 },
      { header: 'Lignes', width: 55, align: 'right' },
      { header: 'Paiement', width: 154 },
      { header: 'Montant', width: 140, align: 'right' },
    ],
    data.ventes.map((v) => [
      heureCourte(v.dateVente),
      v.id.slice(0, 8).toUpperCase(),
      String(v.nbLignes),
      libellePaiementEtat(v),
      fmtFcfaPdf(v.montantTotal),
    ]),
    {
      empty: 'Aucune vente sur cette session.',
      pied: ['Total', String(data.nombreVentes), '', '', fmtFcfaPdf(totalCa)],
    },
  );

  sectionRapport(doc, 'Répartition par mode de paiement');
  tableauPdf(
    doc,
    [
      { header: 'Mode', width: 219 },
      { header: 'Tickets', width: 100, align: 'right' },
      { header: 'Montant', width: 180, align: 'right' },
    ],
    data.releve.map((l) => [
      MODE_PAIEMENT_PDF[l.modePaiement] ?? l.modePaiement,
      String(l.nombreVentes),
      fmtFcfaPdf(l.total),
    ]),
    {
      empty: 'Aucune vente sur cette session.',
      pied: ['Total', String(data.nombreVentes), fmtFcfaPdf(totalCa)],
    },
  );

  sectionRapport(doc, 'Tiroir espèces');
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 319 },
      { header: 'Montant', width: 180, align: 'right' },
    ],
    [
      ['Fond initial', fmtFcfaPdf(data.fondInitial)],
      ['Espèces nettes (ventes − retours)', fmtFcfaPdf(data.totalEspecesNet)],
      ['Fond théorique', fmtFcfaPdf(data.fondTheorique)],
      ...(data.typeEtat === 'Z'
        ? [
            ['Fond compté', fmtFcfaPdf(data.fondCompteCloture)],
            ['Écart (compté − théorique)', fmtFcfaPdf(data.ecart)],
          ]
        : []),
    ],
  );
  if (data.typeEtat === 'Z') {
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(
      'L’écart de clôture est informatif sur ce relevé ; il ne crée pas de litige §6.4 à lui seul.',
      { width: 499 },
    );
  }
}
