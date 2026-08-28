// Types partagés entre apps/api, apps/web et apps/mobile.
// Doivent rester en cohérence stricte avec apps/api/prisma/schema.prisma
// et le cahier des charges (§6.4, §6.5).

// Grande surface : TIROIR (poste) → MAGASIN (cash office) → CENTRALE.
export const TypeCaisse = {
  TIROIR: "TIROIR",
  MAGASIN: "MAGASIN",
  CENTRALE: "CENTRALE",
} as const;
export type TypeCaisse = (typeof TypeCaisse)[keyof typeof TypeCaisse];

export const TypeTransaction = {
  VENTE: "VENTE",
  SORTIE_FONDS: "SORTIE_FONDS",
  /** Transfert tiroir ↔ magasin (hors circuit convoyeur §6.4). */
  TRANSFERT_INTERNE: "TRANSFERT_INTERNE",
} as const;
export type TypeTransaction =
  (typeof TypeTransaction)[keyof typeof TypeTransaction];

// Machine à états stricte — §6.4 du cahier des charges.
// INITIEE -> EN_TRANSIT -> RECEPTIONNEE -> VALIDEE
//                                       -> LITIGE -> VALIDEE (régularisation)
export const StatutTransaction = {
  INITIEE: "INITIEE",
  EN_TRANSIT: "EN_TRANSIT",
  RECEPTIONNEE: "RECEPTIONNEE",
  VALIDEE: "VALIDEE",
  LITIGE: "LITIGE",
} as const;
export type StatutTransaction =
  (typeof StatutTransaction)[keyof typeof StatutTransaction];

// Transitions autorisées (§6.4). Utilisé côté API pour la garde RBAC et côté
// client pour n'afficher que les actions permises — l'application de la
// règle reste toujours faite côté serveur. LITIGE -> VALIDEE = régularisation
// Contrôle interne / DAF uniquement (voir ROLES_REGULARISATION_LITIGE).
export const TRANSITIONS_AUTORISEES: Record<
  StatutTransaction,
  StatutTransaction[]
> = {
  INITIEE: [StatutTransaction.EN_TRANSIT],
  EN_TRANSIT: [StatutTransaction.RECEPTIONNEE],
  RECEPTIONNEE: [StatutTransaction.VALIDEE, StatutTransaction.LITIGE],
  VALIDEE: [],
  LITIGE: [StatutTransaction.VALIDEE],
};

export const RoleLibelle = {
  DIRECTION_GENERALE: "DIRECTION_GENERALE",
  DAF: "DAF",
  // Fonctions spécialisées du cycle procure-to-pay. Aucune n'hérite des
  // habilitations de réception/validation de caisse centrale (§6.4).
  ACHATS: "ACHATS",
  LOGISTIQUE_TRANSIT_DOUANE: "LOGISTIQUE_TRANSIT_DOUANE",
  QUALITE_STOCKS: "QUALITE_STOCKS",
  RAF_COMPTABLE: "RAF_COMPTABLE",
  CAISSIER_CENTRAL: "CAISSIER_CENTRAL",
  CONTROLEUR_INTERNE: "CONTROLEUR_INTERNE",
  SUPERVISEUR_ZONE: "SUPERVISEUR_ZONE",
  RESPONSABLE_BOUTIQUE: "RESPONSABLE_BOUTIQUE",
  CAISSIER_BOUTIQUE: "CAISSIER_BOUTIQUE",
  // Convoyeur (§6.4) : peut faire passer INITIEE → EN_TRANSIT uniquement.
  CONVOYEUR: "CONVOYEUR",
  RESPONSABLE_SI: "RESPONSABLE_SI",
  RESPONSABLE_CRM: "RESPONSABLE_CRM",
} as const;
export type RoleLibelle = (typeof RoleLibelle)[keyof typeof RoleLibelle];

// Rôles habilités à réceptionner/valider une transaction (§6.4, règle imperative).
// La Direction Générale n'est PAS ici : elle ne valide que les montants
// au-dessus du seuil exceptionnel (voir assertValidationSeuilDg).
// Décision confirmée : le §6.4 dit "Caissier Central uniquement" pour Réceptionnée,
// mais le tableau des rôles §4 place le DAF en validation niveau 2 sur le réseau
// entier — le DAF reste donc habilité, en cohérence avec §4 plutôt que la lecture
// littérale isolée de §6.4 (choix utilisateur, ne pas restreindre au Caissier Central seul).
export const ROLES_VALIDATION_CAISSE_CENTRALE: RoleLibelle[] = [
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.DAF,
];

// Régularisation d'un LITIGE §6.4 (SORTIE_FONDS magasin→centrale) :
// Contrôle interne (arbitrage) + DAF (niveau 2).
export const ROLES_REGULARISATION_LITIGE: RoleLibelle[] = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
];

// Régularisation litige transfert interne tiroir→magasin (hors CENTRALE).
export const ROLES_REGULARISATION_LITIGE_INTERNE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
];

// Rapprochement 3 voies (§5.2, ligne 259-261) : Contrôleur interne, DAF,
// Direction Générale. Pas le Caissier Central, dont le travail de réception
// est l'objet même de ce contrôle — miroir API ROLES_CONTROLE_COHERENCE.
export const ROLES_CONTROLE_COHERENCE: RoleLibelle[] = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

// Configuration des tiroirs POS : DAF (paramétrage) + SI / DG (ouverture magasin, §6.7).
export const ROLES_CONFIG_TIROIRS: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

// INITIEE → EN_TRANSIT (§6.4) : responsable boutique ou convoyeur.
export const ROLES_MISE_EN_TRANSIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CONVOYEUR,
];

// Initiation SORTIE_FONDS magasin → centrale (plan GS : Responsable boutique).
// Décision confirmée : le §6.4 mentionne aussi le Caissier boutique pour Initiée,
// mais le Caissier boutique reste volontairement exclu ici pour préserver la
// séparation des tâches (celui qui encaisse ne doit pas aussi initier un
// bordereau de versement) — choix utilisateur, ne pas ouvrir au Caissier boutique.
export const ROLES_INITIATION_SORTIE_FONDS: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

// Seuil par défaut (FCFA) au-delà duquel seul la Direction Générale peut
// valider (rapprochement sans écart). Paramétrable sur Societe.seuilValidationDg.
export const SEUIL_VALIDATION_DG_DEFAUT = 5_000_000;

// ---------------------------------------------------------------------------
// CRM (§6.6) — segmentation, fidélité, interactions.
// Doit rester en cohérence stricte avec les enums Prisma correspondants
// (apps/api/prisma/schema.prisma : SegmentClient, NiveauFidelite, CanalInteraction).
// ---------------------------------------------------------------------------

export const SegmentClient = {
  NOUVEAU: "NOUVEAU",
  REGULIER: "REGULIER",
  VIP: "VIP",
} as const;
export type SegmentClient = (typeof SegmentClient)[keyof typeof SegmentClient];

export const TypeClient = {
  PHYSIQUE: "PHYSIQUE",
  MORALE: "MORALE",
} as const;
export type TypeClient = (typeof TypeClient)[keyof typeof TypeClient];

export const NiveauFidelite = {
  BRONZE: "BRONZE",
  ARGENT: "ARGENT",
  OR: "OR",
} as const;
export type NiveauFidelite =
  (typeof NiveauFidelite)[keyof typeof NiveauFidelite];

export const CanalInteraction = {
  APPEL: "APPEL",
  SMS: "SMS",
  WHATSAPP: "WHATSAPP",
  VISITE: "VISITE",
  CAMPAGNE: "CAMPAGNE",
  EMAIL: "EMAIL",
} as const;
export type CanalInteraction =
  (typeof CanalInteraction)[keyof typeof CanalInteraction];

// ---------------------------------------------------------------------------
// Ventes / Point de vente boutique (§6.3.2, §5.1).
// Doit rester en cohérence stricte avec les enums Prisma correspondants
// (apps/api/prisma/schema.prisma : ModePaiement, StatutSessionCaisse).
// ---------------------------------------------------------------------------

export const ModePaiement = {
  ESPECES: "ESPECES",
  CARTE: "CARTE",
  MOBILE_MONEY: "MOBILE_MONEY",
} as const;
export type ModePaiement = (typeof ModePaiement)[keyof typeof ModePaiement];

export const StatutSessionCaisse = {
  OUVERTE: "OUVERTE",
  FERMEE: "FERMEE",
} as const;
export type StatutSessionCaisse =
  (typeof StatutSessionCaisse)[keyof typeof StatutSessionCaisse];

// ---------------------------------------------------------------------------
// Achats — cycle commande → réception → facture → paiement.
// Extension validée par l'utilisateur (hors MCD §6.5 d'origine). Les
// paiements fournisseur sont un grand livre append-only distinct de
// TRANSACTION_CAISSE (§6.4) : ils ne débitent pas une caisse boutique.
// ---------------------------------------------------------------------------

export const StatutDemandeAchat = {
  BROUILLON: "BROUILLON",
  SOUMISE: "SOUMISE",
  APPROUVEE: "APPROUVEE",
  REJETEE: "REJETEE",
  CONVERTIE: "CONVERTIE",
  ANNULEE: "ANNULEE",
} as const;
export type StatutDemandeAchat =
  (typeof StatutDemandeAchat)[keyof typeof StatutDemandeAchat];

export const TRANSITIONS_DEMANDE_ACHAT: Record<
  StatutDemandeAchat,
  StatutDemandeAchat[]
> = {
  BROUILLON: [StatutDemandeAchat.SOUMISE, StatutDemandeAchat.ANNULEE],
  SOUMISE: [
    StatutDemandeAchat.APPROUVEE,
    StatutDemandeAchat.REJETEE,
    StatutDemandeAchat.ANNULEE,
  ],
  APPROUVEE: [StatutDemandeAchat.CONVERTIE, StatutDemandeAchat.ANNULEE],
  REJETEE: [StatutDemandeAchat.BROUILLON, StatutDemandeAchat.ANNULEE],
  CONVERTIE: [],
  ANNULEE: [],
};

export const StatutCommandeAchat = {
  BROUILLON: "BROUILLON",
  SOUMISE_APPROBATION: "SOUMISE_APPROBATION",
  APPROUVEE: "APPROUVEE",
  REJETEE: "REJETEE",
  EN_PRODUCTION: "EN_PRODUCTION",
  EXPEDIEE: "EXPEDIEE",
  EN_TRANSIT: "EN_TRANSIT",
  EN_DOUANE: "EN_DOUANE",
  DEDOUANEE: "DEDOUANEE",
  // Statut historique conservé : une commande confirmée est ouverte à la
  // réception. Les parcours existants BROUILLON → CONFIRMEE restent valides.
  CONFIRMEE: "CONFIRMEE",
  PARTIELLEMENT_RECEPTIONNEE: "PARTIELLEMENT_RECEPTIONNEE",
  RECEPTIONNEE: "RECEPTIONNEE",
  CLOTUREE: "CLOTUREE",
  ANNULEE: "ANNULEE",
} as const;
export type StatutCommandeAchat =
  (typeof StatutCommandeAchat)[keyof typeof StatutCommandeAchat];

export const StatutReceptionAchat = {
  QUANTITATIVE: "QUANTITATIVE",
  QUALITE_VALIDEE: "QUALITE_VALIDEE",
  MISE_EN_STOCK: "MISE_EN_STOCK",
} as const;
export type StatutReceptionAchat =
  (typeof StatutReceptionAchat)[keyof typeof StatutReceptionAchat];

export const TRANSITIONS_RECEPTION_ACHAT: Record<
  StatutReceptionAchat,
  StatutReceptionAchat[]
> = {
  QUANTITATIVE: [StatutReceptionAchat.QUALITE_VALIDEE],
  QUALITE_VALIDEE: [StatutReceptionAchat.MISE_EN_STOCK],
  MISE_EN_STOCK: [],
};

export const MethodeAllocationCout = {
  VALEUR: "VALEUR",
  QUANTITE: "QUANTITE",
  MANUELLE: "MANUELLE",
} as const;
export type MethodeAllocationCout =
  (typeof MethodeAllocationCout)[keyof typeof MethodeAllocationCout];

export const StatutRetourFournisseur = {
  PREPARE: "PREPARE",
  EXPEDIE: "EXPEDIE",
} as const;
export type StatutRetourFournisseur =
  (typeof StatutRetourFournisseur)[keyof typeof StatutRetourFournisseur];

export const TRANSITIONS_COMMANDE_ACHAT: Record<
  StatutCommandeAchat,
  StatutCommandeAchat[]
> = {
  BROUILLON: [
    StatutCommandeAchat.SOUMISE_APPROBATION,
    StatutCommandeAchat.CONFIRMEE,
    StatutCommandeAchat.ANNULEE,
  ],
  SOUMISE_APPROBATION: [
    StatutCommandeAchat.APPROUVEE,
    StatutCommandeAchat.REJETEE,
    StatutCommandeAchat.ANNULEE,
  ],
  APPROUVEE: [
    StatutCommandeAchat.CONFIRMEE,
    StatutCommandeAchat.EN_PRODUCTION,
    StatutCommandeAchat.EXPEDIEE,
    StatutCommandeAchat.ANNULEE,
  ],
  REJETEE: [StatutCommandeAchat.BROUILLON, StatutCommandeAchat.ANNULEE],
  EN_PRODUCTION: [StatutCommandeAchat.EXPEDIEE, StatutCommandeAchat.ANNULEE],
  EXPEDIEE: [StatutCommandeAchat.EN_TRANSIT],
  EN_TRANSIT: [StatutCommandeAchat.EN_DOUANE],
  EN_DOUANE: [StatutCommandeAchat.DEDOUANEE],
  DEDOUANEE: [StatutCommandeAchat.CONFIRMEE],
  CONFIRMEE: [
    StatutCommandeAchat.PARTIELLEMENT_RECEPTIONNEE,
    StatutCommandeAchat.RECEPTIONNEE,
    StatutCommandeAchat.ANNULEE,
  ],
  PARTIELLEMENT_RECEPTIONNEE: [StatutCommandeAchat.RECEPTIONNEE],
  RECEPTIONNEE: [StatutCommandeAchat.CLOTUREE],
  CLOTUREE: [],
  ANNULEE: [],
};

export const StatutFactureFournisseur = {
  BROUILLON: "BROUILLON",
  COMPTABILISEE: "COMPTABILISEE",
  PARTIELLEMENT_PAYEE: "PARTIELLEMENT_PAYEE",
  PAYEE: "PAYEE",
  ANNULEE: "ANNULEE",
} as const;
export type StatutFactureFournisseur =
  (typeof StatutFactureFournisseur)[keyof typeof StatutFactureFournisseur];

export const TRANSITIONS_FACTURE_FOURNISSEUR: Record<
  StatutFactureFournisseur,
  StatutFactureFournisseur[]
> = {
  BROUILLON: [
    StatutFactureFournisseur.COMPTABILISEE,
    StatutFactureFournisseur.ANNULEE,
  ],
  COMPTABILISEE: [
    StatutFactureFournisseur.PARTIELLEMENT_PAYEE,
    StatutFactureFournisseur.PAYEE,
  ],
  PARTIELLEMENT_PAYEE: [
    StatutFactureFournisseur.PARTIELLEMENT_PAYEE,
    StatutFactureFournisseur.PAYEE,
  ],
  PAYEE: [],
  ANNULEE: [],
};

export const ModePaiementFournisseur = {
  VIREMENT: "VIREMENT",
  CHEQUE: "CHEQUE",
  MOBILE_MONEY: "MOBILE_MONEY",
  CAISSE_CENTRALE: "CAISSE_CENTRALE",
  DEPOT: "DEPOT",
  COMPENSATION: "COMPENSATION",
  LETTRE_CREDIT: "LETTRE_CREDIT",
} as const;
export type ModePaiementFournisseur =
  (typeof ModePaiementFournisseur)[keyof typeof ModePaiementFournisseur];

export const UsageEmplacement = {
  STOCK: "STOCK",
  ENTREE: "ENTREE",
  QUARANTAINE: "QUARANTAINE",
  SORTIE: "SORTIE",
  PERTE: "PERTE",
  FOURNISSEUR: "FOURNISSEUR",
  CLIENT: "CLIENT",
} as const;
export type UsageEmplacement =
  (typeof UsageEmplacement)[keyof typeof UsageEmplacement];

export const TypeOperationStock = {
  RECEPTION: "RECEPTION",
  LIVRAISON: "LIVRAISON",
  TRANSFERT_INTERNE: "TRANSFERT_INTERNE",
  REBUT: "REBUT",
} as const;
export type TypeOperationStock =
  (typeof TypeOperationStock)[keyof typeof TypeOperationStock];

export const StatutBonStock = {
  BROUILLON: "BROUILLON",
  PRET: "PRET",
  FAIT: "FAIT",
  ANNULE: "ANNULE",
} as const;
export type StatutBonStock =
  (typeof StatutBonStock)[keyof typeof StatutBonStock];

export const TRANSITIONS_BON_STOCK: Record<StatutBonStock, StatutBonStock[]> = {
  BROUILLON: [StatutBonStock.PRET, StatutBonStock.ANNULE],
  PRET: [StatutBonStock.FAIT, StatutBonStock.ANNULE],
  FAIT: [],
  ANNULE: [],
};

export const MethodeCout = {
  CMP: "CMP",
  FIFO: "FIFO",
  STANDARD: "STANDARD",
} as const;
export type MethodeCout = (typeof MethodeCout)[keyof typeof MethodeCout];

export const StrategieSortie = {
  FIFO: "FIFO",
  FEFO: "FEFO",
} as const;
export type StrategieSortie =
  (typeof StrategieSortie)[keyof typeof StrategieSortie];

// ---------------------------------------------------------------------------
// E-commerce B2C (PLAN-E-COMMERCE — cohérent avec apps/api/prisma/schema.prisma)
// ---------------------------------------------------------------------------

export const ModeAffichagePrixShop = {
  HT: "HT",
  TTC: "TTC",
} as const;
export type ModeAffichagePrixShop =
  (typeof ModeAffichagePrixShop)[keyof typeof ModeAffichagePrixShop];

export const ModeReglementCommandeWeb = {
  PREPAYE_PSP: "PREPAYE_PSP",
  PAIEMENT_RETRAIT: "PAIEMENT_RETRAIT",
  PAIEMENT_LIVRAISON: "PAIEMENT_LIVRAISON",
} as const;
export type ModeReglementCommandeWeb =
  (typeof ModeReglementCommandeWeb)[keyof typeof ModeReglementCommandeWeb];

export const ProviderPspShop = {
  PAYSTACK: "PAYSTACK",
  ORANGE_MONEY: "ORANGE_MONEY",
  WAVE: "WAVE",
} as const;
export type ProviderPspShop =
  (typeof ProviderPspShop)[keyof typeof ProviderPspShop];

export const ModeFulfillmentCommandeWeb = {
  RETRAIT_BOUTIQUE: "RETRAIT_BOUTIQUE",
  LIVRAISON: "LIVRAISON",
} as const;
export type ModeFulfillmentCommandeWeb =
  (typeof ModeFulfillmentCommandeWeb)[keyof typeof ModeFulfillmentCommandeWeb];

export const StatutCommandeWeb = {
  PANIER: "PANIER",
  EN_ATTENTE_PAIEMENT: "EN_ATTENTE_PAIEMENT",
  PAYEE: "PAYEE",
  PREPARATION: "PREPARATION",
  PRETE: "PRETE",
  EXPEDIEE: "EXPEDIEE",
  LIVREE: "LIVREE",
  REMISE: "REMISE",
  ANNULEE: "ANNULEE",
  REMBOURSEE: "REMBOURSEE",
  LITIGE: "LITIGE",
} as const;
export type StatutCommandeWeb =
  (typeof StatutCommandeWeb)[keyof typeof StatutCommandeWeb];

/** Transitions communes — le service vérifie aussi modeReglement / fulfillment. */
export const TRANSITIONS_COMMANDE_WEB: Record<
  StatutCommandeWeb,
  StatutCommandeWeb[]
> = {
  PANIER: [
    StatutCommandeWeb.EN_ATTENTE_PAIEMENT,
    StatutCommandeWeb.PREPARATION,
    StatutCommandeWeb.ANNULEE,
  ],
  EN_ATTENTE_PAIEMENT: [StatutCommandeWeb.PAYEE, StatutCommandeWeb.ANNULEE],
  PAYEE: [StatutCommandeWeb.PREPARATION, StatutCommandeWeb.ANNULEE, StatutCommandeWeb.REMBOURSEE, StatutCommandeWeb.LITIGE],
  PREPARATION: [
    StatutCommandeWeb.PRETE,
    StatutCommandeWeb.EXPEDIEE,
    StatutCommandeWeb.ANNULEE,
    StatutCommandeWeb.REMBOURSEE,
  ],
  PRETE: [StatutCommandeWeb.REMISE, StatutCommandeWeb.ANNULEE],
  EXPEDIEE: [StatutCommandeWeb.LIVREE, StatutCommandeWeb.ANNULEE],
  LIVREE: [StatutCommandeWeb.PAYEE],
  REMISE: [StatutCommandeWeb.PAYEE],
  ANNULEE: [],
  REMBOURSEE: [],
  LITIGE: [StatutCommandeWeb.REMBOURSEE],
};

export const ROLES_GESTION_COMMANDES_WEB = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
] as const;
