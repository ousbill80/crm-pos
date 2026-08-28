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

export interface DevisClientPdfLigne {
  designation: string;
  quantite: number;
  prixUnitaire: string;
  remise: string;
  montant: string;
}

export interface DevisClientPdfInput {
  numero: string;
  statut: string;
  montantTotal: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  client: {
    nom: string;
    prenom: string | null;
    contact: string | null;
    email: string | null;
    adresse: string | null;
  };
  boutique: { nom: string } | null;
  lignes: DevisClientPdfLigne[];
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
  ENVOYE: 'Envoyé',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
  ANNULE: 'Annulé',
  TRANSFORME: 'Transformé',
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

/** Devis client B2B — mise en page document commercial (A4). */
export function dessinerDevisClientPdf(
  doc: PDFKit.PDFDocument,
  data: DevisClientPdfInput,
): void {
  const clientNom = data.client.prenom
    ? `${data.client.prenom} ${data.client.nom}`
    : data.client.nom;
  const statut = STATUT_LIBELLE[data.statut] ?? data.statut;
  const totalRemises = data.lignes.reduce(
    (acc, l) => acc + (Number(l.remise) || 0),
    0,
  );
  const sousTotal = Number(data.montantTotal) + totalRemises;

  // ── En-tête : enseigne à gauche, carton DEVIS à droite ──
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
  doc.text('DEVIS', boxX + 14, boxY + 10, { width: boxW - 22 });
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1');
  doc.text(`N° ${data.numero}`, boxX + 14, boxY + 32, { width: boxW - 22 });
  doc.text(`${statut}  ·  Hors TVA`, boxX + 14, boxY + 46, {
    width: boxW - 22,
  });
  doc.restore();

  doc.y = Math.max(leftY, boxY + boxH) + 16;
  doc.x = PDF.margin;

  // ── Parties : Client | Références ──
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
    ['Date du devis', fmtJourPdf(data.createdAt)],
    ['Validité', '15 jours'],
    [
      'Boutique',
      data.boutique?.nom ?? data.societe?.raisonSociale ?? 'MAJOR AUTO PARTS',
    ],
    ['Imprimé le', fmtJourPdf(data.imprimeAt)],
  ]);

  doc.y = partiesY + cardH + 16;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink);

  // ── Lignes ──
  doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF.navy);
  doc.text('Detail des lignes (hors TVA)', PDF.margin, doc.y);
  doc
    .moveTo(PDF.margin, doc.y + 2)
    .lineTo(PDF.margin + PDF.contentWidth, doc.y + 2)
    .strokeColor(PDF.brand)
    .lineWidth(1.1)
    .stroke();
  doc.moveDown(0.55);
  doc.fillColor(PDF.ink);

  const hasRemise = data.lignes.some((l) => Number(l.remise) > 0);
  if (hasRemise) {
    tableauPdf(
      doc,
      [
        { header: '#', width: 28, align: 'right' },
        { header: 'Designation', width: 182 },
        { header: 'Qte', width: 40, align: 'right' },
        { header: 'P.U. HT', width: 80, align: 'right' },
        { header: 'Remise', width: 70, align: 'right' },
        { header: 'Total HT', width: 99, align: 'right' },
      ],
      data.lignes.map((l, i) => [
        String(i + 1),
        latiniserTextePdf(l.designation),
        fmtNombrePdf(l.quantite),
        fmtFcfaPdf(l.prixUnitaire),
        fmtFcfaPdf(l.remise),
        fmtFcfaPdf(l.montant),
      ]),
      { empty: 'Aucune ligne.' },
    );
  } else {
    tableauPdf(
      doc,
      [
        { header: '#', width: 28, align: 'right' },
        { header: 'Designation', width: 252 },
        { header: 'Qte', width: 48, align: 'right' },
        { header: 'P.U. HT', width: 85, align: 'right' },
        { header: 'Total HT', width: 86, align: 'right' },
      ],
      data.lignes.map((l, i) => [
        String(i + 1),
        latiniserTextePdf(l.designation),
        fmtNombrePdf(l.quantite),
        fmtFcfaPdf(l.prixUnitaire),
        fmtFcfaPdf(l.montant),
      ]),
      { empty: 'Aucune ligne.' },
    );
  }

  // ── Totaux à droite ──
  assurerEspace(doc, 90);
  const sumW = 220;
  const sumX = PDF.margin + PDF.contentWidth - sumW;
  const sumY = doc.y + 4;
  doc.save();
  doc
    .roundedRect(sumX, sumY, sumW, totalRemises > 0 ? 78 : 56, 3)
    .lineWidth(0.7)
    .fillAndStroke(PDF.fill, PDF.line);
  let sy = sumY + 10;
  doc.font('Helvetica').fontSize(9).fillColor(PDF.muted);
  doc.text('Sous-total HT', sumX + 12, sy, { width: 110, lineBreak: false });
  doc
    .font('Helvetica-Bold')
    .fillColor(PDF.ink)
    .text(fmtFcfaPdf(sousTotal), sumX + 12, sy, {
      width: sumW - 24,
      align: 'right',
    });
  sy += 16;
  if (totalRemises > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(PDF.muted);
    doc.text('Remises', sumX + 12, sy, { width: 110, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fillColor(PDF.ink)
      .text(`- ${fmtFcfaPdf(totalRemises)}`, sumX + 12, sy, {
        width: sumW - 24,
        align: 'right',
      });
    sy += 16;
  }
  doc
    .moveTo(sumX + 10, sy)
    .lineTo(sumX + sumW - 10, sy)
    .strokeColor(PDF.line)
    .lineWidth(0.7)
    .stroke();
  sy += 8;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.navy);
  doc.text('TOTAL HT', sumX + 12, sy, { width: 110, lineBreak: false });
  doc.text(fmtFcfaPdf(data.montantTotal), sumX + 12, sy, {
    width: sumW - 24,
    align: 'right',
  });
  doc.restore();

  doc.y = sumY + (totalRemises > 0 ? 78 : 56) + 18;
  doc.x = PDF.margin;

  // ── Notes ──
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

  // ── Conditions + signatures ──
  assurerEspace(doc, 120);
  doc.font('Helvetica').fontSize(7.5).fillColor(PDF.muted);
  doc.text(
    latiniserTextePdf(
      'Document commercial hors TVA. Prix indicatifs — sous reserve de disponibilite stock. ' +
        'Ce devis ne constitue pas une facture. Conditions de reglement a convenir a la commande. ' +
        `Derniere mise a jour : ${fmtDatePdf(data.updatedAt)}.`,
    ),
    PDF.margin,
    doc.y,
    { width: PDF.contentWidth },
  );
  doc.moveDown(1);

  const sigW = (PDF.contentWidth - 16) / 2;
  const sigY = doc.y;
  const sigH = 78;
  for (let i = 0; i < 2; i++) {
    const sx = PDF.margin + i * (sigW + 16);
    doc.save();
    doc.strokeColor(PDF.line).lineWidth(0.6).dash(3, { space: 2 });
    doc.roundedRect(sx, sigY, sigW, sigH, 3).stroke();
    doc.undash();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF.muted);
    doc.text(
      i === 0 ? 'BON POUR ACCORD CLIENT' : "POUR L'EMETTEUR",
      sx + 10,
      sigY + 10,
      { width: sigW - 20 },
    );
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
    doc.text('Date et signature', sx + 10, sigY + sigH - 20, {
      width: sigW - 20,
    });
    doc.restore();
  }
  doc.y = sigY + sigH + 8;
}
