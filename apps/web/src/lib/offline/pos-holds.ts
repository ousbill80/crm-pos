// Panier POS mis en attente — pas une vente serveur : aucun stock décrémenté,
// aucun ticket encaissé. Pratique de surface (client suivant).

export interface LignePanierHold {
  produitId: string;
  designation: string;
  reference: string | null;
  prixUnitaire: string;
  stock: number;
  quantite: number;
  remise: number;
}

export interface CommandeEnAttente {
  id: string;
  libelle: string;
  panier: LignePanierHold[];
  remisePanier: string;
  createdAt: string;
}

const prefix = 'caisse-crm.pos.holds.';

function key(sessionId: string): string {
  return `${prefix}${sessionId}`;
}

export function loadHolds(sessionId: string): CommandeEnAttente[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CommandeEnAttente[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHolds(sessionId: string, holds: CommandeEnAttente[]): void {
  try {
    if (holds.length === 0) {
      localStorage.removeItem(key(sessionId));
      return;
    }
    localStorage.setItem(key(sessionId), JSON.stringify(holds));
  } catch {
    // quota
  }
}

export function clearHolds(sessionId: string): void {
  localStorage.removeItem(key(sessionId));
}

export function quantiteParquee(
  holds: CommandeEnAttente[],
  produitId: string,
): number {
  return holds.reduce((total, hold) => {
    const ligne = hold.panier.find((l) => l.produitId === produitId);
    return total + (ligne?.quantite ?? 0);
  }, 0);
}

export function prochainLibelleAttente(holds: CommandeEnAttente[]): string {
  const nums = holds.map((h) => {
    const m = /^Ticket (\d+)$/.exec(h.libelle);
    return m ? Number(m[1]) : 0;
  });
  return `Ticket ${Math.max(0, ...nums) + 1}`;
}
