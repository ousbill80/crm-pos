import type { Response } from 'express';
import PDFDocument from 'pdfkit';

const ENSEIGNE = {
  nom: 'MAJOR AUTO PARTS',
  ligne1: 'MAJOR',
  ligne2: 'AUTO PARTS',
  gold: '#C9A227',
  ink: '#1A1C22',
} as const;

/** Charte des exports PDF — or / noir MAJOR AUTO PARTS. */
export const PDF = {
  margin: 48,
  contentWidth: 499,
  ink: '#1a2332',
  muted: '#64748b',
  line: '#e2e8f0',
  fill: '#f8fafc',
  brand: '#C9A227',
  navy: '#1A1C22',
  danger: '#c0392b',
  warn: '#b9770e',
  ok: '#1e8449',
} as const;

export const MODE_PAIEMENT_PDF: Record<string, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  MOBILE_MONEY: 'Mobile Money',
  VIREMENT: 'Virement',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

/**
 * Helvetica (WinAnsi) n’a pas l’espace fine insécable U+202F que
 * `toLocaleString('fr-FR')` utilise comme séparateur de milliers.
 * L’octet bas de U+202F est 0x2F = « / » → impression « 2 /000 FCFA ».
 */
export function latiniserTextePdf(s: string): string {
  return s.replace(/[\u00a0\u202f\u2007\u2009\u200a]/g, ' ');
}

export function fmtNombrePdf(
  n: number,
  options?: Intl.NumberFormatOptions,
): string {
  return latiniserTextePdf(n.toLocaleString('fr-FR', options));
}

export function fmtFcfaPdf(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${fmtNombrePdf(Math.round(n))} FCFA`;
}

export function fmtPctPdf(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${fmtNombrePdf(n, { maximumFractionDigits: 1 })} %`;
}

export function fmtDatePdf(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return latiniserTextePdf(d.toLocaleString('fr-FR'));
}

export function fmtJourPdf(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return latiniserTextePdf(d.toLocaleDateString('fr-FR'));
}

export function fmtPeriodePdf(
  from?: string | null,
  to?: string | null,
): string {
  if (!from && !to) return 'Période courante';
  return `${from ? fmtJourPdf(from) : '…'} → ${to ? fmtJourPdf(to) : '…'}`;
}

function contenuBas(doc: PDFKit.PDFDocument): number {
  return doc.page.height - 52;
}

export function assurerEspace(doc: PDFKit.PDFDocument, hauteur: number): void {
  if (doc.y + hauteur > contenuBas(doc)) {
    doc.addPage();
    doc.x = PDF.margin;
    doc.y = PDF.margin;
  }
}

export function pipePdf(
  res: Response,
  filename: string,
  draw: (doc: PDFKit.PDFDocument) => void,
  mention?: string,
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({
    margin: PDF.margin,
    size: 'A4',
    bufferPages: true,
    info: {
      Title: filename.replace(/\.pdf$/i, ''),
      Author: ENSEIGNE.nom,
    },
  });
  doc.pipe(res);
  draw(doc);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.height - 36;
    doc.save();
    doc
      .moveTo(PDF.margin, bottom - 10)
      .lineTo(PDF.margin + PDF.contentWidth, bottom - 10)
      .strokeColor(PDF.line)
      .lineWidth(0.6)
      .stroke();
    doc.font('Helvetica').fontSize(7).fillColor(PDF.muted);
    doc.text(mention ?? ENSEIGNE.nom, PDF.margin, bottom - 6, {
      width: PDF.contentWidth - 72,
      align: 'left',
      lineBreak: false,
    });
    doc.text(`${i + 1} / ${range.count}`, PDF.margin, bottom - 6, {
      width: PDF.contentWidth,
      align: 'right',
      lineBreak: false,
    });
    doc.restore();
  }
  doc.end();
}

export function dessinerLogoEnseigne(
  doc: PDFKit.PDFDocument,
  options?: {
    x?: number;
    y?: number;
    width?: number;
    align?: 'left' | 'center';
  },
): number {
  const x = options?.x ?? PDF.margin;
  const y = options?.y ?? doc.y;
  const width = options?.width ?? 280;
  const align = options?.align ?? 'left';
  doc.save();
  doc.fillColor(ENSEIGNE.gold).font('Helvetica-Bold').fontSize(20);
  doc.text(ENSEIGNE.ligne1, x, y, {
    width,
    align,
    characterSpacing: 2.4,
    lineBreak: false,
  });
  doc.fillColor(ENSEIGNE.ink).font('Helvetica-Bold').fontSize(9);
  doc.text(ENSEIGNE.ligne2, x, y + 22, {
    width,
    align,
    characterSpacing: 3.2,
    lineBreak: false,
  });
  doc.restore();
  return 38;
}

export function enTeteSociete(
  doc: PDFKit.PDFDocument,
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null,
): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, 6).fill(PDF.brand);
  doc.restore();
  const logoH = dessinerLogoEnseigne(doc, { x: PDF.margin, y: 18 });
  doc.y = 18 + logoH + 4;
  doc.x = PDF.margin;
  doc.font('Helvetica').fontSize(8).fillColor(PDF.muted);
  if (societe?.adresse) {
    doc.text(societe.adresse, PDF.margin, doc.y, { width: 320 });
  }
  const contact = [societe?.telephone, societe?.email]
    .filter(Boolean)
    .join('  ·  ');
  if (contact) {
    doc.text(contact, PDF.margin, doc.y, { width: 320 });
  }
  doc.moveDown(0.5);
  doc.fillColor(PDF.ink);
}

export function bandeauRapport(
  doc: PDFKit.PDFDocument,
  titre: string,
  sousTitres: string[],
): void {
  assurerEspace(doc, 70);
  const y = doc.y;
  const h = 52 + Math.max(0, sousTitres.length - 1) * 11;
  doc.save();
  doc.roundedRect(PDF.margin, y, PDF.contentWidth, h, 3).fill(PDF.navy);
  doc.rect(PDF.margin, y, 5, h).fill(PDF.brand);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15);
  doc.text(titre, PDF.margin + 16, y + 10, { width: PDF.contentWidth - 28 });
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1');
  let ty = y + 32;
  for (const ligne of sousTitres) {
    doc.text(ligne, PDF.margin + 16, ty, { width: PDF.contentWidth - 28 });
    ty += 11;
  }
  doc.restore();
  doc.y = y + h + 14;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink);
}

export function kpiRangee(
  doc: PDFKit.PDFDocument,
  items: Array<{
    label: string;
    valeur: string;
    accent?: 'ok' | 'warn' | 'danger' | 'neutral';
  }>,
): void {
  const n = Math.max(items.length, 1);
  const gap = 8;
  const w = (PDF.contentWidth - gap * (n - 1)) / n;
  const h = 54;
  assurerEspace(doc, h + 10);
  const y = doc.y;
  items.forEach((item, i) => {
    const x = PDF.margin + i * (w + gap);
    const accent =
      item.accent === 'danger'
        ? PDF.danger
        : item.accent === 'warn'
          ? PDF.warn
          : item.accent === 'ok'
            ? PDF.ok
            : PDF.brand;
    doc.save();
    doc
      .roundedRect(x, y, w, h, 3)
      .lineWidth(0.7)
      .fillAndStroke(PDF.fill, PDF.line);
    doc.rect(x, y, 3.5, h).fill(accent);
    doc.fillColor(PDF.muted).font('Helvetica').fontSize(7);
    doc.text(item.label.toUpperCase(), x + 10, y + 8, {
      width: w - 16,
      lineBreak: false,
    });
    doc.fillColor(PDF.ink).font('Helvetica-Bold').fontSize(9);
    doc.text(item.valeur, x + 10, y + 24, { width: w - 16 });
    doc.restore();
  });
  doc.y = y + h + 14;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink);
}

export function sectionRapport(doc: PDFKit.PDFDocument, titre: string): void {
  assurerEspace(doc, 28);
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF.navy);
  doc.text(titre, PDF.margin, y, { width: PDF.contentWidth });
  doc
    .moveTo(PDF.margin, y + 14)
    .lineTo(PDF.margin + PDF.contentWidth, y + 14)
    .strokeColor(PDF.brand)
    .lineWidth(1.15)
    .stroke();
  doc.y = y + 20;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink).strokeColor('#000000').lineWidth(1);
}

export function ligneKv(
  doc: PDFKit.PDFDocument,
  label: string,
  valeur: string,
): void {
  assurerEspace(doc, 16);
  const x = PDF.margin;
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor(PDF.muted).text(label, x, y, {
    width: 168,
    continued: false,
  });
  doc
    .font('Helvetica-Bold')
    .fillColor(PDF.ink)
    .text(valeur, x + 176, y, {
      width: PDF.contentWidth - 176,
    });
  doc.moveDown(0.12);
}

export type ColPdf = {
  header: string;
  width: number;
  align?: 'left' | 'right';
};

function dessinerEnteteTableau(
  doc: PDFKit.PDFDocument,
  colonnes: ColPdf[],
): void {
  const headerH = 18;
  assurerEspace(doc, headerH + 16);
  const y = doc.y;
  doc.save();
  doc.rect(PDF.margin, y, PDF.contentWidth, headerH).fill(PDF.navy);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  let x = PDF.margin;
  for (const col of colonnes) {
    doc.text(col.header, x + 5, y + 5, {
      width: col.width - 10,
      align: col.align ?? 'left',
      lineBreak: false,
    });
    x += col.width;
  }
  doc.restore();
  doc.y = y + headerH;
  doc.x = PDF.margin;
}

export function tableauPdf(
  doc: PDFKit.PDFDocument,
  colonnes: ColPdf[],
  lignes: string[][],
  options?: { empty?: string; pied?: string[] },
): void {
  const rowH = 17;
  dessinerEnteteTableau(doc, colonnes);

  if (lignes.length === 0) {
    const y = doc.y;
    doc.save();
    doc.rect(PDF.margin, y, PDF.contentWidth, rowH).fill(PDF.fill);
    doc.font('Helvetica').fontSize(8).fillColor(PDF.muted);
    doc.text(options?.empty ?? 'Aucune donnée.', PDF.margin + 6, y + 4, {
      width: PDF.contentWidth - 12,
    });
    doc.restore();
    doc.y = y + rowH + 10;
    doc.x = PDF.margin;
    return;
  }

  lignes.forEach((row, i) => {
    if (doc.y + rowH > contenuBas(doc)) {
      doc.addPage();
      doc.x = PDF.margin;
      doc.y = PDF.margin;
      dessinerEnteteTableau(doc, colonnes);
    }
    const y = doc.y;
    if (i % 2 === 0) {
      doc.save();
      doc.rect(PDF.margin, y, PDF.contentWidth, rowH).fill('#f1f5f9');
      doc.restore();
    }
    doc.font('Helvetica').fontSize(8).fillColor(PDF.ink);
    let x = PDF.margin;
    colonnes.forEach((col, ci) => {
      doc.text(row[ci] ?? '—', x + 5, y + 4, {
        width: col.width - 10,
        align: col.align ?? 'left',
        lineBreak: false,
      });
      x += col.width;
    });
    doc.y = y + rowH;
  });

  if (options?.pied) {
    if (doc.y + rowH > contenuBas(doc)) {
      doc.addPage();
      doc.x = PDF.margin;
      doc.y = PDF.margin;
      dessinerEnteteTableau(doc, colonnes);
    }
    const y = doc.y;
    doc.save();
    doc.rect(PDF.margin, y, PDF.contentWidth, rowH).fill('#e8eef3');
    doc.fillColor(PDF.navy).font('Helvetica-Bold').fontSize(8);
    let x = PDF.margin;
    colonnes.forEach((col, ci) => {
      doc.text(options.pied?.[ci] ?? '', x + 5, y + 4, {
        width: col.width - 10,
        align: col.align ?? 'left',
        lineBreak: false,
      });
      x += col.width;
    });
    doc.restore();
    doc.y = y + rowH;
  }

  doc.y += 12;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink);
}

export function alertePdf(
  doc: PDFKit.PDFDocument,
  severite: string,
  message: string,
): void {
  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    critical: { bg: '#fdedec', fg: PDF.danger, label: 'Critique' },
    warning: { bg: '#fef9e7', fg: PDF.warn, label: 'Vigilance' },
    info: { bg: '#eaf2f8', fg: PDF.navy, label: 'Info' },
  };
  const style = palette[severite] ?? palette.info;
  const texte = `[${style.label}] ${message}`;
  doc.font('Helvetica').fontSize(8);
  const textH = doc.heightOfString(texte, { width: PDF.contentWidth - 16 });
  const h = Math.max(22, textH + 10);
  assurerEspace(doc, h + 4);
  const y = doc.y;
  doc.save();
  doc
    .roundedRect(PDF.margin, y, PDF.contentWidth, h, 2)
    .lineWidth(0.7)
    .fillAndStroke(style.bg, style.fg);
  doc.fillColor(style.fg).font('Helvetica').fontSize(8);
  doc.text(texte, PDF.margin + 8, y + 5, { width: PDF.contentWidth - 16 });
  doc.restore();
  doc.y = y + h + 5;
  doc.x = PDF.margin;
  doc.fillColor(PDF.ink);
}

/** @deprecated Le pied est tamponné par pipePdf sur chaque page. */
export function piedPage(doc: PDFKit.PDFDocument, mention: string): void {
  const bottom = doc.page.height - 40;
  doc.fontSize(8).font('Helvetica').fillColor(PDF.muted);
  doc.text(mention, 48, bottom, {
    width: doc.page.width - 96,
    align: 'center',
  });
  doc.fillColor(PDF.ink);
}
