import type { ModePaiement } from '@caisse-crm/shared';
import { ModePaiement as Modes } from '@caisse-crm/shared';

export const MODES_POS: Array<{ mode: ModePaiement; label: string }> = [
  { mode: Modes.ESPECES, label: 'Espèces' },
  { mode: Modes.CARTE, label: 'Carte' },
  { mode: Modes.MOBILE_MONEY, label: 'Mobile Money' },
];

/** Même plafond UI/API que le web POS. */
export const REMISE_MAX_RATIO = 0.2;

/** Tolérance FCFA sur somme des parts (arrondis). */
export const TOLERANCE_REPARTITION_FCFA = 0.5;

export interface LignePanier {
  produitId: string;
  designation: string;
  prixUnitaire: string;
  quantite: number;
  remise: number;
  imageUrl?: string | null;
}

export interface PartPaiement {
  mode: ModePaiement;
  montant: string;
}

/** FCFA : arrondi à l’unité (pas de centimes en caisse). */
export function arrondiFcfa(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function brutLigne(l: LignePanier): number {
  return arrondiFcfa(Number(l.prixUnitaire) * l.quantite);
}

export function totalBrut(panier: LignePanier[]): number {
  return panier.reduce((s, l) => s + brutLigne(l), 0);
}

export function totalNet(panier: LignePanier[]): number {
  return panier.reduce(
    (s, l) => s + Math.max(0, brutLigne(l) - arrondiFcfa(l.remise)),
    0,
  );
}

export function remiseFideliteFcfa(totalAvantFidelite: number, pct: number): number {
  if (totalAvantFidelite <= 0 || pct <= 0) return 0;
  return Math.min(
    totalAvantFidelite,
    arrondiFcfa((totalAvantFidelite * pct) / 100),
  );
}

export function plafondRemise(brut: number): number {
  return arrondiFcfa(brut * REMISE_MAX_RATIO);
}

/**
 * Quantité restant disponible à l'ajout pour un produit, compte tenu de ce
 * qui est déjà au panier, réservé dans les tickets en attente et consommé par
 * les ventes locales non synchronisées. Jamais négative.
 */
export function stockDisponible(
  stock: number,
  quantitePanier: number,
  quantiteParquee = 0,
  quantiteOutbox = 0,
): number {
  return Math.max(
    0,
    stock - quantitePanier - quantiteParquee - quantiteOutbox,
  );
}

/**
 * Vrai si la quantité déjà au panier a atteint (ou dépassé) le stock connu —
 * ajouter une unité de plus exigerait une dérogation `STOCK_INSUFFISANT`.
 */
export function atteintLimiteStock(stock: number, quantiteActuelle: number): boolean {
  return stockDisponible(stock, quantiteActuelle) <= 0;
}

/**
 * Remise saisie en % → montant FCFA. Le montant demandé n'est pas tronqué :
 * au-delà de 20 %, l'UI exige une dérogation et le serveur la vérifie.
 */
export function montantRemiseDepuisPourcent(
  brut: number,
  pourcent: number,
): number {
  if (brut <= 0 || pourcent <= 0) return 0;
  const pct = Math.max(0, pourcent);
  return arrondiFcfa((brut * pct) / 100);
}

/** Répartit une remise panier (montant FCFA) proportionnellement aux lignes. */
export function appliquerRemisePanier(
  panier: LignePanier[],
  remiseTotale: number,
  autoriserDepassement = false,
): LignePanier[] {
  const brut = totalBrut(panier);
  if (remiseTotale <= 0 || brut <= 0) {
    return panier.map((l) => ({ ...l, remise: 0 }));
  }
  const plafond = Math.min(arrondiFcfa(remiseTotale), brut);
  let reste = plafond;
  return panier.map((l, i) => {
    const brutDeLigne = brutLigne(l);
    const cible =
      i === panier.length - 1
        ? reste
        : arrondiFcfa((brutDeLigne / brut) * plafond);
    const maxSansDerogation = Math.floor(brutDeLigne * REMISE_MAX_RATIO);
    const remise = Math.max(
      0,
      Math.min(cible, autoriserDepassement ? brutDeLigne : maxSansDerogation),
    );
    reste -= remise;
    return { ...l, remise };
  });
}

export function partsInitiales(total: number): PartPaiement[] {
  return [{ mode: Modes.ESPECES, montant: String(arrondiFcfa(total)) }];
}

export function partsNumeriques(
  parts: PartPaiement[],
): Array<{ mode: ModePaiement; montant: number }> {
  return parts.map((p) => ({
    mode: p.mode,
    montant: arrondiFcfa(Number(p.montant) || 0),
  }));
}

export function sommeParts(parts: PartPaiement[]): number {
  return partsNumeriques(parts).reduce((s, p) => s + p.montant, 0);
}

export function resteARepartir(total: number, parts: PartPaiement[]): number {
  return arrondiFcfa(total) - sommeParts(parts);
}

/** Montant à affecter à un mode pour compléter la répartition (= total − autres parts). */
export function montantRestePart(
  total: number,
  parts: PartPaiement[],
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
  parts: PartPaiement[],
): boolean {
  const nums = partsNumeriques(parts);
  if (nums.length === 0 || nums.some((p) => p.montant <= 0)) return false;
  return Math.abs(resteARepartir(total, parts)) < TOLERANCE_REPARTITION_FCFA;
}

/**
 * Bascule un mode (comme le web) : 1 mode = montant = total ;
 * 2+ modes = montants saisis, reste affiché.
 */
export function toggleModePaiement(
  parts: PartPaiement[],
  mode: ModePaiement,
  total: number,
): PartPaiement[] {
  const t = arrondiFcfa(total);
  const existe = parts.some((p) => p.mode === mode);
  if (existe) {
    if (parts.length === 1) return parts;
    const next = parts.filter((p) => p.mode !== mode);
    if (next.length === 1) {
      return [{ mode: next[0].mode, montant: String(t) }];
    }
    return next;
  }
  if (parts.length === 1) {
    return [
      { mode: parts[0].mode, montant: '' },
      { mode, montant: '' },
    ];
  }
  const reste = resteARepartir(t, parts);
  return [
    ...parts,
    { mode, montant: reste > 0 ? String(reste) : '' },
  ];
}

export function synchroniserPartsAuTotal(
  parts: PartPaiement[],
  total: number,
): PartPaiement[] {
  if (parts.length === 1) {
    return [{ mode: parts[0].mode, montant: String(arrondiFcfa(total)) }];
  }
  return parts;
}

export function paiementsDepuisParts(
  parts: PartPaiement[],
): Array<{ modePaiement: ModePaiement; montant: number }> {
  return partsNumeriques(parts)
    .filter((p) => p.montant > 0)
    .map((p) => ({ modePaiement: p.mode, montant: p.montant }));
}

export function modePrincipal(
  paiements: Array<{ modePaiement: ModePaiement; montant: number }>,
): ModePaiement {
  if (paiements.length === 0) return Modes.ESPECES;
  const hasCash = paiements.find((p) => p.modePaiement === Modes.ESPECES);
  if (hasCash && hasCash.montant > 0) return Modes.ESPECES;
  return [...paiements].sort((a, b) => b.montant - a.montant)[0].modePaiement;
}

export const RAPIDE_ESPECES = [500, 1000, 2000, 5000, 10_000] as const;

export function partEspeces(parts: PartPaiement[]): number {
  return (
    partsNumeriques(parts).find((p) => p.mode === Modes.ESPECES)?.montant ?? 0
  );
}

/**
 * Monnaie à rendre = reçu espèces − part espèces du ticket.
 * Jamais reçu − total ticket (erreur mixte).
 */
export function monnaieARendre(recu: number, cashPart: number): number {
  if (cashPart <= 0) return 0;
  return arrondiFcfa(recu) - arrondiFcfa(cashPart);
}

export function especesRecuesOk(recu: number, parts: PartPaiement[]): boolean {
  const cash = partEspeces(parts);
  if (cash <= 0) return true;
  return arrondiFcfa(recu) >= cash;
}

/**
 * Reçu espèces initial / après changement de modes :
 * toujours Exact sur la part espèces (pas le total mixte).
 */
export function recuEspecesParDefaut(cashPart: number): string {
  if (cashPart <= 0) return '';
  return String(arrondiFcfa(cashPart));
}

/**
 * Synthèse paiement — source unique pour UI + ticket.
 * Invariant : monnaie = reçu − cashPart (si cashPart > 0).
 */
export function syntheseEncaissement(params: {
  totalNet: number;
  parts: PartPaiement[];
  recuEspeces: number;
}): {
  total: number;
  cashPart: number;
  aEspeces: boolean;
  recu: number;
  monnaie: number;
  repartitionOk: boolean;
  especesOk: boolean;
  peutValider: boolean;
} {
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

/** @deprecated — tests legacy. */
export function construirePaiements(
  total: number,
  mode: ModePaiement,
  mixte: boolean,
  partEspecesAmt: number,
  modeSecondaire: ModePaiement,
): Array<{ modePaiement: ModePaiement; montant: number }> {
  if (!mixte || mode === Modes.ESPECES) {
    return [{ modePaiement: mode, montant: arrondiFcfa(total) }];
  }
  const especes = Math.max(0, Math.min(arrondiFcfa(partEspecesAmt), arrondiFcfa(total)));
  const reste = arrondiFcfa(total) - especes;
  if (especes <= 0) return [{ modePaiement: modeSecondaire, montant: arrondiFcfa(total) }];
  if (reste <= 0) return [{ modePaiement: Modes.ESPECES, montant: arrondiFcfa(total) }];
  return [
    { modePaiement: Modes.ESPECES, montant: especes },
    { modePaiement: modeSecondaire, montant: reste },
  ];
}
