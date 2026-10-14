import type { NavigatorScreenParams } from '@react-navigation/native';
import type {
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';

/** Stack sous l’onglet Vente (POS). */
export type PosStackParamList = {
  PosHome: { scannedCode?: string; resumeHoldId?: string } | undefined;
  EtatSession: { sessionId: string };
  /** Tickets mis en attente (park POS) — §6.4, hors circuit trésorerie. */
  TicketsAttente: { sessionId: string };
};

/** Stack sous l’onglet Circuit. */
export type CircuitStackParamList = {
  CircuitList: undefined;
  CircuitDetail: { transactionId: string };
  NouveauVersement: undefined;
};

/** Stack sous l’onglet Ventes — consultation réseau en lecture seule (rôles sièges, §6.3.4). */
export type VentesStackParamList = {
  VentesDashboard: undefined;
};

/** Stack sous l’onglet Soldes. */
export type CaissesStackParamList = {
  CaissesList: undefined;
  CaisseSolde: {
    caisseId: string;
    libelle?: string;
    type?: string;
  };
  CircuitDetail: { transactionId: string };
};

/** Stack sous l’onglet Inventaire. */
export type InventaireStackParamList = {
  InventaireList: undefined;
  InventaireDetail: { sessionId: string };
  /** Vue détail lecture seule du stock d'un entrepôt (synthèse temps réel). */
  StockEntrepotDetail: { entrepotId: string; label?: string };
};

export type P2pStackParamList = {
  P2pHub: undefined;
  PurchaseRequests: undefined;
  PurchaseRecommendations: undefined;
  PurchaseRequestCreate: undefined;
  PurchaseRequestDetail: { id: string };
  PurchaseOrders: undefined;
  PurchaseOrderDetail: { id: string };
  OrderImport: { id: string };
  PurchaseReceipts: undefined;
  PurchaseReceiptCreate: undefined;
  PurchaseReceiptDetail: { id: string };
  SupplierReturnCreate: { receiptId: string };
  SupplierInvoices: undefined;
  SupplierInvoiceDetail: { id: string };
  P2pAccounting: undefined;
  AccountingAi: undefined;
};

/** Stack sous l’onglet Pose (technicien atelier — scan QR reçu pose). */
export type PoseStackParamList = {
  PoseScan: undefined;
};

export type MainTabParamList = {
  Caisse: NavigatorScreenParams<PosStackParamList>;
  Ventes: NavigatorScreenParams<VentesStackParamList>;
  Circuit: NavigatorScreenParams<CircuitStackParamList>;
  Caisses: NavigatorScreenParams<CaissesStackParamList>;
  Inventaire: NavigatorScreenParams<InventaireStackParamList>;
  P2p: NavigatorScreenParams<P2pStackParamList>;
  Pose: NavigatorScreenParams<PoseStackParamList>;
};

export type RootStackParamList = {
  Login: undefined;
  ChangePassword: undefined;
  HorsPerimetre: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  /** Modal plein écran — hors barre d’onglets volontairement. */
  Scanner: undefined;
  /** Détail de la file hors-ligne (§6.7) — modal plein écran. */
  FileAttente: undefined;
};

export interface CaisseDto {
  id: string;
  type: TypeCaisse | string;
  boutiqueId: string | null;
  libelle?: string | null;
  actif?: boolean;
}

export interface TransactionDto {
  id: string;
  type: TypeTransaction | string;
  montant: string;
  dateHeure: string;
  statut: StatutTransaction | string;
  caisseId: string;
  initiateurId: string;
  initiateur?: { nom: string; prenom: string } | null;
  transactionSourceId?: string | null;
  bordereau?: {
    montantDeclare: string;
    dateEmission: string;
    reception?: {
      montantRecu: string;
      ecart: string;
      statutFinal: string;
      validateur?: { nom: string; prenom: string } | null;
      dateReception: string;
    } | null;
  } | null;
  caisse?: CaisseDto & {
    boutique?: { id: string; nom: string } | null;
  };
  regularisation?: {
    montantRetenu: string;
    motif: string;
    dateRegularisation: string;
    validateur?: { nom: string; prenom: string } | null;
  } | null;
}

export interface SoldeDto {
  caisseId: string;
  solde: string | number;
}

/** Reflet minimal de ReportingDashboardDto (API) — seuls les champs consommés par le mobile. */
export interface ReportingDashboardDto {
  genereAt: string;
  chiffreAffaires: {
    total: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      montant: string;
    }>;
    parModePaiement: Array<{ modePaiement: string; montant: string }>;
  };
  versements: {
    enRetard24h: number;
  };
  ecarts: {
    nombreLitiges: number;
    montantEcartsAbsolus: string;
  };
}

export interface VenteQuotidienneDto {
  date: string;
  total: string;
  nombre: number;
}

/** Reflet minimal de classement() (API /produits/classement) — top des ventes 30 j. */
export interface MeilleureVenteDto {
  produit: {
    id: string;
    designation: string;
    reference: string;
    categorie: string | null;
  };
  quantiteVendue: number;
  chiffreAffaires: string;
}

export interface ClassementProduitsDto {
  fenetreJours: number;
  meilleuresVentes: MeilleureVenteDto[];
}

export type StatutStockLigne = 'RUPTURE' | 'SOUS_SEUIL' | 'OK';
export type SanteStock = 'OK' | 'VIGILANCE' | 'CRITIQUE';

/** Reflet de StockSyntheseDto (API) — stock réseau en temps réel par entrepôt. */
export interface StockSyntheseDto {
  genereAt: string;
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
}

/** Reflet minimal de listerQuants() (API GET /stocks?entrepotId=) — lignes de stock par produit. */
export interface StockQuantDto {
  id: string;
  produitId: string;
  entrepotId: string;
  quantite: number;
  quantiteReservee: number;
  produit: {
    designation: string;
    seuilReappro: number | null;
    prixUnitaire: string;
  };
  entrepot: {
    nom: string;
    code: string;
    boutiqueId: string;
    boutique: { nom: string };
  };
}
