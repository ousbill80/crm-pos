import type {
  ReportingDashboardDto,
  ReportingDafDto,
} from '../reporting/reporting.service';
import {
  alertePdf,
  bandeauRapport,
  enTeteSociete,
  fmtDatePdf,
  fmtFcfaPdf,
  fmtNombrePdf,
  fmtPctPdf,
  fmtPeriodePdf,
  kpiRangee,
  MODE_PAIEMENT_PDF,
  PDF,
  sectionRapport,
  tableauPdf,
} from './pdf.util';

type SocieteEntete = {
  raisonSociale: string;
  adresse: string;
  telephone: string | null;
  email: string | null;
} | null;

const AGEING_PDF: Record<string, string> = {
  '0_24h': '0–24 h',
  '24_48h': '24–48 h',
  '48_72h': '48–72 h',
  plus_72h: '+72 h',
};

const STATUT_TX_PDF: Record<string, string> = {
  INITIEE: 'Initiée',
  EN_TRANSIT: 'En transit',
  RECEPTIONNEE: 'Réceptionnée',
  VALIDEE: 'Validée',
  LITIGE: 'Litige',
};

function perimetreLabel(perimetre: string): string {
  if (perimetre === 'RESEAU') return 'Réseau entier';
  if (perimetre === 'ZONE') return 'Zone';
  if (perimetre === 'BOUTIQUE') return 'Boutique';
  return perimetre;
}

function santeLabel(sante: string): string {
  if (sante === 'OK') return 'Saine';
  if (sante === 'VIGILANCE') return 'Vigilance';
  if (sante === 'CRITIQUE') return 'Critique';
  return sante;
}

function accentMarge(taux: string): 'ok' | 'warn' | 'danger' {
  const n = Number(taux);
  if (!Number.isFinite(n) || n < 0) return 'danger';
  if (n < 15) return 'warn';
  return 'ok';
}

function accentSante(sante: string): 'ok' | 'warn' | 'danger' {
  if (sante === 'CRITIQUE') return 'danger';
  if (sante === 'VIGILANCE') return 'warn';
  return 'ok';
}

export function dessinerDashboardPdf(
  doc: PDFKit.PDFDocument,
  data: ReportingDashboardDto,
  societe: SocieteEntete,
): void {
  enTeteSociete(doc, societe);
  bandeauRapport(doc, 'Tableau de bord', [
    `Périmètre ${perimetreLabel(data.perimetre)}  ·  généré le ${fmtDatePdf(data.genereAt)}`,
    'Reporting consolidé — CA, trésorerie, rentabilité, CRM (§6.3.4)',
  ]);

  kpiRangee(doc, [
    {
      label: 'Chiffre d’affaires',
      valeur: fmtFcfaPdf(data.chiffreAffaires.total),
    },
    {
      label: 'Litiges ouverts',
      valeur: `${data.ecarts.nombreLitiges}  ·  ${fmtFcfaPdf(data.ecarts.montantEcartsAbsolus)}`,
      accent: data.ecarts.nombreLitiges > 0 ? 'danger' : 'ok',
    },
    {
      label: 'Versements en retard',
      valeur: String(data.versements.enRetard24h),
      accent: data.versements.enRetard24h > 0 ? 'warn' : 'ok',
    },
    {
      label: 'Soldes auxiliaires',
      valeur: fmtFcfaPdf(data.tresorerie.totalSoldesAuxiliaires),
    },
  ]);

  sectionRapport(doc, 'Chiffre d’affaires par boutique');
  tableauPdf(
    doc,
    [
      { header: 'Boutique', width: 259 },
      { header: 'Montant', width: 240, align: 'right' },
    ],
    data.chiffreAffaires.parBoutique.map((b) => [
      b.nomBoutique,
      fmtFcfaPdf(b.montant),
    ]),
    {
      empty: 'Aucun chiffre sur la période.',
      pied:
        data.chiffreAffaires.parBoutique.length > 0
          ? ['Total', fmtFcfaPdf(data.chiffreAffaires.total)]
          : undefined,
    },
  );

  sectionRapport(doc, 'Répartition par mode de paiement');
  tableauPdf(
    doc,
    [
      { header: 'Mode', width: 259 },
      { header: 'Montant', width: 240, align: 'right' },
    ],
    data.chiffreAffaires.parModePaiement.map((m) => [
      MODE_PAIEMENT_PDF[m.modePaiement] ?? m.modePaiement,
      fmtFcfaPdf(m.montant),
    ]),
    { empty: 'Aucun paiement enregistré sur la période.' },
  );

  sectionRapport(doc, 'Rentabilité par boutique');
  tableauPdf(
    doc,
    [
      { header: 'Boutique', width: 119 },
      { header: 'CA net', width: 95, align: 'right' },
      { header: 'CMV', width: 95, align: 'right' },
      { header: 'Marge brute', width: 95, align: 'right' },
      { header: 'Taux', width: 95, align: 'right' },
    ],
    [...data.rentabiliteParBoutique]
      .sort((a, b) => Number(b.margeBrute) - Number(a.margeBrute))
      .map((r) => [
        r.nomBoutique,
        fmtFcfaPdf(r.chiffreAffairesNet),
        fmtFcfaPdf(r.coutDesVentes),
        fmtFcfaPdf(r.margeBrute),
        fmtPctPdf(r.tauxMarge),
      ]),
    { empty: 'Aucune boutique avec activité sur la période.' },
  );

  sectionRapport(doc, 'Pipeline des versements');
  tableauPdf(
    doc,
    [
      { header: 'Statut', width: 179 },
      { header: 'Nombre', width: 120, align: 'right' },
      { header: 'Montant', width: 200, align: 'right' },
    ],
    data.versements.parStatut.map((s) => [
      STATUT_TX_PDF[s.statut] ?? s.statut,
      String(s.nombre),
      fmtFcfaPdf(s.montant),
    ]),
    { empty: 'Aucun versement sur le périmètre.' },
  );

  sectionRapport(doc, 'Clients CRM');
  tableauPdf(
    doc,
    [
      { header: 'Segment', width: 259 },
      { header: 'Clients', width: 240, align: 'right' },
    ],
    data.crm.parSegment.map((s) => [s.segment, String(s.nombre)]),
    {
      empty: 'Aucun client dans le périmètre.',
      pied:
        data.crm.parSegment.length > 0
          ? ['Total', String(data.crm.nombreClients)]
          : undefined,
    },
  );
}

export function dessinerDafPdf(
  doc: PDFKit.PDFDocument,
  data: ReportingDafDto,
  societe: SocieteEntete,
): void {
  enTeteSociete(doc, societe);
  bandeauRapport(doc, 'Rapport Finance DAF', [
    `${fmtPeriodePdf(data.periode.dateFrom, data.periode.dateTo)}  ·  généré le ${fmtDatePdf(data.genereAt)}`,
    'Pôle central — résultat d’exploitation, stocks, trésorerie réseau (§6.3.4)',
  ]);

  kpiRangee(doc, [
    { label: 'CA net', valeur: fmtFcfaPdf(data.resultat.caNet) },
    {
      label: 'Marge brute',
      valeur: `${fmtFcfaPdf(data.resultat.margeBrute)}  ·  ${fmtPctPdf(data.resultat.tauxMarge)}`,
      accent: accentMarge(data.resultat.tauxMarge),
    },
    {
      label: 'Stock (CMP)',
      valeur: fmtFcfaPdf(data.stocks.valeurTotale),
      accent: accentSante(data.stocks.sante),
    },
    {
      label: 'Caisse centrale',
      valeur: fmtFcfaPdf(data.tresorerie.soldeCentrale),
    },
  ]);

  sectionRapport(doc, 'Compte de résultat');
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 299 },
      { header: 'Montant', width: 200, align: 'right' },
    ],
    [
      [
        'Chiffre d’affaires net (ventes − retours)',
        fmtFcfaPdf(data.resultat.caNet),
      ],
      [
        'Coût des marchandises vendues (CMP figé à la vente)',
        `− ${fmtFcfaPdf(data.resultat.cmv)}`,
      ],
      [
        `Marge brute  ·  ${fmtPctPdf(data.resultat.tauxMarge)}`,
        fmtFcfaPdf(data.resultat.margeBrute),
      ],
    ],
  );

  if (data.analyse.margeSurStock || data.analyse.rotationIndicateur) {
    const lignes: string[][] = [];
    if (data.analyse.margeSurStock) {
      const ratio = Number(data.analyse.margeSurStock);
      lignes.push([
        'Marge / stock',
        Number.isFinite(ratio)
          ? `${ratio.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ×`
          : data.analyse.margeSurStock,
      ]);
    }
    if (data.analyse.rotationIndicateur) {
      const ratio = Number(data.analyse.rotationIndicateur);
      lignes.push([
        'Rotation (CMV / stock)',
        Number.isFinite(ratio)
          ? `${ratio.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ×`
          : data.analyse.rotationIndicateur,
      ]);
    }
    sectionRapport(doc, 'Analyse');
    tableauPdf(
      doc,
      [
        { header: 'Indicateur', width: 299 },
        { header: 'Valeur', width: 200, align: 'right' },
      ],
      lignes,
    );
  }

  sectionRapport(doc, 'Résultat par boutique');
  tableauPdf(
    doc,
    [
      { header: 'Boutique', width: 109 },
      { header: 'CA net', width: 90, align: 'right' },
      { header: 'CMV', width: 90, align: 'right' },
      { header: 'Marge', width: 90, align: 'right' },
      { header: 'Taux', width: 60, align: 'right' },
      { header: 'Stock', width: 60, align: 'right' },
    ],
    [...data.resultat.parBoutique]
      .sort((a, b) => Number(b.margeBrute) - Number(a.margeBrute))
      .map((r) => [
        r.nomBoutique,
        fmtFcfaPdf(r.chiffreAffairesNet),
        fmtFcfaPdf(r.coutDesVentes),
        fmtFcfaPdf(r.margeBrute),
        fmtPctPdf(r.tauxMarge),
        fmtFcfaPdf(r.valeurStock),
      ]),
    {
      empty: 'Aucune boutique avec activité sur la période.',
      pied:
        data.resultat.parBoutique.length > 0
          ? [
              'Total réseau',
              fmtFcfaPdf(data.resultat.caNet),
              fmtFcfaPdf(data.resultat.cmv),
              fmtFcfaPdf(data.resultat.margeBrute),
              fmtPctPdf(data.resultat.tauxMarge),
              fmtFcfaPdf(data.stocks.valeurTotale),
            ]
          : undefined,
    },
  );

  sectionRapport(doc, 'Modes de paiement');
  tableauPdf(
    doc,
    [
      { header: 'Mode', width: 259 },
      { header: 'Montant', width: 240, align: 'right' },
    ],
    data.resultat.parModePaiement.map((m) => [
      MODE_PAIEMENT_PDF[m.modePaiement] ?? m.modePaiement,
      fmtFcfaPdf(m.montant),
    ]),
    { empty: 'Aucun paiement enregistré sur la période.' },
  );

  sectionRapport(doc, `Stocks  ·  santé ${santeLabel(data.stocks.sante)}`);
  kpiRangee(doc, [
    { label: 'Valeur CMP', valeur: fmtFcfaPdf(data.stocks.valeurTotale) },
    {
      label: 'Ruptures',
      valeur: String(data.stocks.ruptures),
      accent: data.stocks.ruptures > 0 ? 'danger' : 'ok',
    },
    {
      label: 'Sous seuil',
      valeur: String(data.stocks.sousSeuil),
      accent: data.stocks.sousSeuil > 0 ? 'warn' : 'ok',
    },
    {
      label: 'Couverture médiane',
      valeur:
        data.stocks.couvertureMediane == null
          ? '—'
          : `${fmtNombrePdf(data.stocks.couvertureMediane)} j`,
    },
  ]);
  tableauPdf(
    doc,
    [
      { header: 'Boutique', width: 159 },
      { header: 'Unités', width: 80, align: 'right' },
      { header: 'Valeur', width: 120, align: 'right' },
      { header: 'Ruptures', width: 70, align: 'right' },
      { header: 'Sous seuil', width: 70, align: 'right' },
    ],
    data.stocks.parBoutique.map((b) => [
      b.nomBoutique,
      fmtNombrePdf(b.unites),
      fmtFcfaPdf(b.valeur),
      String(b.ruptures),
      String(b.sousSeuil),
    ]),
    { empty: 'Aucun stock valorisé.' },
  );

  sectionRapport(doc, 'Trésorerie');
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 299 },
      { header: 'Montant', width: 200, align: 'right' },
    ],
    [
      [
        'Soldes magasins (auxiliaires)',
        fmtFcfaPdf(data.tresorerie.soldeMagasins),
      ],
      ['Tiroirs (fond de caisse)', fmtFcfaPdf(data.tresorerie.soldeTiroirs)],
      ['Caisse centrale', fmtFcfaPdf(data.tresorerie.soldeCentrale)],
      ['Cash conseillé', fmtFcfaPdf(data.tresorerie.cashConseille)],
      ['Versements en cours', fmtFcfaPdf(data.tresorerie.versementsEnCours)],
      [
        `Litiges (${data.tresorerie.litiges.nombre})`,
        fmtFcfaPdf(data.tresorerie.litiges.montantEcartsAbsolus),
      ],
    ],
  );

  sectionRapport(doc, 'Ancienneté des versements');
  tableauPdf(
    doc,
    [
      { header: 'Tranche', width: 179 },
      { header: 'Nombre', width: 120, align: 'right' },
      { header: 'Montant', width: 200, align: 'right' },
    ],
    data.tresorerie.ageing.map((a) => [
      AGEING_PDF[a.bucket] ?? a.bucket,
      String(a.nombre),
      fmtFcfaPdf(a.montant),
    ]),
    { empty: 'Aucun versement en attente.' },
  );

  if (data.analyse.alertes.length > 0) {
    sectionRapport(doc, 'Alertes');
    for (const a of data.analyse.alertes) {
      alertePdf(doc, a.severite, a.message);
    }
  }

  doc.font('Helvetica').fontSize(7.5).fillColor(PDF.muted);
  doc.text(
    'Les soldes de caisse et de stock sont recalculés depuis le grand livre (append-only). Aucun montant n’est édité rétroactivement.',
    PDF.margin,
    doc.y + 6,
    { width: PDF.contentWidth },
  );
}
