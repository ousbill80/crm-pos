import { ModePaiement } from './enums.js';

/** Répartition du ticket par mode + reçu espèces (billets), distincts. */
export type PartPaiement = {
  mode: ModePaiement;
  montant: string;
};

export const TOLERANCE_REPARTITION_FCFA = 0.5;

export const RAPIDE_ESPECES = [500, 1000, 2000, 5000, 10_000] as const;

export type CibleNumpadPos = 'recu' | ModePaiement;

export function appliquerChiffreNumpad(courant: string, touche: string): string {
  if (touche === 'C') return '';
  if (touche === '⌫') return courant.slice(0, -1);
  if (!/^\d$/.test(touche)) return courant;
  if (courant === '' || courant === '0') return touche;
  return courant + touche;
}

export function arrondiFcfa(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function partsNumeriques(
  parts: readonly PartPaiement[],
): Array<{ mode: ModePaiement; montant: number }> {
  return parts.map((p) => ({
    mode: p.mode,
    montant: arrondiFcfa(Number(p.montant) || 0),
  }));
}

/** Part ticket en espèces — jamais le premier mode s’il n’est pas ESPECES. */
export function partEspeces(parts: readonly PartPaiement[]): number {
  return (
    partsNumeriques(parts).find((p) => p.mode === ModePaiement.ESPECES)
      ?.montant ?? 0
  );
}

export function sommeParts(parts: readonly PartPaiement[]): number {
  return partsNumeriques(parts).reduce((s, p) => s + p.montant, 0);
}

export function resteARepartir(
  total: number,
  parts: readonly PartPaiement[],
): number {
  return arrondiFcfa(total) - sommeParts(parts);
}

export function montantRestePart(
  total: number,
  parts: readonly PartPaiement[],
  mode: ModePaiement,
): number {
  const t = arrondiFcfa(total);
  const autres = partsNumeriques(parts)
    .filter((p) => p.mode !== mode)
    .reduce((s, p) => s + p.montant, 0);
  return Math.max(0, t - autres);
}

export function repartitionComplete(
  total: number,
  parts: readonly PartPaiement[],
): boolean {
  const nums = partsNumeriques(parts);
  if (nums.length === 0 || nums.some((p) => p.montant <= 0)) return false;
  return Math.abs(resteARepartir(total, parts)) < TOLERANCE_REPARTITION_FCFA;
}

/**
 * Monnaie = billets remis − part espèces du ticket.
 * Jamais reçu − total, jamais le montant du premier mode s’il n’est pas espèces.
 */
export function monnaieARendre(recu: number, cashPart: number): number {
  if (cashPart <= 0) return 0;
  return arrondiFcfa(recu) - arrondiFcfa(cashPart);
}

export function especesRecuesOk(
  recu: number,
  parts: readonly PartPaiement[],
): boolean {
  const cash = partEspeces(parts);
  if (cash <= 0) return true;
  return arrondiFcfa(recu) >= cash;
}

export function toggleModePaiement(
  parts: readonly PartPaiement[],
  mode: ModePaiement,
  total: number,
): PartPaiement[] {
  const t = arrondiFcfa(total);
  const existe = parts.some((p) => p.mode === mode);
  if (existe) {
    if (parts.length === 1) return [...parts];
    const next = parts.filter((p) => p.mode !== mode);
    if (next.length === 1) {
      return [{ mode: next[0]!.mode, montant: String(t) }];
    }
    return next;
  }
  if (parts.length === 1) {
    return [
      { mode: parts[0]!.mode, montant: '' },
      { mode, montant: '' },
    ];
  }
  const reste = resteARepartir(t, parts);
  return [
    ...parts,
    { mode, montant: reste > 0 ? String(reste) : '' },
  ];
}

/** Mixte 2 modes : saisir une part complète l’autre (total − saisie). Ne touche pas le reçu. */
export function completerPartMixte(
  parts: readonly PartPaiement[],
  modeEdite: ModePaiement,
  montantSaisi: string,
  total: number,
): PartPaiement[] {
  const updated = parts.map((p) =>
    p.mode === modeEdite ? { ...p, montant: montantSaisi } : p,
  );
  if (updated.length !== 2) return updated;
  if (montantSaisi.trim() === '') {
    return updated.map((p) =>
      p.mode === modeEdite ? p : { ...p, montant: '' },
    );
  }
  const autre = updated.find((p) => p.mode !== modeEdite);
  if (!autre) return updated;
  const reste = montantRestePart(total, updated, autre.mode);
  return updated.map((p) =>
    p.mode === autre.mode ? { ...p, montant: String(reste) } : p,
  );
}

export type SyntheseEncaissement = {
  total: number;
  cashPart: number;
  aEspeces: boolean;
  recu: number;
  monnaie: number;
  repartitionOk: boolean;
  especesOk: boolean;
  peutValider: boolean;
};

/**
 * Source unique mixte / espèces.
 * `recuEspeces` = billets tapés (indépendant des parts).
 * `cashPart` = uniquement la ligne ESPECES.
 */
export function syntheseEncaissement(params: {
  totalNet: number;
  parts: readonly PartPaiement[];
  recuEspeces: number;
}): SyntheseEncaissement {
  const total = arrondiFcfa(params.totalNet);
  const cashPart = partEspeces(params.parts);
  const aEspeces = cashPart > 0;
  const recu = aEspeces ? arrondiFcfa(params.recuEspeces) : 0;
  const monnaie = aEspeces ? monnaieARendre(recu, cashPart) : 0;
  const repartitionOk = repartitionComplete(total, params.parts);
  const especesOk = especesRecuesOk(recu, params.parts);
  return {
    total,
    cashPart,
    aEspeces,
    recu,
    monnaie,
    repartitionOk,
    especesOk,
    peutValider: repartitionOk && especesOk && total > 0,
  };
}
