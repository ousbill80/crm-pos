import { RoleLibelle, type StatutCommandeAchat, type StatutDemandeAchat } from '@caisse-crm/shared';
import { apiFetch } from './api';

export const P2P_ROLES = {
  lectureAchats: [
    RoleLibelle.DIRECTION_GENERALE, RoleLibelle.DAF, RoleLibelle.CONTROLEUR_INTERNE,
    RoleLibelle.RESPONSABLE_SI, RoleLibelle.SUPERVISEUR_ZONE,
    RoleLibelle.RESPONSABLE_BOUTIQUE, RoleLibelle.ACHATS,
    RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE, RoleLibelle.QUALITE_STOCKS,
    RoleLibelle.RAF_COMPTABLE, RoleLibelle.CAISSIER_CENTRAL,
  ],
  catalogueEcriture: [RoleLibelle.RESPONSABLE_SI, RoleLibelle.DIRECTION_GENERALE, RoleLibelle.DAF],
  demandeEcriture: [RoleLibelle.ACHATS, RoleLibelle.RESPONSABLE_BOUTIQUE],
  demandeApprobation: [RoleLibelle.DAF, RoleLibelle.DIRECTION_GENERALE],
  sourcing: [RoleLibelle.ACHATS],
  commandeSaisie: [RoleLibelle.RESPONSABLE_SI, RoleLibelle.ACHATS, RoleLibelle.RESPONSABLE_BOUTIQUE],
  commandeApprobation: [RoleLibelle.DAF, RoleLibelle.DIRECTION_GENERALE],
  receptionStock: [
    RoleLibelle.RESPONSABLE_SI,
    RoleLibelle.DIRECTION_GENERALE,
    RoleLibelle.DAF,
    RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
  ],
  logistique: [RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE],
  qualite: [RoleLibelle.QUALITE_STOCKS],
  evidenceEcriture: [
    RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    RoleLibelle.QUALITE_STOCKS,
    RoleLibelle.RAF_COMPTABLE,
    RoleLibelle.RESPONSABLE_SI,
  ],
  factureSaisie: [RoleLibelle.RESPONSABLE_SI, RoleLibelle.RAF_COMPTABLE],
  rapprochement: [RoleLibelle.RAF_COMPTABLE],
  exceptionFacture: [RoleLibelle.DAF, RoleLibelle.DIRECTION_GENERALE],
  comptabiliteLecture: [
    RoleLibelle.RAF_COMPTABLE, RoleLibelle.DAF,
    RoleLibelle.DIRECTION_GENERALE, RoleLibelle.CONTROLEUR_INTERNE,
    RoleLibelle.CAISSIER_CENTRAL,
  ],
  comptabiliteEcriture: [RoleLibelle.RAF_COMPTABLE],
  immoDotation: [RoleLibelle.RAF_COMPTABLE, RoleLibelle.DAF],
  paiementApprobation: [RoleLibelle.DAF],
  paiementException: [RoleLibelle.DIRECTION_GENERALE],
  paiementExecution: [RoleLibelle.DAF, RoleLibelle.CAISSIER_CENTRAL],
  aiAudit: [
    RoleLibelle.CONTROLEUR_INTERNE, RoleLibelle.DAF,
    RoleLibelle.DIRECTION_GENERALE, RoleLibelle.RAF_COMPTABLE,
  ],
  aiReview: [RoleLibelle.RAF_COMPTABLE],
  aiRemediation: [RoleLibelle.CONTROLEUR_INTERNE, RoleLibelle.DAF],
  aiPolicyApproval: [RoleLibelle.DAF],
} as const satisfies Record<string, readonly RoleLibelle[]>;

export function hasP2pRole(
  role: RoleLibelle | null | undefined,
  group: keyof typeof P2P_ROLES,
): boolean {
  return Boolean(role && (P2P_ROLES[group] as readonly RoleLibelle[]).includes(role));
}

export function operationId(): string {
  return crypto.randomUUID();
}

export type SensitivePurpose =
  | 'P2P_INVOICE_POST'
  | 'P2P_PAYMENT_APPROVE'
  | 'P2P_PAYMENT_EXCEPTION_APPROVE'
  | 'P2P_PAYMENT_EXECUTE'
  | 'ACCOUNTING_AI_POLICY_CREATE'
  | 'ACCOUNTING_AI_POLICY_APPROVE';

export interface SensitiveChallenge {
  challengeId: string;
  purpose: SensitivePurpose;
  expiresAt: string;
}

export interface CostCentre {
  id: string;
  societeId: string;
  code: string;
  libelle: string;
  actif: boolean;
  boutiqueId: string | null;
  boutique: { id: string; nom: string; zoneId: string } | null;
}

export interface PurchaseBudget {
  id: string;
  centreCoutId: string;
  centreCout: Pick<CostCentre, 'id' | 'code' | 'libelle' | 'societeId' | 'boutiqueId'>;
  libelle: string;
  devise: string;
  montantAlloue: string;
  montantEngage: string;
  montantDisponible: string;
  dateDebut: string;
  dateFin: string;
  actif: boolean;
}

export interface PaymentProposal {
  id: string;
  numero: string;
  societeId: string;
  statut: 'PREPAREE' | 'APPROUVEE' | 'APPROUVEE_EXCEPTION' | 'EXECUTEE' | 'ANNULEE';
  montant: string;
  devise: string;
  mode: string;
  dateExecutionPrevue: string;
  referenceInstruction: string | null;
  compteTresorerie: { id: string; code: string; libelle: string; type: string };
  preparateur: { id: string; nom: string; prenom: string };
  approbateur: { id: string; nom: string; prenom: string } | null;
  allocations: Array<{
    id: string;
    montant: string;
    facture: { id: string; numero: string; fournisseurId: string; fournisseur: { id: string; nom: string } };
  }>;
  paiement: { id: string; datePaiement: string; reference: string | null } | null;
}

export interface PaymentProposalPage {
  items: PaymentProposal[];
  total: number;
  page: number;
  limit: number;
}

export function labelStatutProposition(statut: PaymentProposal['statut']): string {
  if (statut === 'PREPAREE') return 'À approuver (DAF)';
  if (statut === 'APPROUVEE') return 'Seuil DG';
  if (statut === 'APPROUVEE_EXCEPTION') return 'À exécuter';
  if (statut === 'EXECUTEE') return 'Payée';
  return 'Annulée';
}

export interface P2pEvidence {
  id: string;
  type: 'RECEIPT' | 'QUALITY' | 'CUSTOMS' | 'INVOICE';
  sourceId: string;
  societeId: string;
  boutiqueId: string | null;
  mimeType: string;
  tailleOctets: number;
  empreinteSha256: string;
  uploaderId: string;
  dateCreation: string;
}

export interface DemandeAchat {
  id: string;
  numero: string;
  objet: string;
  justification: string | null;
  statut: StatutDemandeAchat;
  montantEstime: string | null;
  devise: string;
  dateCreation: string;
  dateSoumission: string | null;
  dateDecision: string | null;
  motifDecision: string | null;
  initiateurId: string;
  initiateur: { id: string; nom: string; prenom: string };
  approbateur: { id: string; nom: string; prenom: string } | null;
  boutique: { id: string; nom: string; zoneId: string } | null;
  centreCout: { id: string; code: string; libelle: string; societeId: string } | null;
  budget: { id: string; libelle: string; devise: string; montantAlloue: string } | null;
  lignes: Array<{
    id: string; produitId: string | null; designation: string; quantite: number;
    prixEstime: string | null; dateBesoin: string | null;
    produit: { id: string; designation: string; reference: string | null } | null;
  }>;
  consultations: Array<{ id: string; numero: string; statut: string; dateCreation: string }>;
}

export interface RecommandationsAchat {
  entrepot: { id: string; nom: string; boutique: { id: string; nom: string } };
  recommandations: Array<{
    produit: { id: string; designation: string; reference: string | null };
    calculable: boolean;
    raisonNonCalculable: string | null;
    donneesReelles: {
      ventesNettesQuantite: number; stockCourant: number; stockReserve: number;
      stockEnTransit: number; stockMin: number; stockMax: number;
    };
    historiqueFournisseurs: Array<{
      fournisseurId: string; fournisseur: string; receptionsObservees: number;
      delaiMoyenJours: number;
      recommandation: { quantiteSuggeree?: number; pointCommande?: number; [key: string]: unknown };
    }>;
  }>;
}

export interface OffreFournisseur {
  id: string;
  fournisseurId: string;
  fournisseur: { id: string; nom: string };
  devise: string;
  sousTotalMarchandises: string;
  transport: string;
  assurance: string;
  douane: string;
  taxes: string;
  autresCouts: string;
  totalLandedCost: string;
  delaiLivraisonJours: number;
  conditionsPaiement: string | null;
  lignes: Array<{ id: string; ligneDemandeId: string; quantite: number; prixUnitaire: string; montant: string }>;
}

export interface ConsultationAchat {
  id: string;
  numero: string;
  statut: string;
  dateCreation: string;
  dateLimite: string | null;
  notes: string | null;
  demande: DemandeAchat;
  invitations: Array<{ fournisseurId: string; fournisseur: { id: string; nom: string; actif: boolean } }>;
  offres: OffreFournisseur[];
}

export interface ComparaisonOffres {
  consultationId: string;
  numero: string;
  devise: string;
  critereClassement: string;
  formuleTotalLandedCost: string;
  offres: Array<OffreFournisseur & { rang: number }>;
}

export interface ImportCommande {
  id: string;
  statut: StatutCommandeAchat;
  versionCourante: number;
  devise: string;
  tauxChangeSnapshot: string | null;
  incoterm: string | null;
  lieuOrigine: string | null;
  lieuDestination: string | null;
  proformaReference: string | null;
  versions: Array<{ id: string; version: number; motif: string | null; dateCreation: string }>;
  decisionsApprobation: Array<{ id: string; decision: string; motif: string | null; roleSnapshot: string; dateDecision: string }>;
  echeancesPaiement: Array<{ id: string; type: string; ordre: number; pourcentage: string | null; montant: string | null; datePrevue: string | null }>;
  jalons: Array<{ id: string; type: string; datePrevue: string | null; dateReelle: string | null; notes: string | null }>;
  expeditions: ExpeditionImport[];
}

export interface ExpeditionImport {
  id: string;
  mode: 'MARITIME' | 'AERIEN';
  referenceTransport: string;
  transporteur: string | null;
  portAeroportDepart: string | null;
  portAeroportArrivee: string | null;
  dateChargement: string | null;
  eta: string | null;
  conteneurs: Array<{ id: string; numero: string; type: string | null; plomb: string | null }>;
  dossier: {
    id: string; numeroDeclaration: string | null; regimeDouanier: string | null;
    bureauDouane: string | null; dateDeclaration: string | null; declarant: string | null;
    documents: Array<{ id: string; type: string; reference: string; nomFichier: string | null; uri: string | null }>;
    couts: Array<{ id: string; type: string; libelle: string; montant: string; devise: string; tauxChangeSnapshot: string }>;
  } | null;
}

export interface ReceptionP2p {
  id: string;
  numero: string;
  statut: 'QUANTITATIVE' | 'QUALITE_VALIDEE' | 'MISE_EN_STOCK';
  dateReception: string;
  referenceLivraison: string | null;
  commande: { id: string; numero: string; devise: string };
  expedition: { id: string; referenceTransport: string } | null;
  fournisseur: { id: string; nom: string };
  emplacementQuarantaine: { id: string; code: string; nom: string };
  receptionnaire: { id: string; nom: string; prenom: string };
  preuves: Array<{ id: string; type: string; nomFichier: string; uri: string }>;
  lignes: Array<{
    id: string; ligneCommandeId: string; produitId: string; quantiteCommandee: number;
    quantiteRecue: number; prixUnitaireSnapshot: string; motifEcart: string | null;
    produit: { id: string; designation: string; reference: string | null };
    decisionQualite: { id: string; quantiteAcceptee: number; quantiteRejetee: number; motifRejet: string | null } | null;
  }>;
  decisionQualite: { id: string; commentaire: string | null } | null;
  miseEnStock: { id: string; dateMiseEnStock: string; lignes: Array<{ id: string; destinationId: string; quantite: number; coutUnitaireRendu: string }> } | null;
  charges: Array<{ id: string; libelle: string; montant: string; methode: string }>;
  retours: Array<{ id: string; numero: string; statut: string; motif: string; avoirAttendu: boolean; dateExpedition: string | null }>;
}

export interface BalanceRow { id: string; numero: string; intitule: string; debit: string; credit: string; solde: string }
export interface LedgerRow {
  id: string; numeroLigne: number; libelle: string; debit: string; credit: string;
  compte: { id: string; numero: string; intitule: string };
  ecriture: {
    id: string;
    numero: string;
    dateComptable: string;
    sourceType: string;
    devise: string;
    journal: { id: string; code: string; libelle: string; type: string };
  };
}
export interface AgingRow {
  id: string; numero: string; fournisseur: { id: string; nom: string };
  dateEcheance: string | null; montant: string; netAPayer: string | null;
  allocationsPaiement: Array<{ montant: string }>;
}

export interface AccountingPeriod {
  id: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  cloture: boolean;
  exercice: { id: string; code: string; cloture: boolean };
}

export interface AccountingExercice {
  id: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  cloture: boolean;
  _count: { periodes: number; journaux: number; ecritures: number };
}

export interface CompteComptable {
  id: string;
  numero: string;
  intitule: string;
  actif: boolean;
  parentId: string | null;
  parent?: { id: string; numero: string; intitule: string } | null;
}

export interface NatureDepense {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  compte: { id: string; numero: string; intitule: string };
}

export interface CompteTresorerie {
  id: string;
  code: string;
  libelle: string;
  type: string;
  devise: string;
  compteComptable: { id: string; numero: string; intitule: string };
}

export interface FileEcriture {
  id: string;
  sourceType: string;
  sourceId: string;
  statut: 'EN_ATTENTE' | 'POSTEE' | 'ERREUR';
  motif: string | null;
  dateComptable: string;
  dateCreation?: string;
  dateTraitement?: string | null;
  ecritureId?: string | null;
}

export interface StatementPack {
  bilan: {
    actif: Array<{ numero: string; intitule: string; debit: string; credit: string; solde: string }>;
    passif: Array<{ numero: string; intitule: string; debit: string; credit: string; solde: string }>;
    totalActif: string;
    totalPassif: string;
    equilibre: boolean;
  };
  compteResultat: {
    charges: Array<{ numero: string; intitule: string; debit: string; credit: string; solde: string }>;
    produits: Array<{ numero: string; intitule: string; debit: string; credit: string; solde: string }>;
    totalCharges: string;
    totalProduits: string;
    resultat: string;
    benefice: boolean;
  };
}

export interface VatReturn {
  deductible: string;
  collectee: string;
  netAPayer: string;
  creditTva: boolean;
  lignes: Array<{ numero: string; intitule: string; debit: string; credit: string; solde: string }>;
}

export interface LiasseLigne {
  code: string;
  libelle: string;
  montant: string;
  calcule?: boolean;
}

export interface LiassePack {
  mention: string;
  perimetre: {
    mode: 'UNE_SOCIETE' | 'SOCIETE_DANS_MULTI' | 'AGREGAT_NON_CONSOLIDE';
    societeCount: number;
    societeLibelle: string | null;
    message: string;
  };
  bilan: {
    actif: LiasseLigne[];
    passif: LiasseLigne[];
    totalActif: string;
    totalPassif: string;
    equilibre: boolean;
  };
  compteResultat: {
    postes: LiasseLigne[];
    ventes: string;
    achatsCmv: string;
    margeCommerciale: string;
    valeurAjoutee: string;
    ebe: string;
    resultat: string;
    benefice: boolean;
  };
  tft: {
    mode: 'INDIRECT_N_N1' | 'N_SEULEMENT';
    mention: string | null;
    lignes: LiasseLigne[];
  };
  notes: {
    methodes: string[];
    immobilisations: {
      brute: string;
      amortissements: string;
      nette: string;
      source: 'registre' | 'grand_livre';
    };
    encours: { fournisseurs401: string; clients411: string };
    tva: { deductible: string; collectee: string; netAPayer: string };
  };
}

export interface ImmobilisationFiche {
  id: string;
  societeId: string;
  compteId: string;
  libelle: string;
  dateMiseEnService: string;
  valeurBrute: string;
  dureeMois: number;
  valeurResiduelle: string;
  statut: 'EN_SERVICE' | 'SORTI';
  dateSortie: string | null;
  motifSortie: string | null;
  compte: { id: string; numero: string; intitule: string };
  dotations: Array<{
    id: string;
    montant: string;
    periode: { id: string; code: string };
    ecriture: { id: string; numero: string };
  }>;
}

export type JournalComptableType =
  | 'ACHATS'
  | 'BANQUE'
  | 'CAISSE'
  | 'VENTES'
  | 'OPERATIONS_DIVERSES';

export const JOURNAL_TYPES: JournalComptableType[] = [
  'ACHATS',
  'BANQUE',
  'CAISSE',
  'VENTES',
  'OPERATIONS_DIVERSES',
];

export const JOURNAL_TYPE_LABELS: Record<JournalComptableType, string> = {
  ACHATS: 'Achats',
  BANQUE: 'Banque',
  CAISSE: 'Caisse',
  VENTES: 'Ventes',
  OPERATIONS_DIVERSES: 'Opérations diverses',
};

/** Compte SYSCOHADA de tête pour le type de journal. */
export const JOURNAL_TYPE_COMPTE: Record<JournalComptableType, string> = {
  ACHATS: '401 Fournisseurs',
  BANQUE: '521 Banques locales',
  CAISSE: '571 Caisse siège',
  VENTES: '701 Ventes de marchandises',
  OPERATIONS_DIVERSES: 'OD',
};

export const JOURNAL_TYPE_HINTS: Record<JournalComptableType, string> = {
  ACHATS: 'Factures et avoirs fournisseurs. Seules ces pièces sont des factures.',
  BANQUE: 'Virements, chèques et rapprochement du relevé.',
  CAISSE: 'Encaissements boutique (571). Le ticket POS est au journal des ventes (411/701), pas ici.',
  VENTES: 'Tickets POS, commandes web encaissées et TVA collectée 4457.',
  OPERATIONS_DIVERSES: 'Écritures hors journaux spécialisés.',
};

export const JOURNAL_TYPE_JOURNAL: Record<JournalComptableType, string> = {
  ACHATS: 'Journal des achats',
  BANQUE: 'Journal de banque',
  CAISSE: 'Journal de caisse',
  VENTES: 'Journal des ventes',
  OPERATIONS_DIVERSES: 'Journal des OD',
};

export const SOURCE_COMPTABLE_LABELS: Record<string, string> = {
  FACTURE_FOURNISSEUR: 'Facture d’achat',
  AVOIR_FOURNISSEUR: 'Avoir fournisseur',
  PAIEMENT_FOURNISSEUR: 'Paiement fournisseur',
  RETENUE_FISCALE: 'Retenue à la source',
  COUT_LOGISTIQUE: 'Coût logistique',
  AVANCE_FOURNISSEUR: 'Avance fournisseur',
  ECART_CHANGE: 'Écart de change',
  VENTE_POS: 'Vente POS',
  FACTURE_CLIENT: 'Facture client',
  AVOIR_CLIENT: 'Avoir client / retour',
  COMMANDE_WEB: 'Commande web encaissée',
  ENCAISSEMENT_CLIENT: 'Encaissement client',
  FACTURE_CHARGE: 'Facture de charge 6xx',
  OD_MANUELLE: 'Opération diverse',
  CLOTURE_EXERCICE: 'Clôture d’exercice',
  A_NOUVEAUX: 'À-nouveaux',
  MISE_EN_STOCK: 'Mise en stock',
  RETOUR_STOCK_FOURNISSEUR: 'Retour stock fournisseur',
  CMV_VENTE: 'Coût des ventes',
  CMV_AVOIR: 'Reprise CMV (retour)',
  VARIATION_STOCK: 'Écart d’inventaire',
  AMORTISSEMENT_IMMO: 'Dotation d’amortissement',
};

export interface LetteringLine {
  id: string;
  debit: string;
  credit: string;
  fournisseurId: string | null;
  fournisseurNom: string | null;
  clientId: string | null;
  client: { id: string; nom: string; prenom: string | null } | null;
  compte: { id: string; numero: string; intitule: string };
  ecriture: {
    id: string;
    numero: string;
    dateComptable: string;
    libelle: string;
    sourceType: string;
  };
}

export interface AccountingJournal {
  id: string;
  code: string;
  libelle: string;
  type: JournalComptableType;
  actif: boolean;
  exercice: { id: string; code: string; cloture: boolean };
  _count: { ecritures: number; modeles: number };
}

export function journalActifPourType(
  items: AccountingJournal[] | undefined,
  type: JournalComptableType,
): AccountingJournal | undefined {
  const ofType = (items ?? []).filter((row) => row.type === type);
  return (
    ofType.find((row) => row.actif && !row.exercice.cloture) ??
    ofType.find((row) => row.actif) ??
    ofType[0]
  );
}

export interface AiSuggestion {
  id: string; kind: string; value: unknown; confidence: string | number; evidence: string[];
  ruleCitations: string[]; risk: 'LOW' | 'MEDIUM' | 'HIGH';
  modelVersion: string; modelHash: string; promptHash: string;
  decisions: Array<{ id: string; decision: 'ACCEPTED' | 'REJECTED'; reason: string | null; createdAt: string }>;
}
export interface AiFinding {
  id: string; workItemId: string; severity: string; ruleCode: string; title: string;
  details: unknown; status: string; assignedToId: string | null; resolution: string | null;
  stornoEntryId: string | null; createdAt: string;
}
export interface AiWorkItem {
  id: string; sourceType: string; sourceId: string; sourceHash: string; status: string;
  deterministicChecks: unknown; deterministicBlockers: string[]; providerMode: string;
  providerErrorCode: string | null; createdAt: string; suggestions: AiSuggestion[]; findings: AiFinding[];
}
export interface AiDashboard {
  workItems: Array<{ status: string; _count: { _all: number } }>;
  findings: Array<{ severity: string; status: string; _count: { _all: number } }>;
  suggestions: number;
}

export interface AiPolicy {
  id: string;
  sourceType: string;
  suggestionKind: string;
  minimumConfidence: string | number;
  maximumRisk: string;
  active: boolean;
  approvedAt: string | null;
  version: number;
}

function query(params: Record<string, string | undefined>): string {
  const value = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return value ? `?${value}` : '';
}

export const p2pApi = {
  reauth: (password: string, purpose: SensitivePurpose) =>
    apiFetch<SensitiveChallenge>('/auth/reauth/challenges', {
      method: 'POST',
      body: JSON.stringify({ password, purpose }),
    }),
  centresCout: (societeId?: string) =>
    apiFetch<CostCentre[]>(`/achats/centres-cout${query({ societeId, actif: 'true' })}`),
  budgetsActifs: (societeId?: string, centreCoutId?: string, devise = 'XOF') =>
    apiFetch<PurchaseBudget[]>(`/achats/budgets/actifs${query({ societeId, centreCoutId, devise })}`),
  paymentProposals: (societeId?: string, statut?: string) =>
    apiFetch<PaymentProposalPage>(`/achats/comptabilite/paiements/propositions${query({ societeId, statut, page: '1', limit: '100' })}`),
  paymentProposal: (id: string) =>
    apiFetch<PaymentProposal>(`/achats/comptabilite/paiements/propositions/${id}`),
  uploadEvidence: (type: P2pEvidence['type'], sourceId: string, file: File) => {
    const body = new FormData();
    body.set('type', type);
    body.set('sourceId', sourceId);
    body.set('file', file);
    return apiFetch<P2pEvidence>('/achats/evidences', { method: 'POST', body });
  },
  demandes: () => apiFetch<DemandeAchat[]>('/achats/demandes'),
  actionDemande: (id: string, action: 'soumettre' | 'approuver' | 'rejeter' | 'annuler', motif?: string) =>
    apiFetch<DemandeAchat>(`/achats/demandes/${id}/${action}`, {
      method: 'POST', body: JSON.stringify(motif ? { motif } : {}),
    }),
  consultation: (id: string) => apiFetch<ConsultationAchat>(`/achats/consultations/${id}`),
  comparaison: (id: string) => apiFetch<ComparaisonOffres>(`/achats/consultations/${id}/comparaison`),
  recommandations: (entrepotId: string, fenetreJours: number) =>
    apiFetch<RecommandationsAchat>(`/achats/recommandations${query({ entrepotId, fenetreJours: String(fenetreJours) })}`),
  importCommande: (id: string) => apiFetch<ImportCommande>(`/achats/commandes/${id}/import`),
  receptions: () => apiFetch<ReceptionP2p[]>('/achats/receptions'),
  reception: (id: string) => apiFetch<ReceptionP2p>(`/achats/receptions/${id}`),
  createFactureP2p: (body: {
    clientOperationId: string;
    fournisseurId: string;
    referenceFournisseur: string;
    dateDocument: string;
    dateEcheance?: string;
    devise: string;
    tauxChangeSnapshot: string;
    notes?: string;
    document: {
      hashSha256: string;
      nomFichier: string;
      mimeType: string;
      tailleOctets?: number;
      uri: string;
    };
    lignes: Array<{
      ligneCommandeId: string;
      ligneQualiteId: string;
      quantite: number;
      prixUnitaire: string;
      remise?: string;
    }>;
  }) =>
    apiFetch<{ id: string; numero: string; statutRapprochement?: string }>(
      '/achats/factures/p2p',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  report: <T>(
    name:
      | 'balance'
      | 'grand-livre'
      | 'balance-agee-fournisseurs'
      | 'balance-agee-clients'
      | 'bilan'
      | 'tva'
      | 'liasse',
    societeId: string,
    du: string,
    au: string,
    journalId?: string,
  ) =>
    apiFetch<T>(`/achats/comptabilite/rapports/${name}${query({ societeId, du, au, journalId })}`),
  accounts: (societeId: string) =>
    apiFetch<CompteComptable[]>(`/achats/comptabilite/comptes${query({ societeId })}`),
  createAccount: (body: { societeId: string; numero: string; intitule: string; parentId?: string }) =>
    apiFetch<CompteComptable>('/achats/comptabilite/comptes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAccount: (id: string, body: { intitule?: string; actif?: boolean }) =>
    apiFetch<CompteComptable>(`/achats/comptabilite/comptes/${id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  naturesDepense: (societeId: string) =>
    apiFetch<NatureDepense[]>(`/achats/comptabilite/natures-depense${query({ societeId })}`),
  createNatureDepense: (body: {
    societeId: string;
    code: string;
    libelle: string;
    compteId: string;
  }) =>
    apiFetch<NatureDepense>('/achats/comptabilite/natures-depense', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createChargeInvoice: (body: {
    societeId: string;
    fournisseurId: string;
    clientOperationId: string;
    referenceFournisseur?: string;
    notes?: string;
    dateDocument?: string;
    lignes: Array<{
      natureDepenseId: string;
      quantite: number;
      prixUnitaireHt: number;
      libelle?: string;
    }>;
  }) =>
    apiFetch<{ id: string; numero: string }>('/achats/factures/charges', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  treasuryAccounts: (societeId: string) =>
    apiFetch<CompteTresorerie[]>(`/achats/comptabilite/comptes-tresorerie${query({ societeId })}`),
  bankImports: (societeId: string, compteTresorerieId?: string) =>
    apiFetch<
      Array<{
        id: string;
        nomFichier: string;
        dateImport: string;
        compte: { id: string; code: string; libelle: string };
        _count: { lignes: number };
      }>
    >(`/achats/comptabilite/releves/imports${query({ societeId, compteTresorerieId })}`),
  unmatchedBank: (societeId: string, compteTresorerieId: string) =>
    apiFetch<{
      lignes: Array<{
        id: string;
        numeroLigne: number;
        dateOperation: string;
        libelle: string;
        montant: string;
        devise: string;
        mouvementSuggereId: string | null;
        importReleve: { nomFichier: string };
      }>;
      mouvements: Array<{
        id: string;
        dateValeur: string;
        montant: string;
        devise: string;
        sens: string;
        reference: string | null;
      }>;
    }>(`/achats/comptabilite/releves/non-rapproches${query({ societeId, compteTresorerieId })}`),
  postingQueue: (societeId: string, statut?: FileEcriture['statut']) =>
    apiFetch<FileEcriture[]>(
      `/achats/comptabilite/file${query({ societeId, ...(statut ? { statut } : {}) })}`,
    ),
  flushQueue: (societeId: string) =>
    apiFetch<Array<{ id: string; statut: string; motif: string | null }>>(
      '/achats/comptabilite/file/rejouer',
      { method: 'POST', body: JSON.stringify({ societeId }) },
    ),
  postOd: (body: {
    societeId: string;
    clientOperationId: string;
    dateComptable: string;
    referencePiece: string;
    libelle: string;
    lignes: Array<{ compteId: string; debit: number; credit: number }>;
  }) =>
    apiFetch('/achats/comptabilite/od', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  openLettering: (societeId: string, compte: '401' | '411') =>
    apiFetch<LetteringLine[]>(
      `/achats/comptabilite/lettrage/ouverts${query({ societeId, compte })}`,
    ),
  letterLines: (body: {
    societeId: string;
    clientOperationId: string;
    code: string;
    ligneIds: string[];
  }) =>
    apiFetch<{ code: string; ligneIds: string[] }>('/achats/comptabilite/lettrage', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  stornoEntry: (
    id: string,
    body: {
      societeId: string;
      clientOperationId: string;
      referencePiece: string;
      dateComptable?: string;
      libelle?: string;
    },
  ) =>
    apiFetch(`/achats/comptabilite/ecritures/${id}/storno`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  closeExercice: (id: string, societeId: string, clientOperationId: string) =>
    apiFetch(`/achats/comptabilite/exercices/${id}/cloturer`, {
      method: 'POST',
      body: JSON.stringify({ societeId, clientOperationId }),
    }),
  listExercices: (societeId: string) =>
    apiFetch<AccountingExercice[]>(`/achats/comptabilite/exercices${query({ societeId })}`),
  openExercice: (body: {
    societeId: string;
    code: string;
    clientOperationId: string;
    dateDebut?: string;
    dateFin?: string;
  }) =>
    apiFetch<AccountingExercice>('/achats/comptabilite/exercices', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  backfillSales: (societeId: string) =>
    apiFetch<{
      ventes: number;
      encaissements: number;
      retours: number;
      commandesWeb: number;
      file: number;
    }>('/achats/comptabilite/file/rattraper-ventes', {
      method: 'POST',
      body: JSON.stringify({ societeId }),
    }),
  exportEcritures: (societeId: string, du: string, au: string) =>
    apiFetch<{ rows: Array<Record<string, string>> }>(
      `/achats/comptabilite/exports/ecritures${query({ societeId, du, au })}`,
    ),
  periods: (societeId: string) =>
    apiFetch<AccountingPeriod[]>(`/achats/comptabilite/periodes${query({ societeId })}`),
  journals: (societeId: string, exerciceId?: string) =>
    apiFetch<{ items: AccountingJournal[]; exercices: AccountingPeriod['exercice'][] }>(
      `/achats/comptabilite/journaux${query({ societeId, exerciceId })}`,
    ),
  createJournal: (body: {
    societeId: string;
    exerciceId: string;
    code: string;
    libelle: string;
    type: JournalComptableType;
  }) =>
    apiFetch<AccountingJournal>('/achats/comptabilite/journaux', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateJournal: (id: string, body: { libelle?: string; actif?: boolean }) =>
    apiFetch<AccountingJournal>(`/achats/comptabilite/journaux/${id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  openPeriod: (body: { societeId: string; code: string; dateDebut: string; dateFin: string }) =>
    apiFetch<AccountingPeriod>('/achats/comptabilite/periodes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  closePeriod: (id: string) =>
    apiFetch<AccountingPeriod>(`/achats/comptabilite/periodes/${id}/cloturer`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  liasse: (societeId: string, du: string, au: string) =>
    apiFetch<LiassePack>(`/achats/comptabilite/rapports/liasse${query({ societeId, du, au })}`),
  liasseAgregat: (du: string, au: string) =>
    apiFetch<LiassePack>(`/achats/comptabilite/rapports/liasse-agregat${query({ du, au })}`),
  immobilisations: (societeId: string) =>
    apiFetch<ImmobilisationFiche[]>(
      `/achats/comptabilite/immobilisations${query({ societeId })}`,
    ),
  createImmobilisation: (body: {
    societeId: string;
    compteId: string;
    libelle: string;
    dateMiseEnService: string;
    valeurBrute: number;
    dureeMois: number;
    valeurResiduelle?: number;
  }) =>
    apiFetch<ImmobilisationFiche>('/achats/comptabilite/immobilisations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  sortirImmobilisation: (id: string, motif?: string) =>
    apiFetch<ImmobilisationFiche>(`/achats/comptabilite/immobilisations/${id}/sortir`, {
      method: 'POST',
      body: JSON.stringify({ motif }),
    }),
  genererDotations: (societeId: string, periodeId: string) =>
    apiFetch<{
      periode: { id: string; code: string };
      dotations: Array<{
        immobilisationId: string;
        libelle: string;
        montant: string;
        ecritureId: string;
        numero: string;
        creee: boolean;
      }>;
    }>('/achats/comptabilite/immobilisations/dotations', {
      method: 'POST',
      body: JSON.stringify({ societeId, periodeId }),
    }),
  aiWork: (societeId: string) => apiFetch<AiWorkItem[]>(`/accounting-ai/work-items${query({ societeId })}`),
  aiFindings: (societeId: string) => apiFetch<AiFinding[]>(`/accounting-ai/findings${query({ societeId })}`),
  aiDashboard: (societeId: string) => apiFetch<AiDashboard>(`/accounting-ai/dashboard${query({ societeId })}`),
  aiPolicies: (societeId: string) =>
    apiFetch<AiPolicy[]>(`/accounting-ai/policies${query({ societeId })}`),
};
