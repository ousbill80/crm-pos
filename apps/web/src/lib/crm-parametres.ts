/** Miroir de apps/api/src/crm/crm-thresholds.constants.ts — valeurs par défaut §6.6. */
export const SEUILS_CRM_DEFAUT = {
  seuilFideliteArgent: 500,
  seuilFideliteOr: 2000,
  seuilSegmentRegulier: 5,
  seuilSegmentVip: 15,
  avantageFideliteArgentPct: 0,
  avantageFideliteOrPct: 0,
} as const;

/** Crédit auto POS documenté côté API (1 pt / 1000 FCFA, floor). */
export const FIDELITE_FCFA_PAR_POINT = 1000;

export type SeuilsCrmForm = {
  seuilFideliteArgent: number;
  seuilFideliteOr: number;
  seuilSegmentRegulier: number;
  seuilSegmentVip: number;
  avantageFideliteArgentPct: number;
  avantageFideliteOrPct: number;
};

export function parseSeuilsForm(input: {
  argent: string;
  or: string;
  regulier: string;
  vip: string;
  avantageArgent: string;
  avantageOr: string;
}): SeuilsCrmForm | null {
  const seuilFideliteArgent = Number(input.argent);
  const seuilFideliteOr = Number(input.or);
  const seuilSegmentRegulier = Number(input.regulier);
  const seuilSegmentVip = Number(input.vip);
  const avantageFideliteArgentPct = Number(input.avantageArgent);
  const avantageFideliteOrPct = Number(input.avantageOr);
  if (
    !Number.isInteger(seuilFideliteArgent) ||
    !Number.isInteger(seuilFideliteOr) ||
    !Number.isInteger(seuilSegmentRegulier) ||
    !Number.isInteger(seuilSegmentVip) ||
    !Number.isInteger(avantageFideliteArgentPct) ||
    !Number.isInteger(avantageFideliteOrPct) ||
    seuilFideliteArgent < 1 ||
    seuilFideliteOr < 1 ||
    seuilSegmentRegulier < 1 ||
    seuilSegmentVip < 1 ||
    avantageFideliteArgentPct < 0 ||
    avantageFideliteArgentPct > 100 ||
    avantageFideliteOrPct < 0 ||
    avantageFideliteOrPct > 100
  ) {
    return null;
  }
  return {
    seuilFideliteArgent,
    seuilFideliteOr,
    seuilSegmentRegulier,
    seuilSegmentVip,
    avantageFideliteArgentPct,
    avantageFideliteOrPct,
  };
}

export function validerSeuils(seuils: SeuilsCrmForm): string | null {
  if (seuils.seuilFideliteOr <= seuils.seuilFideliteArgent) {
    return 'Le seuil Or doit être strictement supérieur au seuil Argent.';
  }
  if (seuils.seuilSegmentVip <= seuils.seuilSegmentRegulier) {
    return 'Le seuil VIP doit être strictement supérieur au seuil Régulier.';
  }
  return null;
}

export function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

export function caDepuisPoints(points: number): string {
  return formatFcfa(points * FIDELITE_FCFA_PAR_POINT);
}

export function seuilsModifies(
  courant: SeuilsCrmForm,
  sauvegarde: SeuilsCrmForm,
): boolean {
  return (
    courant.seuilFideliteArgent !== sauvegarde.seuilFideliteArgent ||
    courant.seuilFideliteOr !== sauvegarde.seuilFideliteOr ||
    courant.seuilSegmentRegulier !== sauvegarde.seuilSegmentRegulier ||
    courant.seuilSegmentVip !== sauvegarde.seuilSegmentVip ||
    courant.avantageFideliteArgentPct !== sauvegarde.avantageFideliteArgentPct ||
    courant.avantageFideliteOrPct !== sauvegarde.avantageFideliteOrPct
  );
}
