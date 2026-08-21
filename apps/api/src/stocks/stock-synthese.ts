import { Prisma } from '@prisma/client';

/** Fenêtre de vélocité des ventes pour la couverture de stock (jours). */
export const FENETRE_VENTES_JOURS = 14;

export type StatutStockLigne = 'RUPTURE' | 'SOUS_SEUIL' | 'OK';
export type SanteStock = 'OK' | 'VIGILANCE' | 'CRITIQUE';

export interface StockSyntheseDto {
  genereAt: string;
  fenetreVentesJours: number;
  sante: SanteStock;
  kpis: {
    skuDistincts: number;
    unitesTotales: number;
    valeurStock: string;
    ruptures: number;
    sousSeuil: number;
    couvertureJoursMediane: number | null;
  };
  parEntrepot: Array<{
    entrepotId: string;
    code: string;
    nom: string;
    boutiqueId: string;
    nomBoutique: string;
    unites: number;
    valeur: string;
    ruptures: number;
    sousSeuil: number;
  }>;
  lignes: Array<{
    produitId: string;
    designation: string;
    reference: string | null;
    categorie: string | null;
    actif: boolean;
    seuilReappro: number | null;
    coutMoyenPondere: string;
    stockReseau: number;
    valeur: string;
    ventesUnites14j: number;
    couvertureJours: number | null;
    statut: StatutStockLigne;
    parEntrepot: Array<{
      entrepotId: string;
      quantite: number;
      statut: StatutStockLigne;
    }>;
    stockPrevu: number;
  }>;
  suggestionsTransfert: Array<{
    produitId: string;
    designation: string;
    entrepotSourceId: string;
    sourceCode: string;
    sourceQuantite: number;
    entrepotDestId: string;
    destCode: string;
    destQuantite: number;
    destStatut: StatutStockLigne;
    quantiteSuggeree: number;
    motif: string;
  }>;
  suggestionsReappro: Array<{
    produitId: string;
    designation: string;
    reference: string | null;
    deficit: number;
    motif: string;
  }>;
}

export function statutQuant(
  quantite: number,
  seuil: number | null,
): StatutStockLigne {
  if (quantite <= 0) return 'RUPTURE';
  if (seuil !== null && quantite <= seuil) return 'SOUS_SEUIL';
  return 'OK';
}

export function worstStatut(
  a: StatutStockLigne,
  b: StatutStockLigne,
): StatutStockLigne {
  const rank: Record<StatutStockLigne, number> = {
    RUPTURE: 2,
    SOUS_SEUIL: 1,
    OK: 0,
  };
  return rank[a] >= rank[b] ? a : b;
}

/** Unités manquantes pour sortir de rupture / passer au-dessus du seuil. */
export function deficitStock(quantite: number, seuil: number | null): number {
  if (quantite <= 0) return seuil !== null && seuil > 0 ? seuil : 1;
  if (seuil !== null && quantite <= seuil) return seuil - quantite;
  return 0;
}

/**
 * Unités transférables sans descendre la source sous son seuil.
 * Sans seuil : on conserve au moins 1 unité (ne pas vider l'emplacement).
 */
export function surplusStock(quantite: number, seuil: number | null): number {
  if (seuil !== null) return Math.max(0, quantite - seuil);
  return Math.max(0, quantite - 1);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 10) / 10;
}

export function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export function syntheseVide(): StockSyntheseDto {
  return {
    genereAt: new Date().toISOString(),
    fenetreVentesJours: FENETRE_VENTES_JOURS,
    sante: 'OK',
    kpis: {
      skuDistincts: 0,
      unitesTotales: 0,
      valeurStock: '0.00',
      ruptures: 0,
      sousSeuil: 0,
      couvertureJoursMediane: null,
    },
    parEntrepot: [],
    lignes: [],
    suggestionsTransfert: [],
    suggestionsReappro: [],
  };
}
