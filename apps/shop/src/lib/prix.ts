export function montantTvaUnitaire(opts: {
  prixUnitaireHt?: number | null;
  prixUnitaireTtc?: number | null;
  montantTva?: number | null;
}): number {
  if (opts.montantTva != null) return opts.montantTva;
  const ht = opts.prixUnitaireHt;
  const ttc = opts.prixUnitaireTtc;
  if (ht == null || ttc == null) return 0;
  return Math.round((ttc - ht) * 100) / 100;
}

export function formatTauxTva(taux?: number | null): string | null {
  if (taux == null || Number.isNaN(Number(taux))) return null;
  const n = Number(taux);
  const label = Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return `${label} %`;
}
