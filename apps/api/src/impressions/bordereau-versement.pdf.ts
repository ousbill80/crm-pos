import {
  bandeauRapport,
  enTeteSociete,
  fmtDatePdf,
  fmtFcfaPdf,
  kpiRangee,
  ligneKv,
  sectionRapport,
} from './pdf.util';

export interface BordereauVersementPdfInput {
  transactionId: string;
  statut: string;
  dateHeure: Date;
  montantDeclare: string;
  caisseLibelle: string;
  boutiqueNom: string | null;
  initiateur: string | null;
  dateEmission: Date;
  pieceJointe: string | null;
  reception: {
    montantRecu: string;
    ecart: string;
    statutFinal: string;
    validateur: string | null;
    dateReception: Date;
  } | null;
  regularisation: {
    montantRetenu: string;
    motif: string;
    validateur: string | null;
    dateRegularisation: Date;
  } | null;
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null;
  imprimeAt: Date;
}

const STATUT_LIBELLE: Record<string, string> = {
  INITIEE: 'Initiée',
  EN_TRANSIT: 'En transit',
  RECEPTIONNEE: 'Réceptionnée',
  VALIDEE: 'Validée',
  LITIGE: 'Litige',
};

/** Bordereau de versement (§5.1) — pièce justificative du transfert boutique → caisse centrale. */
export function dessinerBordereauVersementPdf(
  doc: PDFKit.PDFDocument,
  data: BordereauVersementPdfInput,
): void {
  const ref = data.transactionId.slice(0, 8).toUpperCase();
  const ecartNum = data.reception ? Number(data.reception.ecart) : null;

  enTeteSociete(doc, data.societe);
  bandeauRapport(doc, 'Bordereau de versement', [
    `${data.boutiqueNom ?? 'Boutique'}  ·  ${data.caisseLibelle}  ·  Réf. ${ref}`,
    `Statut : ${STATUT_LIBELLE[data.statut] ?? data.statut}`,
  ]);

  kpiRangee(doc, [
    { label: 'Montant déclaré', valeur: fmtFcfaPdf(data.montantDeclare) },
    {
      label: 'Montant reçu',
      valeur: data.reception
        ? fmtFcfaPdf(data.reception.montantRecu)
        : 'En attente',
    },
    {
      label: 'Écart',
      valeur: data.reception ? fmtFcfaPdf(data.reception.ecart) : '—',
      accent:
        ecartNum === null
          ? 'neutral'
          : ecartNum === 0
            ? 'ok'
            : data.statut === 'LITIGE'
              ? 'danger'
              : 'warn',
    },
  ]);

  sectionRapport(doc, 'Émission');
  ligneKv(doc, 'Émis le', fmtDatePdf(data.dateEmission));
  ligneKv(doc, 'Initié par', data.initiateur ?? '—');
  ligneKv(doc, 'Boutique', data.boutiqueNom ?? '—');
  ligneKv(doc, 'Caisse', data.caisseLibelle);
  ligneKv(doc, 'Pièce jointe', data.pieceJointe ?? 'Aucune');
  doc.moveDown(0.5);

  sectionRapport(doc, 'Réception (Caissier Central)');
  if (data.reception) {
    ligneKv(doc, 'Reçu le', fmtDatePdf(data.reception.dateReception));
    ligneKv(doc, 'Réceptionné par', data.reception.validateur ?? '—');
    ligneKv(doc, 'Montant reçu', fmtFcfaPdf(data.reception.montantRecu));
    ligneKv(doc, 'Écart (reçu − déclaré)', fmtFcfaPdf(data.reception.ecart));
    ligneKv(
      doc,
      'Statut après rapprochement',
      STATUT_LIBELLE[data.reception.statutFinal] ?? data.reception.statutFinal,
    );
  } else {
    doc.font('Helvetica').fontSize(9).fillColor('#64748b');
    doc.text(
      'Ce bordereau n’a pas encore été réceptionné par la caisse centrale.',
    );
    doc.moveDown(0.5);
  }

  if (data.regularisation) {
    sectionRapport(doc, 'Régularisation du litige');
    ligneKv(
      doc,
      'Régularisé le',
      fmtDatePdf(data.regularisation.dateRegularisation),
    );
    ligneKv(doc, 'Régularisé par', data.regularisation.validateur ?? '—');
    ligneKv(
      doc,
      'Montant retenu',
      fmtFcfaPdf(data.regularisation.montantRetenu),
    );
    ligneKv(doc, 'Motif', data.regularisation.motif);
  }
}
