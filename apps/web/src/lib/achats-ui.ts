import type { CommandeAchatDto, FactureFournisseurDto } from './types';

export function fmtFcfa(value: string | number): string {
  return `${Math.round(Number(value)).toLocaleString('fr-FR')} FCFA`;
}

export function fmtDateHeure(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR');
}

export const STATUT_COMMANDE: Record<CommandeAchatDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  SOUMISE_APPROBATION: 'Soumise à approbation',
  APPROUVEE: 'Approuvée',
  REJETEE: 'Rejetée',
  EN_PRODUCTION: 'En production',
  EXPEDIEE: 'Expédiée',
  EN_TRANSIT: 'En transit',
  EN_DOUANE: 'En douane',
  DEDOUANEE: 'Dédouanée',
  CONFIRMEE: 'Confirmée',
  PARTIELLEMENT_RECEPTIONNEE: 'Réception partielle',
  RECEPTIONNEE: 'Réceptionnée',
  CLOTUREE: 'Clôturée',
  ANNULEE: 'Annulée',
};

export function badgeCommande(statut: CommandeAchatDto['statut']): string {
  if (statut === 'ANNULEE') return 'badge';
  if (statut === 'REJETEE') return 'badge badge-critical';
  if (statut === 'CLOTUREE' || statut === 'RECEPTIONNEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_RECEPTIONNEE') return 'badge badge-warning';
  if (statut === 'CONFIRMEE') return 'badge badge-warning';
  return 'badge';
}

export const STATUT_FACTURE: Record<FactureFournisseurDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  COMPTABILISEE: 'Comptabilisée',
  PARTIELLEMENT_PAYEE: 'Partiellement payée',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};

export function badgeFacture(statut: FactureFournisseurDto['statut']): string {
  if (statut === 'PAYEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_PAYEE' || statut === 'COMPTABILISEE') {
    return 'badge badge-warning';
  }
  if (statut === 'ANNULEE') return 'badge';
  return 'badge';
}

export const STATUT_RAPPROCHEMENT: Record<string, string> = {
  A_RAPPROCHER: 'À rapprocher',
  RAPPROCHEE: 'Rapprochée 3 voies',
  LITIGE: 'Litige rapprochement',
  EXCEPTEE: 'Exception DAF/DG',
};

export function badgeRapprochement(statut: string | undefined | null): string {
  if (statut === 'RAPPROCHEE') return 'badge badge-ok';
  if (statut === 'LITIGE') return 'badge badge-critical';
  if (statut === 'EXCEPTEE') return 'badge badge-warning';
  return 'badge';
}

export const MODE_PAIEMENT_FOURN: Record<string, string> = {
  VIREMENT: 'Virement',
  ESPECES: 'Espèces',
  MOBILE_MONEY: 'Mobile money',
};
