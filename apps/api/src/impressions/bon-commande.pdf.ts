import {
  bandeauRapport,
  enTeteSociete,
  fmtDatePdf,
  fmtFcfaPdf,
  fmtJourPdf,
  fmtNombrePdf,
  kpiRangee,
  latiniserTextePdf,
  ligneKv,
  sectionRapport,
  tableauPdf,
} from './pdf.util';

export interface BonCommandePdfLigne {
  designation: string;
  reference: string | null;
  quantite: number;
  prixUnitaire: string;
  montant: string;
}

export interface BonCommandePdfInput {
  numero: string;
  statut: string;
  devise: string;
  proformaReference: string | null;
  dateCommande: Date;
  dateConfirmation: Date | null;
  dateSoumission: Date | null;
  dateApprobation: Date | null;
  notes: string | null;
  conditionsPaiement: string | null;
  montantTotal: string;
  fournisseur: {
    nom: string;
    contact: string | null;
    telephone: string | null;
    email: string | null;
    adresse: string | null;
    identifiantFiscal: string | null;
  };
  lignes: BonCommandePdfLigne[];
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null;
  imprimeAt: Date;
}

const STATUT_LIBELLE: Record<string, string> = {
  BROUILLON: 'Brouillon',
  SOUMISE_APPROBATION: 'Soumise à approbation',
  APPROUVEE: 'Approuvée',
  REJETEE: 'Rejetée',
  EN_PRODUCTION: 'En production',
  EXPEDIEE: 'Expédiée',
  EN_TRANSIT: 'En transit',
  EN_DOUANE: 'En douane',
  DEDOUANEE: 'Dédouanée',
  CONFIRMEE: 'Confirmée',
  PARTIELLEMENT_RECEPTIONNEE: 'Partiellement réceptionnée',
  RECEPTIONNEE: 'Réceptionnée',
  CLOTUREE: 'Clôturée',
  ANNULEE: 'Annulée',
};

function fmtMontantDevise(value: string, devise: string): string {
  if (devise === 'XOF' || devise === 'FCFA') return fmtFcfaPdf(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${fmtNombrePdf(n, { maximumFractionDigits: 2 })} ${latiniserTextePdf(devise)}`;
}

/** Bon de commande / proforma fournisseur — pièce P2P imprimable. */
export function dessinerBonCommandePdf(
  doc: PDFKit.PDFDocument,
  data: BonCommandePdfInput,
): void {
  const titre = data.proformaReference ? 'Proforma' : 'Bon de commande';
  const sousTitres = [
    `N° ${data.numero}  ·  ${STATUT_LIBELLE[data.statut] ?? data.statut}`,
    data.proformaReference
      ? `Réf. proforma : ${data.proformaReference}`
      : `Devise : ${data.devise}`,
  ];

  enTeteSociete(doc, data.societe);
  bandeauRapport(doc, titre, sousTitres);

  kpiRangee(doc, [
    {
      label: 'Total',
      valeur: fmtMontantDevise(data.montantTotal, data.devise),
    },
    {
      label: 'Lignes',
      valeur: fmtNombrePdf(data.lignes.length),
    },
    {
      label: 'Statut',
      valeur: STATUT_LIBELLE[data.statut] ?? data.statut,
    },
  ]);

  sectionRapport(doc, 'Fournisseur');
  ligneKv(doc, 'Raison sociale', data.fournisseur.nom);
  ligneKv(doc, 'Contact', data.fournisseur.contact ?? '—');
  ligneKv(doc, 'Téléphone', data.fournisseur.telephone ?? '—');
  ligneKv(doc, 'E-mail', data.fournisseur.email ?? '—');
  ligneKv(doc, 'Adresse', data.fournisseur.adresse ?? '—');
  ligneKv(doc, 'Identifiant fiscal', data.fournisseur.identifiantFiscal ?? '—');
  doc.moveDown(0.4);

  sectionRapport(doc, 'Dates');
  ligneKv(doc, 'Date commande', fmtDatePdf(data.dateCommande));
  ligneKv(doc, 'Soumission', fmtDatePdf(data.dateSoumission));
  ligneKv(doc, 'Approbation', fmtDatePdf(data.dateApprobation));
  ligneKv(doc, 'Confirmation', fmtDatePdf(data.dateConfirmation));
  ligneKv(doc, 'Imprimé le', fmtJourPdf(data.imprimeAt));
  if (data.conditionsPaiement) {
    ligneKv(doc, 'Conditions de paiement', data.conditionsPaiement);
  }
  if (data.notes) {
    ligneKv(doc, 'Notes', data.notes);
  }
  doc.moveDown(0.4);

  sectionRapport(doc, 'Lignes');
  tableauPdf(
    doc,
    [
      { header: 'Désignation', width: 200 },
      { header: 'Réf.', width: 72 },
      { header: 'Qté', width: 48, align: 'right' },
      { header: 'P.U.', width: 85, align: 'right' },
      { header: 'Montant', width: 94, align: 'right' },
    ],
    data.lignes.map((l) => [
      latiniserTextePdf(l.designation),
      latiniserTextePdf(l.reference ?? '—'),
      fmtNombrePdf(l.quantite),
      fmtMontantDevise(l.prixUnitaire, data.devise),
      fmtMontantDevise(l.montant, data.devise),
    ]),
    {
      empty: 'Aucune ligne.',
      pied: [
        'Total',
        '',
        '',
        '',
        fmtMontantDevise(data.montantTotal, data.devise),
      ],
    },
  );
}
