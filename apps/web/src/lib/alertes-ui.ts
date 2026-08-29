/** Types et navigation alertes §6.7 — partagés systray + page Alertes. */
export interface AlerteDto {
  type:
    | 'ECART_CAISSE'
    | 'VERSEMENT_EN_RETARD'
    | 'ACCES_REFUSE'
    | 'STOCK_BAS'
    | 'SEUIL_CAISSE_DEPASSE'
    | 'LITIGE_EN_RETARD'
    | 'POINT_JOUR_NON_VERSE'
    | 'RECEPTION_DAF_EN_ATTENTE';
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
  SEUIL_CAISSE_DEPASSE: 'Seuil de caisse',
  LITIGE_EN_RETARD: 'Litige en retard',
  POINT_JOUR_NON_VERSE: 'Fonds non transférés',
  RECEPTION_DAF_EN_ATTENTE: 'Réception DAF',
};

export function hrefAlerte(a: AlerteDto): string {
  if (a.type === 'POINT_JOUR_NON_VERSE') return '/pos';
  if (
    a.type === 'ECART_CAISSE' ||
    a.type === 'VERSEMENT_EN_RETARD' ||
    a.type === 'RECEPTION_DAF_EN_ATTENTE' ||
    a.type === 'LITIGE_EN_RETARD'
  ) {
    return `/transactions/${a.entiteId}`;
  }
  if (a.type === 'STOCK_BAS') return `/produits/${a.entiteId}`;
  if (a.type === 'SEUIL_CAISSE_DEPASSE') return `/caisses/${a.entiteId}`;
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
