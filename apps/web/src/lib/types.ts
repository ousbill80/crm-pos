import type {
  NiveauFidelite,
  SegmentClient,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';

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

export interface FideliteDto {
  id: string;
  clientId: string;
  pointsCumules: number;
  niveau: NiveauFidelite;
}

export interface ClientDto {
  id: string;
  nom: string;
  prenom: string;
  contact: string | null;
  dateNaissance: string | null;
  segment: SegmentClient;
  consentementMarketing: boolean;
  fidelite: FideliteDto | null;
}

export interface ProduitDto {
  id: string;
  designation: string;
  prixUnitaire: string;
  stock: number;
}

export interface LigneVenteDto {
  id: string;
  venteId: string;
  produitId: string;
  produit: ProduitDto;
  quantite: number;
  prixUnitaire: string;
}

export interface VenteHistoriqueDto {
  id: string;
  dateVente: string;
  montantTotal: string;
  caisseId: string;
  caisse: CaisseDto;
  clientId: string | null;
  lignes: LigneVenteDto[];
}
