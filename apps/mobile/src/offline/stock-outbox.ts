import type { OutboxOp } from '@caisse-crm/offline';

const VENTE_PATH = /\/ventes\/sessions\/[^/]+\/ventes$/;

export function quantiteProduitDansVentesOutbox(
  ops: OutboxOp[],
  produitId: string,
): number {
  return ops.reduce((total, op) => {
    if (op.method !== 'POST' || !VENTE_PATH.test(op.path)) return total;
    const lignes = Array.isArray(op.body.lignes) ? op.body.lignes : [];
    return (
      total +
      lignes.reduce((somme, raw) => {
        if (!raw || typeof raw !== 'object') return somme;
        const ligne = raw as Record<string, unknown>;
        if (ligne.produitId !== produitId) return somme;
        const quantite = Number(ligne.quantite);
        return somme + (Number.isFinite(quantite) && quantite > 0 ? quantite : 0);
      }, 0)
    );
  }, 0);
}
