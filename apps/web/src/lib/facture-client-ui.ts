/** Facture client B2B — libellés UI (miroirs des règles API documentées). */

export type StatutFactureClient = 'BROUILLON' | 'EMISE' | 'ANNULEE';

export const STATUT_FACTURE: Record<StatutFactureClient, string> = {
  BROUILLON: 'Brouillon',
  EMISE: 'Émise',
  ANNULEE: 'Annulée',
};

export const ACTION_FACTURE: Record<StatutFactureClient, string> = {
  BROUILLON: 'Revenir brouillon',
  EMISE: 'Émettre',
  ANNULEE: 'Annuler',
};

export const MODE_ENCAISSEMENT: Record<string, string> = {
  ESPECES: 'Espèces',
  VIREMENT: 'Virement',
  MOBILE_MONEY: 'Mobile Money',
  CARTE: 'Carte',
};

export function badgeFacture(statut: string): string {
  switch (statut) {
    case 'BROUILLON':
      return 'badge badge-neutral';
    case 'EMISE':
      return 'badge badge-ok';
    case 'ANNULEE':
      return 'badge badge-critical';
    default:
      return 'badge badge-neutral';
  }
}

export { formatFcfa, libelleClient, ligneVide, lignesPayload, lignesValides, montantLigne, totalLignes, type LigneDevisForm as LigneFactureForm } from './devis-ui';
