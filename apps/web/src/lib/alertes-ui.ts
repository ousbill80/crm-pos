/** Types et navigation alertes §6.7 — partagés systray + page Alertes. */
export interface AlerteDto {
  type: 'ECART_CAISSE' | 'VERSEMENT_EN_RETARD' | 'ACCES_REFUSE' | 'STOCK_BAS';
  severite: 'WARNING' | 'CRITICAL';
  message: string;
  dateHeure: string;
  entite: string;
  entiteId: string;
}

export const TYPE_LABEL: Record<AlerteDto['type'], string> = {
  ECART_CAISSE: 'Écart de caisse',
  VERSEMENT_EN_RETARD: 'Versement en retard',
  ACCES_REFUSE: 'Accès refusé',
  STOCK_BAS: 'Stock bas',
};

export function hrefAlerte(a: AlerteDto): string {
  if (a.type === 'ECART_CAISSE' || a.type === 'VERSEMENT_EN_RETARD') {
    return `/transactions/${a.entiteId}`;
  }
  if (a.type === 'STOCK_BAS') return `/produits/${a.entiteId}`;
  return '/audit';
}

export function formatAlerteRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'À l’instant';
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
