// Seuils par défaut du programme de fidélité et de la segmentation (§6.6).
// Valeurs actives : fiche Societe (paramétrables). Ces constantes restent
// le repli si la fiche n’existe pas encore.

export const SEUIL_FIDELITE_ARGENT = 500;
export const SEUIL_FIDELITE_OR = 2000;
export const SEUIL_SEGMENT_REGULIER_NB_VENTES = 5;
export const SEUIL_SEGMENT_VIP_NB_VENTES = 15;

/**
 * Crédit auto à l’encaissement POS (client rattaché).
 * Interprétation documentée (CDC §6.6 ne fixe pas le taux) :
 * 1 point / 1000 FCFA de montantTotal, arrondi inférieur (floor)
 * pour ne pas sur-créditer.
 */
export const FIDELITE_FCFA_PAR_POINT = 1000;

export function pointsFideliteDepuisMontant(
  montantTotal: number | string,
): number {
  const n =
    typeof montantTotal === 'string' ? Number(montantTotal) : montantTotal;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / FIDELITE_FCFA_PAR_POINT);
}

export type SeuilsCrm = {
  seuilFideliteArgent: number;
  seuilFideliteOr: number;
  seuilSegmentRegulier: number;
  seuilSegmentVip: number;
  avantageFideliteArgentPct: number;
  avantageFideliteOrPct: number;
};

export const SEUILS_CRM_DEFAUT: SeuilsCrm = {
  seuilFideliteArgent: SEUIL_FIDELITE_ARGENT,
  seuilFideliteOr: SEUIL_FIDELITE_OR,
  seuilSegmentRegulier: SEUIL_SEGMENT_REGULIER_NB_VENTES,
  seuilSegmentVip: SEUIL_SEGMENT_VIP_NB_VENTES,
  avantageFideliteArgentPct: 0,
  avantageFideliteOrPct: 0,
};
