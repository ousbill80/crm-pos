import type {
  CanalInteraction,
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
  transactionSourceId?: string | null;
  bordereau?: BordereauDto | null;
  caisse?: CaisseDto & {
    boutique?: { id: string; nom: string } | null;
  };
  contreparties?: TransactionDto[];
}

export interface BordereauDto {
  id: string;
  transactionId: string;
  montantDeclare: string;
  dateEmission: string;
  pieceJointe: string | null;
  reception?: ReceptionValidationDto | null;
}

export interface ReceptionValidationDto {
  id: string;
  bordereauId: string;
  montantRecu: string;
  ecart: string;
  statutFinal: StatutTransaction;
  validateurId: string;
  dateReception: string;
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

export interface CampagneCrmDto {
  id: string;
  nom: string;
  message: string;
  segment: SegmentClient | null;
  niveauFidelite: NiveauFidelite | null;
  canal: CanalInteraction;
  dateCreation: string;
  createdById: string;
}

export interface ContactCampagneDto {
  clientId: string;
  nom: string;
  prenom: string;
  contact: string | null;
  pointsCumules: number;
}

export interface TableauDeBordClientDto {
  totalDepense: string;
  nombreAchats: number;
  dateDernierAchat: string | null;
  pointsCumules: number;
  niveauFidelite: NiveauFidelite;
}

export type StatutStock = 'RUPTURE' | 'SOUS_SEUIL' | 'OK';

export interface ProduitDto {
  id: string;
  designation: string;
  reference: string | null;
  categorie: string | null;
  description: string | null;
  actif: boolean;
  prixUnitaire: string;
  stock: number;
  seuilReappro: number | null;
  coutMoyenPondere: string;
  statutStock: StatutStock;
  margeUnitaire: string;
  tauxMarge: string;
  valeurStock: string;
}

export interface ProduitsSyntheseDto {
  nombreProduits: number;
  actifs: number;
  inactifs: number;
  ruptures: number;
  sousSeuil: number;
  sansSeuil: number;
  margesNegatives: number;
  valeurStock: string;
}

export interface ProduitAnalyseDto {
  produit: ProduitDto;
  repartitionStock: Array<{
    entrepotId: string;
    nom: string;
    code: string;
    quantite: number;
  }>;
  performance30j: {
    quantiteVendue: number;
    chiffreAffaires: string;
    coutDesVentes: string;
    margeBrute: string;
    joursCouverture: number | null;
  };
  suggestionReappro: {
    necessaire: boolean;
    quantiteSuggeree: number;
    motif: string;
  };
}

export interface MouvementStockDto {
  id: string;
  produitId: string;
  type: 'RECEPTION' | 'VENTE' | 'RETOUR' | 'AJUSTEMENT' | 'TRANSFERT_OUT' | 'TRANSFERT_IN';
  entrepotId: string | null;
  quantite: number;
  stockApres: number;
  reference: string | null;
  dateHeure: string;
  utilisateurId: string;
  produit?: { designation: string };
  entrepot?: { code: string; nom: string } | null;
  utilisateur?: { prenom: string; nom: string };
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


export interface SocieteDto {
  id: string;
  raisonSociale: string;
  adresse: string;
  telephone: string | null;
  email: string | null;
  devise: string;
  logoUrl: string | null;
}

export interface ZoneDto {
  id: string;
  nomZone: string;
}

export interface BoutiqueDto {
  id: string;
  nom: string;
  adresse: string;
  zoneId: string;
  code: string | null;
  actif: boolean;
}

export interface EntrepotDto {
  id: string;
  nom: string;
  code: string;
  boutiqueId: string;
  type: 'PRINCIPAL' | 'SECONDAIRE';
  actif: boolean;
  boutique?: { id: string; nom: string };
}

export interface StockQuantDto {
  id: string;
  produitId: string;
  entrepotId: string;
  quantite: number;
  produit: {
    designation: string;
    seuilReappro: number | null;
    coutMoyenPondere?: string;
    prixUnitaire?: string;
    stock?: number;
  };
  entrepot: {
    nom: string;
    code: string;
    boutiqueId: string;
    boutique?: { nom: string };
  };
}

export type StatutStockLigne = 'RUPTURE' | 'SOUS_SEUIL' | 'OK';
export type SanteStock = 'OK' | 'VIGILANCE' | 'CRITIQUE';

export interface StockSyntheseDto {
  genereAt: string;
  fenetreVentesJours: number;
  sante: SanteStock;
  kpis: {
    skuDistincts: number;
    unitesTotales: number;
    valeurStock: string;
    ruptures: number;
    sousSeuil: number;
    couvertureJoursMediane: number | null;
  };
  parEntrepot: Array<{
    entrepotId: string;
    code: string;
    nom: string;
    boutiqueId: string;
    nomBoutique: string;
    unites: number;
    valeur: string;
    ruptures: number;
    sousSeuil: number;
  }>;
  lignes: Array<{
    produitId: string;
    designation: string;
    reference: string | null;
    categorie: string | null;
    actif: boolean;
    seuilReappro: number | null;
    coutMoyenPondere: string;
    stockReseau: number;
    valeur: string;
    ventesUnites14j: number;
    couvertureJours: number | null;
    statut: StatutStockLigne;
    parEntrepot: Array<{
      entrepotId: string;
      quantite: number;
      statut: StatutStockLigne;
    }>;
  }>;
  suggestionsTransfert: Array<{
    produitId: string;
    designation: string;
    entrepotSourceId: string;
    sourceCode: string;
    sourceQuantite: number;
    entrepotDestId: string;
    destCode: string;
    destQuantite: number;
    destStatut: StatutStockLigne;
    quantiteSuggeree: number;
    motif: string;
  }>;
  suggestionsReappro: Array<{
    produitId: string;
    designation: string;
    reference: string | null;
    deficit: number;
    motif: string;
  }>;
}
