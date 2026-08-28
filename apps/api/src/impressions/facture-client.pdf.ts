import {
  PDF,
  assurerEspace,
  dessinerLogoEnseigne,
  fmtDatePdf,
  fmtFcfaPdf,
  fmtJourPdf,
  fmtNombrePdf,
  latiniserTextePdf,
  tableauPdf,
} from './pdf.util';

export interface FactureClientPdfLigne {
  designation: string;
  quantite: number;
  prixUnitaire: string;
  remise: string;
  tauxTva: string;
  montantHt: string;
  montantTva: string;
  montantTtc: string;
}

export interface FactureClientPdfInput {
  numero: string;
  statut: string;
  dateFacture: Date;
  dateEcheance: Date | null;
  montantHt: string;
  montantTva: string;
  montantTtc: string;
  montantPaye: string;
  solde: string;
  notes: string | null;
  createdAt: Date;
  client: {
    nom: string;
    prenom: string | null;
    contact: string | null;
    adresse: string | null;
  };
  boutique: { nom: string } | null;
  devis: { numero: string } | null;
  lignes: FactureClientPdfLigne[];
  paiements: Array<{
    montant: string;
    mode: string;
    datePaiement: Date;
    reference: string | null;
  }>;
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
  EMISE: 'Émise',
  ANNULEE: 'Annulée',
};

const MODE_LIBELLE: Record<string, string> = {
  ESPECES: 'Espèces',
  VIREMENT: 'Virement',
  MOBILE_MONEY: 'Mobile Money',
  CARTE: 'Carte',
};

function texteBloc(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  lines: string[],
): number {
  let cy = y;
  for (const line of lines) {
    if (!line.trim()) continue;
    doc.text(latiniserTextePdf(line), x, cy, {
      width,
      lineBreak: false,
    });
    cy += 12;
  }
  return cy;
}

/** Facture client B2B — HT + TVA + TTC (A4). */
export function dessinerFactureClientPdf(
  doc: PDFKit.PDFDocument,
  data: FactureClientPdfInput,
): void {
  const clientNom = data.client.prenom
    ? `${data.client.prenom} ${data.client.nom}`
    : data.client.nom;
  const statut = STATUT_LIBELLE[data.statut] ?? data.statut;

  doc.save();
  doc.rect(0, 0, doc.page.width, 5).fill(PDF.brand);
  doc.restore();

  const logoH = dessinerLogoEnseigne(doc, { x: PDF.margin, y: 16 });
  let leftY = 16 + logoH + 2;
  doc.font('Helvetica').fontSize(8).fillColor(PDF.muted);
  leftY = texteBloc(doc, PDF.margin, leftY, 260, [
    data.societe?.raisonSociale ?? 'MAJOR AUTO PARTS',
    data.societe?.adresse ?? '',
    [data.societe?.telephone, data.societe?.email]
      .filter(Boolean)
      .join('  ·  '),
  ]);

  const boxW = 200;
  const boxX = PDF.margin + PDF.contentWidth - boxW;
  const boxY = 16;
  const boxH = 72;
  doc.save();
  doc.roundedRect(boxX, boxY, boxW, boxH, 3).fill(PDF.navy);
  doc.rect(boxX, boxY, 4, boxH).fill(PDF.brand);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16);
  doc.text('FACTURE', boxX + 14, boxY + 10, { width: boxW - 22 });
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1');
  doc.text(`N° ${data.numero}`, boxX + 14, boxY + 32, { width: boxW - 22 });
  doc.text(`${statut}  ·  HT + TVA`, boxX + 14, boxY + 46, {
    width: boxW - 22,
  });
  doc.restore();

  doc.y = Math.max(leftY, boxY + boxH) + 16;
  doc.x = PDF.margin;

  const colW = (PDF.contentWidth - 14) / 2;
  const partiesY = doc.y;
  const cardH = 108;

  function carte(
    x: number,
    titre: string,
    rows: Array<[string, string]>,
  ): void {
    doc.save();
    doc
      .roundedRect(x, partiesY, colW, cardH, 3)
      .lineWidth(0.7)
      .fillAndStroke(PDF.fill, PDF.line);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF.brand);
    doc.text(titre.toUpperCase(), x + 10, partiesY + 8, {
      width: colW - 20,
      characterSpacing: 0.8,
    });
    let ry = partiesY + 26;
    for (const [label, valeur] of rows) {
      if (!valeur || valeur === '—') continue;
      doc.font('Helvetica').fontSize(7.5).fillColor(PDF.muted);
      doc.text(label, x + 10, ry, { width: colW - 20, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF.ink);
      doc.text(latiniserTextePdf(valeur), x + 10, ry + 10, {
        width: colW - 20,
      });
      ry += 24;
    }
    doc.restore();
  }

  carte(PDF.margin, 'Client', [
    ['Raison sociale / nom', clientNom],
    ['Contact', data.client.contact ?? ''],
    ['Adresse', data.client.adresse ?? ''],
  ]);
  carte(PDF.margin + colW + 14, 'Document', [
    ['Date de facture', fmtJourPdf(data.dateFacture)],
    [
      'Échéance',
      data.dateEcheance ? fmtJourPdf(data.dateEcheance) : 'Comptant',
    ],
    ['Devis', data.devis?.numero ?? '—'],
    [
      'Boutique',
      data.boutique?.nom ?? data.societe?.raisonSociale ?? 'MAJOR AUTO PARTS',
    ],
  ]);

  doc.y = partiesY + cardH + 16;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF.navy);
  doc.text('Detail des lignes (HT + TVA)', PDF.margin, doc.y);
  doc
    .moveTo(PDF.margin, doc.y + 2)
    .lineTo(PDF.margin + PDF.contentWidth, doc.y + 2)
    .strokeColor(PDF.brand)
    .lineWidth(1.1)
    .stroke();
  doc.moveDown(0.55);
  doc.fillColor(PDF.ink);

  tableauPdf(
    doc,
    [
      { header: '#', width: 22, align: 'right' },
      { header: 'Designation', width: 155 },
      { header: 'Qte', width: 32, align: 'right' },
      { header: 'P.U. HT', width: 62, align: 'right' },
      { header: 'TVA %', width: 40, align: 'right' },
      { header: 'HT', width: 62, align: 'right' },
      { header: 'TVA', width: 58, align: 'right' },
      { header: 'TTC', width: 68, align: 'right' },
    ],
    data.lignes.map((l, i) => [
      String(i + 1),
      latiniserTextePdf(l.designation),
      fmtNombrePdf(l.quantite),
      fmtFcfaPdf(l.prixUnitaire),
      `${Number(l.tauxTva).toFixed(0)} %`,
      fmtFcfaPdf(l.montantHt),
      fmtFcfaPdf(l.montantTva),
      fmtFcfaPdf(l.montantTtc),
    ]),
    { empty: 'Aucune ligne.' },
  );

  assurerEspace(doc, 110);
  const sumW = 240;
  const sumX = PDF.margin + PDF.contentWidth - sumW;
  const sumY = doc.y + 4;
  doc.save();
  doc
    .roundedRect(sumX, sumY, sumW, 92, 3)
    .lineWidth(0.7)
    .fillAndStroke(PDF.fill, PDF.line);
  let sy = sumY + 10;
  const row = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 9)
      .fillColor(bold ? PDF.navy : PDF.muted);
    doc.text(label, sumX + 12, sy, { width: 110, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fillColor(PDF.ink)
      .text(value, sumX + 12, sy, {
        width: sumW - 24,
        align: 'right',
      });
    sy += 16;
  };
  row('Total HT', fmtFcfaPdf(data.montantHt));
  row('TVA', fmtFcfaPdf(data.montantTva));
  doc
    .moveTo(sumX + 10, sy)
    .lineTo(sumX + sumW - 10, sy)
    .strokeColor(PDF.line)
    .lineWidth(0.7)
    .stroke();
  sy += 8;
  row('TOTAL TTC', fmtFcfaPdf(data.montantTtc), true);
  row('Solde', fmtFcfaPdf(data.solde));
  doc.restore();

  doc.y = sumY + 92 + 14;
  doc.x = PDF.margin;

  if (data.paiements.length > 0) {
    assurerEspace(doc, 60);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF.navy);
    doc.text('Encaissements', PDF.margin, doc.y);
    doc.moveDown(0.3);
    tableauPdf(
      doc,
      [
        { header: 'Date', width: 120 },
        { header: 'Mode', width: 120 },
        { header: 'Reference', width: 140 },
        { header: 'Montant', width: 119, align: 'right' },
      ],
      data.paiements.map((p) => [
        fmtJourPdf(p.datePaiement),
        MODE_LIBELLE[p.mode] ?? p.mode,
        p.reference ?? '—',
        fmtFcfaPdf(p.montant),
      ]),
      { empty: 'Aucun encaissement.' },
    );
  }

  if (data.notes?.trim()) {
    assurerEspace(doc, 48);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF.navy);
    doc.text('Notes', PDF.margin, doc.y);
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9).fillColor(PDF.ink);
    doc.text(latiniserTextePdf(data.notes.trim()), {
      width: PDF.contentWidth,
    });
    doc.moveDown(0.6);
  }

  assurerEspace(doc, 48);
  doc.font('Helvetica').fontSize(7.5).fillColor(PDF.muted);
  doc.text(
    latiniserTextePdf(
      'Facture client B2B. Ce document n’est pas un ticket de caisse POS. ' +
        'TVA collectee au taux de chaque ligne. ' +
        `Imprime le ${fmtDatePdf(data.imprimeAt)}.`,
    ),
    PDF.margin,
    doc.y,
    { width: PDF.contentWidth },
  );
}
