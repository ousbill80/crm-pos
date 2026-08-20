import type { StatutTransaction, TypeCaisse, TypeTransaction } from '@caisse-crm/shared';

export interface TransactionDto {
  id: string;
  type: TypeTransaction;
  montant: string;
  dateHeure: string;
  statut: StatutTransaction;
  caisseId: string;
  initiateurId: string;
}

export interface CaisseDto {
  id: string;
  type: TypeCaisse;
  soldeCourant: string;
  boutiqueId: string | null;
}
