import { getOfflineStore, hydrateOffline } from '@caisse-crm/offline';

// Panier POS mis en attente — pas une vente serveur : aucun stock décrémenté,
// aucun ticket encaissé. Pratique de surface (client suivant / file de caisse).
// Port mobile de apps/web/src/lib/offline/pos-holds.ts — sans le cache
// synchrone localStorage (indisponible en RN) : l'hydratation est toujours
// asynchrone via getOfflineStore() (SQLite sur mobile), cf. FileAttenteScreen.

export interface LignePanierHold {
  produitId: string;
  designation: string;
  reference: string | null;
  prixUnitaire: string;
  stock: number;
  quantite: number;
  remise: number;
}

export type MotifAttente =
  | 'OUBLI_PAIEMENT'
  | 'ARTICLE'
  | 'FIDELITE'
  | 'AUTRE';

export const MOTIFS_ATTENTE: { id: MotifAttente; label: string }[] = [
  { id: 'OUBLI_PAIEMENT', label: 'Oubli moyen de paiement' },
  { id: 'ARTICLE', label: 'Va chercher un article' },
  { id: 'FIDELITE', label: 'Carte / fiche client' },
  { id: 'AUTRE', label: 'Autre' },
];

export interface CommandeEnAttente {
  id: string;
  numero: number;
  libelle: string;
  motif: MotifAttente;
  clientId: string | null;
  panier: LignePanierHold[];
  remisePanier: string;
  createdAt: string;
}

function isMotif(value: unknown): value is MotifAttente {
  return (
    value === 'OUBLI_PAIEMENT' ||
    value === 'ARTICLE' ||
    value === 'FIDELITE' ||
    value === 'AUTRE'
  );
}

function normalizeHold(raw: unknown): CommandeEnAttente | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (typeof h.id !== 'string' || !Array.isArray(h.panier)) return null;
  return {
    id: h.id,
    numero: typeof h.numero === 'number' && h.numero > 0 ? h.numero : 0,
    libelle: typeof h.libelle === 'string' && h.libelle.trim() ? h.libelle : 'Ticket',
    motif: isMotif(h.motif) ? h.motif : 'AUTRE',
    clientId: typeof h.clientId === 'string' ? h.clientId : null,
    panier: h.panier as LignePanierHold[],
    remisePanier: typeof h.remisePanier === 'string' ? h.remisePanier : '',
    createdAt: typeof h.createdAt === 'string' ? h.createdAt : new Date().toISOString(),
  };
}

export async function hydrateHolds(sessionId: string): Promise<CommandeEnAttente[]> {
  await hydrateOffline();
  const raw = await getOfflineStore().getHolds(sessionId);
  const list = Array.isArray(raw)
    ? raw.map(normalizeHold).filter((h): h is CommandeEnAttente => h !== null)
    : [];
  let max = Math.max(0, ...list.map((h) => h.numero));
  return list.map((h) => {
    if (h.numero > 0) return h;
    max += 1;
    return { ...h, numero: max };
  });
}

export function saveHolds(sessionId: string, holds: CommandeEnAttente[]): void {
  void getOfflineStore().setHolds(sessionId, holds);
}

export function clearHolds(sessionId: string): void {
  void getOfflineStore().setHolds(sessionId, []);
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

export function holdsDepuisApi(raw: unknown): CommandeEnAttente[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeHold)
    .filter((h): h is CommandeEnAttente => h !== null);
}

export function payloadReservation(hold: CommandeEnAttente) {
  return {
    holdId: hold.id,
    numero: hold.numero,
    libelle: hold.libelle,
    motif: hold.motif,
    clientId: hold.clientId,
    remisePanier: hold.remisePanier,
    lignes: hold.panier.map((l) => ({
      produitId: l.produitId,
      quantite: l.quantite,
    })),
    panier: hold.panier,
  };
}

export function prochainNumero(holds: CommandeEnAttente[]): number {
  return Math.max(0, ...holds.map((h) => h.numero)) + 1;
}

export function labelMotif(motif: MotifAttente): string {
  return MOTIFS_ATTENTE.find((m) => m.id === motif)?.label ?? 'Autre';
}

export function nbArticlesHold(panier: LignePanierHold[]): number {
  return panier.reduce((s, l) => s + l.quantite, 0);
}

export function montantHold(panier: LignePanierHold[]): number {
  return panier.reduce(
    (t, l) => t + Number(l.prixUnitaire) * l.quantite - l.remise,
    0,
  );
}

export function formatDureeAttente(createdAt: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function holdsFifo(holds: CommandeEnAttente[]): CommandeEnAttente[] {
  return [...holds].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function formatNumeroAttente(numero: number): string {
  return String(numero).padStart(2, '0');
}
