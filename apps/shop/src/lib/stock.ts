/** Article commandable sur le web (stock hub showroom). */
export function estCommandable(
  typeProduit: string | undefined,
  stockDisponible: number | null | undefined,
): boolean {
  if (typeProduit === 'PRESTATION') return true;
  if (stockDisponible == null) return true;
  return stockDisponible > 0;
}

/** Quantité max sélectionnable (hub) — 0 si rupture. */
export function quantiteMaxStock(
  stockDisponible: number | null | undefined,
  typeProduit?: string,
  dejaAuPanier = 0,
): number {
  if (typeProduit === 'PRESTATION') return Math.max(0, 20 - dejaAuPanier);
  if (stockDisponible == null) return Math.max(0, 20 - dejaAuPanier);
  return Math.max(0, Math.min(20, stockDisponible - dejaAuPanier));
}

export function libelleStock(
  typeProduit: string | undefined,
  stockDisponible: number | null | undefined,
): string {
  if (stockDisponible == null) {
    return typeProduit === 'PRESTATION'
      ? 'Prestation sur rendez-vous showroom'
      : 'Disponibilité sur demande';
  }
  if (stockDisponible > 0) {
    return `Plus que ${stockDisponible} en stock`;
  }
  return 'Rupture de stock';
}
