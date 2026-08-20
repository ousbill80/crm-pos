import type {
  ModePaiement,
  NiveauFidelite,
  SegmentClient,
  StatutSessionCaisse,
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
  seuilReappro: number | null;
  coutMoyenPondere: string;
}

export interface MouvementStockDto {
  id: string;
  produitId: string;
  type: 'RECEPTION' | 'VENTE' | 'RETOUR' | 'AJUSTEMENT';
  quantite: number;
  stockApres: number;
  reference: string | null;
  dateHeure: string;
  utilisateurId: string;
}

export interface LigneVenteDto {
  id: string;
  venteId: string;
  produitId: string;
  produit: ProduitDto;
  quantite: number;
  prixUnitaire: string;
  remise: string;
}

export interface RetourVenteDto {
  id: string;
  venteId: string;
  ligneVenteId: string;
  quantite: number;
  montantRembourse: string;
  sessionCaisseId: string;
  utilisateurId: string;
  dateHeure: string;
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

export interface SessionCaisseDto {
  id: string;
  caisseId: string;
  statut: StatutSessionCaisse;
  ouvertureDateHeure: string;
  fondInitial: string;
  ouvertureUtilisateurId: string;
  ouvertureTemoinId: string;
  clotureDateHeure: string | null;
  fondCompteCloture: string | null;
  clotureUtilisateurId: string | null;
  clotureTemoinId: string | null;
  transactionVersementId: string | null;
}

export interface VenteDto {
  id: string;
  dateVente: string;
  montantTotal: string;
  modePaiement: ModePaiement;
  caisseId: string;
  sessionCaisseId: string;
  clientId: string | null;
  lignes: LigneVenteDto[];
}

export interface ReleveModePaiementDto {
  modePaiement: ModePaiement;
  total: string;
  nombreVentes: number;
}

export interface ClotureSessionResponseDto {
  session: SessionCaisseDto;
  releve: ReleveModePaiementDto[];
  transactionVersementId: string | null;
}

export interface FournisseurDto {
  id: string;
  nom: string;
  contact: string | null;
}

export interface ReceptionStockDto {
  id: string;
  produitId: string;
  fournisseurId: string;
  quantite: number;
  prixAchat: string;
  dateReception: string;
  utilisateurId: string;
}

export interface FournisseurDetailDto extends FournisseurDto {
  receptions: (ReceptionStockDto & { produit: ProduitDto })[];
}
