import type { LiassePack } from '../accounting-gl/syscohada-liasse';
import {
  bandeauRapport,
  enTeteSociete,
  fmtFcfaPdf,
  fmtJourPdf,
  PDF,
  sectionRapport,
  tableauPdf,
} from './pdf.util';

export function dessinerLiasseSyscohadaPdf(
  doc: PDFKit.PDFDocument,
  pack: LiassePack,
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null,
  du: string,
  au: string,
): void {
  enTeteSociete(doc, societe);
  bandeauRapport(doc, 'Liasse SYSCOHADA 2017', [
    pack.mention,
    pack.perimetre.message,
    `${fmtJourPdf(du)} → ${fmtJourPdf(au)}  ·  AUDCIF / XOF / Côte d’Ivoire`,
  ]);

  sectionRapport(doc, 'Bilan — actif');
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 60 },
      { header: 'Libellé', width: 279 },
      { header: 'Montant', width: 160, align: 'right' },
    ],
    pack.bilan.actif.map((row) => [
      row.code,
      row.libelle,
      fmtFcfaPdf(row.montant),
    ]),
    { pied: ['AZ', 'Total actif', fmtFcfaPdf(pack.bilan.totalActif)] },
  );

  sectionRapport(doc, 'Bilan — passif');
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 60 },
      { header: 'Libellé', width: 279 },
      { header: 'Montant', width: 160, align: 'right' },
    ],
    pack.bilan.passif.map((row) => [
      row.code,
      row.libelle,
      fmtFcfaPdf(row.montant),
    ]),
    { pied: ['PZ', 'Total passif', fmtFcfaPdf(pack.bilan.totalPassif)] },
  );

  sectionRapport(doc, 'Compte de résultat (enchaînement retail)');
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 60 },
      { header: 'Libellé', width: 279 },
      { header: 'Montant', width: 160, align: 'right' },
    ],
    pack.compteResultat.postes.map((row) => [
      row.code,
      row.libelle,
      fmtFcfaPdf(row.montant),
    ]),
  );

  sectionRapport(
    doc,
    pack.tft.mode === 'N_SEULEMENT'
      ? 'Tableau des flux de trésorerie (N seulement)'
      : 'Tableau des flux de trésorerie (méthode indirecte)',
  );
  if (pack.tft.mention) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(PDF.muted);
    doc.text(pack.tft.mention, PDF.margin, doc.y, { width: PDF.contentWidth });
    doc.moveDown(0.4);
    doc.fillColor(PDF.ink);
  }
  tableauPdf(
    doc,
    [
      { header: 'Poste', width: 60 },
      { header: 'Libellé', width: 279 },
      { header: 'Montant', width: 160, align: 'right' },
    ],
    pack.tft.lignes.map((row) => [
      row.code,
      row.libelle,
      fmtFcfaPdf(row.montant),
    ]),
  );

  sectionRapport(doc, 'Notes annexes (opérationnelles)');
  tableauPdf(
    doc,
    [
      { header: 'Note', width: 80 },
      { header: 'Contenu', width: 419 },
    ],
    [
      ['1. Méthodes', pack.notes.methodes.join(' · ')],
      [
        '2. Immobilisations',
        `Brute ${fmtFcfaPdf(pack.notes.immobilisations.brute)} · Amort. ${fmtFcfaPdf(pack.notes.immobilisations.amortissements)} · Nette ${fmtFcfaPdf(pack.notes.immobilisations.nette)} (${pack.notes.immobilisations.source})`,
      ],
      [
        '3. Encours',
        `401 ${fmtFcfaPdf(pack.notes.encours.fournisseurs401)} · 411 ${fmtFcfaPdf(pack.notes.encours.clients411)}`,
      ],
      [
        '4. TVA',
        `4452 ${fmtFcfaPdf(pack.notes.tva.deductible)} · 4457 ${fmtFcfaPdf(pack.notes.tva.collectee)} · net ${fmtFcfaPdf(pack.notes.tva.netAPayer)}`,
      ],
    ],
  );
}
