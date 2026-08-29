/** Lookup caisse : pistolet USB (clavier + Entrée), caméra, saisie manuelle. */

export function normaliserCodeScan(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Variantes qu’un pistolet / une caméra peut envoyer pour le même EAN ou INT. */
export function candidatsCodeScan(raw: string): string[] {
  const seen = new Set<string>();
  const push = (value: string) => {
    const n = value.trim().toLowerCase();
    if (n) seen.add(n);
  };

  const trimmed = raw.trim();
  if (!trimmed) return [];

  push(trimmed);
  push(trimmed.replace(/\s+/g, ''));
  // Identifiant de symbologie AIM (ex. ]C1 Code128, ]E0 EAN).
  push(trimmed.replace(/^\][A-Za-z0-9]{2}/, ''));
  push(trimmed.replace(/[\u0000-\u001f]/g, ''));
  push(trimmed.replace(/[^A-Za-z0-9]/g, ''));

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 8) {
    push(digits);
    if (digits.length === 12) push(`0${digits}`);
    if (digits.length === 13 && digits.startsWith('0')) push(digits.slice(1));
    if (digits.length === 14 && digits.startsWith('0')) {
      push(digits.slice(1));
      if (digits.startsWith('00')) push(digits.slice(2));
    }
    if (digits.startsWith('01') && (digits.length === 15 || digits.length === 16)) {
      const gtin = digits.slice(2);
      push(gtin);
      if (gtin.startsWith('0')) push(gtin.slice(1));
    }
  }

  return [...seen];
}

export function extraireQuantiteScan(raw: string): {
  qte: number | null;
  query: string;
} {
  const trimmed = raw.trim();
  const prefix = /^(\d+)\s*[x*×]\s*(.*)$/i.exec(trimmed);
  if (!prefix) return { qte: null, query: trimmed };
  return {
    qte: Math.max(1, Number(prefix[1])),
    query: prefix[2].trim(),
  };
}

/** Code lu d’un pistolet / étiquette, pas une recherche texte. */
export function ressembleCodePistolet(raw: string): boolean {
  const t = raw.trim().replace(/\s+/g, '');
  if (t.length < 8) return false;
  if (/^\d{8,14}$/.test(t)) return true;
  if (/^int\d{6,}$/i.test(t)) return true;
  if (/^\][A-Za-z0-9]{2}/.test(raw.trim()) && t.length >= 10) return true;
  if (/^[A-Za-z0-9]{10,}$/.test(t)) return true;
  return false;
}

export function produitCorrespondAuCodeExact<
  T extends {
    reference?: string | null;
    codeBarres?: string | null;
    actif?: boolean;
  },
>(produit: T, query: string): boolean {
  return trouverProduitParScan([produit], query) === produit;
}

export function produitContientRechercheCaisse<
  T extends {
    designation: string;
    reference?: string | null;
    codeBarres?: string | null;
  },
>(produit: T, query: string): boolean {
  const q = normaliserCodeScan(query);
  if (!q) return true;
  return (
    produit.designation.toLowerCase().includes(q) ||
    (produit.reference?.toLowerCase().includes(q) ?? false) ||
    (produit.codeBarres?.toLowerCase().includes(q) ?? false)
  );
}

/** Priorité : EAN / code-barres (étiquettes), puis référence SKU. */
export function trouverProduitParScan<
  T extends {
    reference?: string | null;
    codeBarres?: string | null;
    actif?: boolean;
  },
>(produits: readonly T[], query: string): T | undefined {
  const queries = new Set(candidatsCodeScan(query));
  if (queries.size === 0) return undefined;

  const parCode = produits.find((p) => {
    if (p.actif === false || !p.codeBarres) return false;
    return candidatsCodeScan(p.codeBarres).some((c) => queries.has(c));
  });
  if (parCode) return parCode;

  return produits.find((p) => {
    if (p.actif === false || !p.reference) return false;
    return queries.has(normaliserCodeScan(p.reference));
  });
}

export type ResultatScanCaisse<T> =
  | { statut: 'ignore' }
  | { statut: 'qte_seule'; qte: number }
  | { statut: 'ok'; produit: T; qte: number }
  | { statut: 'inconnu'; code: string }
  | { statut: 'rupture'; produit: T }
  | { statut: 'inactif'; produit: T };

export function resoudreScanCaisse<
  T extends {
    designation: string;
    reference?: string | null;
    codeBarres?: string | null;
    actif?: boolean;
  },
>(
  produits: readonly T[],
  raw: string,
  qteSaisie: number,
  stockOf: (produit: T) => number,
  mode: 'saisie' | 'pistolet' = 'saisie',
): ResultatScanCaisse<T> {
  const trimmed = raw.trim();
  if (!trimmed) return { statut: 'ignore' };

  const { qte: qtePrefix, query } = extraireQuantiteScan(trimmed);
  const qte = qtePrefix ?? Math.max(1, qteSaisie);
  if (!query) return { statut: 'qte_seule', qte };

  const exact = trouverProduitParScan(produits, query);
  if (exact) {
    if (exact.actif === false) return { statut: 'inactif', produit: exact };
    if (stockOf(exact) <= 0) return { statut: 'rupture', produit: exact };
    return { statut: 'ok', produit: exact, qte };
  }

  if (mode === 'pistolet' || ressembleCodePistolet(query)) {
    return { statut: 'inconnu', code: query };
  }

  const visibles = produits.filter(
    (p) =>
      p.actif !== false &&
      stockOf(p) > 0 &&
      produitContientRechercheCaisse(p, query),
  );
  if (visibles.length === 1) {
    return { statut: 'ok', produit: visibles[0]!, qte };
  }
  return { statut: 'ignore' };
}

export const PISTOLET_GAP_MS = 80;
export const PISTOLET_MIN_LEN = 6;

export type EtatPistolet = { buffer: string; lastAt: number };

export function etatPistoletVide(): EtatPistolet {
  return { buffer: '', lastAt: 0 };
}

/**
 * Accumule les frappes rapides d’un pistolet USB (wedge clavier).
 * Une saisie humaine (intervalle > 80 ms) réinitialise le buffer.
 */
export function appliquerTouchePistolet(
  etat: EtatPistolet,
  now: number,
  key: string,
): { etat: EtatPistolet; code: string | null } {
  if (
    key === 'Shift' ||
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Meta' ||
    key === 'CapsLock'
  ) {
    return { etat, code: null };
  }

  const courant =
    now - etat.lastAt > PISTOLET_GAP_MS
      ? { buffer: '', lastAt: now }
      : etat;

  if (key === 'Enter' || key === 'NumpadEnter') {
    const code = courant.buffer;
    return {
      etat: { buffer: '', lastAt: now },
      code: code.length >= PISTOLET_MIN_LEN ? code : null,
    };
  }

  if (key.length === 1 && key >= ' ') {
    return {
      etat: { buffer: courant.buffer + key, lastAt: now },
      code: null,
    };
  }

  return { etat: { buffer: courant.buffer, lastAt: now }, code: null };
}
