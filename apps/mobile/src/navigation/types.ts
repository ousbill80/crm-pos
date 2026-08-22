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
};

export type MainTabParamList = {
  Caisse: NavigatorScreenParams<PosStackParamList>;
  Circuit: NavigatorScreenParams<CircuitStackParamList>;
  Caisses: NavigatorScreenParams<CaissesStackParamList>;
  Inventaire: NavigatorScreenParams<InventaireStackParamList>;
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
  transactionSourceId?: string | null;
  bordereau?: {
    montantDeclare: string;
    dateEmission: string;
    reception?: {
      montantRecu: string;
      ecart: string;
      statutFinal: string;
    } | null;
  } | null;
  caisse?: CaisseDto & {
    boutique?: { id: string; nom: string } | null;
  };
  regularisation?: {
    montantRetenu: string;
    motif: string;
    dateRegularisation: string;
  } | null;
}

export interface SoldeDto {
  caisseId: string;
  solde: string | number;
}
