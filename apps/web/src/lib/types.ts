import type {
  CanalInteraction,
  ModePaiement,
  NiveauFidelite,
  RoleLibelle,
  SegmentClient,
  StatutSessionCaisse,
  StatutTransaction,
  TypeCaisse,
  TypeClient,
  TypeTransaction,
} from '@caisse-crm/shared';

export interface UtilisateurDto {
  id: string;
  login: string;
  nom: string;
  prenom: string;
  actif: boolean;
  role: { id: string; libelle: RoleLibelle };
  boutiqueId: string | null;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
}

export interface JournalAuditDto {
  id: string;
  action: string;
  entite: string;
  entiteId: string;
  details: string | null;
  dateHeure: string;
  utilisateurId: string;
  utilisateur: { id: string; login: string; nom: string; prenom: string };
}

export interface JournalAuditPageDto {
  data: JournalAuditDto[];
  total: number;
  page: number;
  limit: number;
}

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
  regularisation?: RegularisationLitigeDto | null;
}

export interface RegularisationLitigeDto {
  id: string;
  transactionId: string;
  montantRetenu: string;
  motif: string;
  validateurId: string;
  dateRegularisation: string;
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
  code?: string | null;
  libelle?: string | null;
  actif?: boolean;
  ordreAffichage?: number;
}

/** Ligne enrichie du grand livre GET /caisses/:id/mouvements */
export interface MouvementCaisseDto {
  id: string;
  type: TypeTransaction;
  montant: string;
  dateHeure: string;
  statut: StatutTransaction;
  caisseId: string;
  initiateurId: string;
  transactionSourceId: string | null;
  sens: 'CREDIT' | 'DEBIT';
  debit: string;
  credit: string;
  soldeApres: string;
  libelle: string;
  initiateur: {
    id: string;
    login: string;
    prenom: string;
    nom: string;
  };
}

export interface FideliteDto {
  id: string;
  clientId: string;
  pointsCumules: number;
  niveau: NiveauFidelite;
}

export interface ClientDto {
  id: string;
  typeClient: TypeClient;
  nom: string;
  prenom: string | null;
  contact: string | null;
  adresse: string | null;
  boutiqueOrigineId?: string | null;
  dateNaissance: string | null;
  segment: SegmentClient;
  consentementMarketing: boolean;
  fidelite: FideliteDto | null;
}

export interface InteractionCrmDto {
  id: string;
  clientId: string;
  type: string;
  canal: CanalInteraction;
  contenu: string | null;
  date: string;
}

export interface CampagneCrmDto {
  id: string;
  nom: string;
  message: string;
  segment: SegmentClient | null;
  niveauFidelite: NiveauFidelite | null;
  canal: CanalInteraction;
  dateCreation: string;
  dateEnvoi?: string | null;
  createdById: string;
}

export interface ContactCampagneDto {
  clientId: string;
  nom: string;
  prenom: string | null;
  contact: string | null;
  pointsCumules: number;
}

export interface PointDeVenteClientDto {
  id: string;
  nom: string;
  nombreAchats: number;
  totalDepense: string;
  dateDernierAchat: string;
}

export interface TableauDeBordClientDto {
  totalDepense: string;
  nombreAchats: number;
  dateDernierAchat: string | null;
  pointsCumules: number;
  niveauFidelite: NiveauFidelite;
  /** Boutiques où le client a déjà acheté (dérivé des ventes, §6.6). */
  pointsDeVente: PointDeVenteClientDto[];
}

export interface CrmParametresDto {
  seuilFideliteArgent: number;
  seuilFideliteOr: number;
  seuilSegmentRegulier: number;
  seuilSegmentVip: number;
  avantageFideliteArgentPct: number;
  avantageFideliteOrPct: number;
}

export interface TableauDeBordCrmDto {
  seuils: CrmParametresDto;
  effectifs: {
    total: number;
    parSegment: Record<string, number>;
    parPalier: Record<string, number>;
  };
  ca: {
    identifie: string;
    anonyme: string;
    ticketsIdentifies: number;
    ticketsAnonymes: number;
  };
  campagnes: Array<{
    id: string;
    nom: string;
    canal: CanalInteraction;
    dateCreation: string;
    dateEnvoi: string | null;
    segment: SegmentClient | null;
    niveauFidelite: NiveauFidelite | null;
  }>;
}

export interface JournalVentesDto {
  items: Array<{
    id: string;
    dateVente: string;
    montantTotal: string;
    modePaiement: ModePaiement;
    sessionCaisseId: string;
    clientId: string | null;
    client: { id: string; nom: string; prenom: string | null } | null;
    paiements: PaiementVenteDto[];
    caisse: {
      id: string;
      type: string;
      code: string | null;
      libelle: string | null;
      boutiqueId: string | null;
      boutique: { id: string; nom: string } | null;
    };
  }>;
  total: number;
  page: number;
  limit: number;
}

export type StatutStock = 'RUPTURE' | 'SOUS_SEUIL' | 'OK';

export interface ProduitDto {
  id: string;
  designation: string;
  reference: string | null;
  categorie: string | null;
  description: string | null;
  actif: boolean;
  typeProduit?: 'ARTICLE' | 'PRESTATION';
  prixUnitaire: string;
  stock: number;
  seuilReappro: number | null;
  coutMoyenPondere: string;
  statutStock: StatutStock;
  margeUnitaire: string;
  tauxMarge: string;
  valeurStock: string;
  codeBarres?: string | null;
  codeBarresGenere?: boolean;
  uniteMesure?: string;
  methodeCout?: 'CMP' | 'FIFO' | 'STANDARD';
  strategieSortie?: 'FIFO' | 'FEFO';
  attributs?: string | null;
  imageUrl?: string | null;
  prixWeb?: string | null;
  visibleWeb?: boolean;
  slug?: string | null;
  tauxTva?: string | null;
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
    usage?: string;
    virtuel?: boolean;
    boutique?: string | null;
    quantite: number;
    valeur?: string;
    statut?: StatutStock;
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
  stockPrevu?: {
    physique: number;
    reserve: number;
    aRecevoir: number;
    enTransit: number;
    prevu: number;
  };
}

export interface ProduitClassementDto {
  fenetreJours: number;
  meilleuresVentes: Array<{
    produit: ProduitDto;
    quantiteVendue: number;
    chiffreAffaires: string;
  }>;
  dormants: Array<{
    produit: ProduitDto;
    stock: number;
    valeurStock: string;
  }>;
}

export interface ProduitVenteDto {
  ligneId: string;
  venteId: string;
  dateVente: string;
  boutique: string | null;
  modePaiement: string;
  quantite: number;
  prixUnitaire: string;
  remise: string;
  montant: string;
}

export interface MouvementStockDto {
  id: string;
  produitId: string;
  type: 'RECEPTION' | 'VENTE' | 'RETOUR' | 'AJUSTEMENT' | 'TRANSFERT_OUT' | 'TRANSFERT_IN' | 'SCRAP';
  entrepotId: string | null;
  quantite: number;
  stockApres: number;
  reference: string | null;
  dateHeure: string;
  utilisateurId: string;
  produit?: { id?: string; designation: string; reference?: string | null };
  entrepot?: {
    id?: string;
    code: string;
    nom: string;
    boutique?: { nom: string };
  } | null;
  utilisateur?: { id?: string; prenom: string; nom: string; login?: string };
}

export interface BonStockDto {
  id: string;
  numero: string;
  type: 'RECEPTION' | 'LIVRAISON' | 'TRANSFERT_INTERNE' | 'REBUT';
  statut: 'BROUILLON' | 'PRET' | 'FAIT' | 'ANNULE';
  notes: string | null;
  receptionId: string | null;
  entrepotSource: {
    id: string;
    nom: string;
    code: string;
    usage: string;
    boutiqueId: string;
  } | null;
  entrepotDest: {
    id: string;
    nom: string;
    code: string;
    usage: string;
    boutiqueId: string;
  } | null;
  dateCreation: string;
  datePret: string | null;
  dateFait: string | null;
  initiateur?: { id: string; nom: string; prenom: string } | null;
  lignes: Array<{
    id: string;
    produitId: string;
    designation: string;
    reference?: string | null;
    quantite: number;
    quantiteOk: number | null;
    quantiteRebut: number | null;
    numeroLot: string | null;
  }>;
}

export interface RegleReapproDto {
  id: string;
  produitId: string;
  entrepotId: string;
  min: number;
  max: number;
  produit: { designation: string };
  entrepot: { nom: string; code: string; boutiqueId?: string };
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
  modePaiement: ModePaiement;
  caisseId: string;
  caisse: CaisseDto & {
    boutique?: { id: string; nom: string } | null;
  };
  clientId: string | null;
  lignes: LigneVenteDto[];
  paiements?: PaiementVenteDto[];
  /** Caissier ayant enregistré la vente (journal d'audit VENTE_ENREGISTREE). */
  enregistrePar: { id: string; prenom: string; nom: string } | null;
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
  /** Bordereau magasin → centrale du point du jour (§6.4). */
  transactionSortieCentraleId?: string | null;
  /** Présent sur GET /ventes/sessions (liste enrichie). */
  nombreVentes?: number;
  /** CA tickets de la session (somme montantTotal). */
  caSession?: string;
}

/** Coéquipier éligible au double contrôle d'ouverture/clôture (§5.1). */
export interface TemoinEligibleDto {
  id: string;
  login: string;
  prenom: string;
  nom: string;
  role: string | null;
}

export interface PaiementVenteDto {
  id?: string;
  modePaiement: ModePaiement;
  montant: string;
}

export interface VenteDto {
  id: string;
  dateVente: string;
  montantTotal: string;
  remiseFidelite?: string;
  modePaiement: ModePaiement;
  caisseId: string;
  sessionCaisseId: string;
  clientId: string | null;
  lignes: LigneVenteDto[];
  paiements?: PaiementVenteDto[];
  retours?: RetourVenteDto[];
}

export interface ReleveModePaiementDto {
  modePaiement: ModePaiement;
  total: string;
  nombreVentes: number;
}

export interface EtatVenteLigneDto {
  id: string;
  dateVente: string;
  montantTotal: string;
  modePaiement: ModePaiement | string;
  paiements: PaiementVenteDto[];
  nbLignes: number;
}

export interface EtatSessionDto {
  typeEtat: 'X' | 'Z';
  sessionId: string;
  statut: string;
  ouvertureDateHeure: string;
  clotureDateHeure: string | null;
  caisseLibelle: string;
  boutiqueNom: string | null;
  ouvreur: string | null;
  temoinOuverture: string | null;
  clotureur: string | null;
  temoinCloture: string | null;
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null;
  releve: ReleveModePaiementDto[];
  ventes: EtatVenteLigneDto[];
  nombreVentes: number;
  fondInitial: string;
  totalEspecesNet: string;
  fondTheorique: string;
  fondCompteCloture: string | null;
  ecart: string | null;
  imprimeAt: string;
}

export interface ClotureSessionResponseDto {
  session: SessionCaisseDto;
  releve: ReleveModePaiementDto[];
  transactionVersementId: string | null;
  transactionSortieCentraleId?: string | null;
}

export interface FournisseurDto {
  id: string;
  nom: string;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  notes: string | null;
  actif: boolean;
  createdAt: string;
  nombreReceptions: number;
  unitesRecues: number;
  montantCumule: string;
  derniereReceptionAt: string | null;
  produitsDistincts: number;
}

export interface ReceptionStockDto {
  id: string;
  produitId: string;
  fournisseurId: string;
  quantite: number;
  prixAchat: string;
  montant: string;
  dateReception: string;
  utilisateurId: string;
  entrepotId: string | null;
  reference: string | null;
  produit?: { id: string; designation: string; reference: string | null };
  entrepot?: { id: string; nom: string; code: string } | null;
  utilisateur?: { id: string; nom: string; prenom: string } | null;
  fournisseur?: { id: string; nom: string };
  commande?: { id: string; numero: string } | null;
  ligneCommandeId?: string | null;
}

export interface FournisseurProduitStatsDto {
  produitId: string;
  designation: string;
  reference: string | null;
  unites: number;
  montant: string;
  dernierPrix: string;
  prixPrecedent: string | null;
  variationPct: string | null;
  derniereReceptionAt: string;
}

export interface FournisseurDetailDto extends FournisseurDto {
  receptions: ReceptionStockDto[];
  produits: FournisseurProduitStatsDto[];
}

export interface FournisseurHaussePrixDto {
  fournisseurId: string;
  fournisseurNom: string;
  produitId: string;
  designation: string;
  prixPrecedent: string;
  prixActuel: string;
  variationPct: string;
}

export interface FournisseursSyntheseDto {
  genereAt: string;
  kpis: {
    fournisseurs: number;
    actifs: number;
    jamaisLivres: number;
    receptions30j: number;
    unites30j: number;
    montant30j: string;
    commandesOuvertes: number;
    unitesARecevoir: number;
    facturesImpayees: number;
    encours: string;
  };
  haussesPrix: FournisseurHaussePrixDto[];
  receptionsRecentes: ReceptionStockDto[];
  fournisseurs: FournisseurDto[];
}

export interface CommandeAchatLigneDto {
  id: string;
  produitId: string;
  designation: string;
  reference: string | null;
  quantite: number;
  quantiteRecue: number;
  quantiteRestante: number;
  prixUnitaire: string;
  montant: string;
}

export interface CommandeAchatReceptionDto {
  id: string;
  produitId: string;
  quantite: number;
  prixAchat: string;
  montant: string;
  dateReception: string;
  reference: string | null;
  ligneCommandeId: string | null;
  produit: { id: string; designation: string; reference: string | null };
  entrepot: { id: string; nom: string; code: string } | null;
  utilisateur: { id: string; nom: string; prenom: string } | null;
  facture: {
    id: string;
    numero: string;
    statut: FactureFournisseurDto['statut'];
    montant: string;
  } | null;
}

export interface CommandeAchatFactureLieeDto {
  id: string;
  numero: string;
  statut: FactureFournisseurDto['statut'];
  montant: string;
}

export interface CommandeAchatDto {
  id: string;
  numero: string;
  fournisseurId: string;
  fournisseur: { id: string; nom: string; actif: boolean };
  statut:
    | 'BROUILLON'
    | 'SOUMISE_APPROBATION'
    | 'APPROUVEE'
    | 'REJETEE'
    | 'EN_PRODUCTION'
    | 'EXPEDIEE'
    | 'EN_TRANSIT'
    | 'EN_DOUANE'
    | 'DEDOUANEE'
    | 'CONFIRMEE'
    | 'PARTIELLEMENT_RECEPTIONNEE'
    | 'RECEPTIONNEE'
    | 'CLOTUREE'
    | 'ANNULEE';
  notes: string | null;
  devise?: string;
  proformaReference?: string | null;
  dateCommande: string;
  dateConfirmation: string | null;
  dateCloture: string | null;
  montant: string;
  quantite: number;
  quantiteRecue: number;
  boutiqueId: string | null;
  boutique: { id: string; nom: string } | null;
  initiateur?: { id: string; nom: string; prenom: string } | null;
  lignes: CommandeAchatLigneDto[];
  receptions?: CommandeAchatReceptionDto[];
  factures?: CommandeAchatFactureLieeDto[];
}

export interface ReceptionAFacturerDto {
  id: string;
  fournisseurId: string;
  fournisseur: { id: string; nom: string };
  produit: { id: string; designation: string; reference: string | null };
  quantite: number;
  prixAchat: string;
  montant: string;
  dateReception: string;
  commande: { id: string; numero: string } | null;
}

export interface FactureFournisseurDto {
  id: string;
  numero: string;
  referenceFournisseur: string | null;
  fournisseurId: string;
  fournisseur: { id: string; nom: string };
  statut: 'BROUILLON' | 'COMPTABILISEE' | 'PARTIELLEMENT_PAYEE' | 'PAYEE' | 'ANNULEE';
  statutRapprochement?:
    | 'A_RAPPROCHER'
    | 'RAPPROCHEE'
    | 'LITIGE'
    | 'EXCEPTEE'
    | string;
  typeDocument?: 'FACTURE' | 'AVOIR' | string;
  clientOperationId?: string | null;
  dateFacture: string;
  dateDocument?: string | null;
  dateEcheance: string | null;
  notes: string | null;
  devise?: string;
  montant: string;
  totalHt?: string | null;
  totalTaxes?: string | null;
  totalRetenues?: string | null;
  totalTtc?: string | null;
  netAPayer?: string | null;
  montantPaye: string;
  resteAPayer: string;
  createur?: { id: string; nom: string; prenom: string } | null;
  lignes: Array<{
    id: string;
    receptionId: string | null;
    ligneCommandeId?: string | null;
    ligneQualiteId?: string | null;
    produit: { id: string; designation: string; reference: string | null } | null;
    quantite: number;
    prixUnitaire: string;
    montant: string;
    dateReception?: string | null;
    reference?: string | null;
    commande?: { id: string; numero: string } | null;
  }>;
  paiements: Array<{
    id: string;
    montant: string;
    mode: 'VIREMENT' | 'ESPECES' | 'MOBILE_MONEY';
    reference: string | null;
    datePaiement: string;
    utilisateur?: { id: string; nom: string; prenom: string } | null;
  }>;
}


export interface SocieteDto {
  id: string;
  raisonSociale: string;
  adresse: string;
  telephone: string | null;
  email: string | null;
  devise: string;
  logoUrl: string | null;
  delaiVersementHeures: number;
  seuilFideliteArgent?: number;
  seuilFideliteOr?: number;
  seuilSegmentRegulier?: number;
  seuilSegmentVip?: number;
  seuilVersementAnticipe?: string | null;
  delaiRegularisationLitigeHeures?: number;
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
  retraitWebActif?: boolean;
  entrepotWebId?: string | null;
  delaiRetraitHeures?: number | null;
}

export interface EntrepotDto {
  id: string;
  nom: string;
  code: string;
  boutiqueId: string;
  type: 'PRINCIPAL' | 'SECONDAIRE';
  usage?: 'STOCK' | 'ENTREE' | 'SORTIE' | 'PERTE' | 'FOURNISSEUR' | 'CLIENT';
  reseau?: boolean;
  virtuel?: boolean;
  actif: boolean;
  boutique?: { id: string; nom: string };
}

export interface StockQuantDto {
  id: string;
  produitId: string;
  entrepotId: string;
  quantite: number;
  quantiteReservee?: number;
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
    stockPrevu?: number;
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

export type StatutInventaire = 'EN_COURS' | 'VALIDE' | 'ANNULE';

export interface LigneInventaireDto {
  id: string;
  produitId: string;
  quantiteTheorique: number;
  quantiteComptee: number | null;
  dateComptage: string | null;
  produit: {
    designation: string;
    reference: string | null;
    actif: boolean;
    coutMoyenPondere: string;
    seuilReappro: number | null;
  };
}

export interface SessionInventaireDto {
  id: string;
  entrepotId: string;
  statut: StatutInventaire;
  motif: string | null;
  dateOuverture: string;
  dateValidation: string | null;
  initiateurId: string;
  validateurId: string | null;
  entrepot: {
    id: string;
    code: string;
    nom: string;
    boutiqueId: string;
    boutique: { nom: string };
  };
  initiateur: { id: string; prenom: string; nom: string; login: string };
  validateur: { id: string; prenom: string; nom: string; login: string } | null;
  lignes: LigneInventaireDto[];
}

export interface InventairePrioriteDto {
  entrepotId: string;
  code: string;
  nom: string;
  boutiqueId?: string;
  nomBoutique: string;
  dernierInventaireAt: string | null;
  joursDepuis: number | null;
  aInventorier: boolean;
  frequenceCibleJours: number;
}
