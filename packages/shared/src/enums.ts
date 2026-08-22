// Types partagés entre apps/api, apps/web et apps/mobile.
// Doivent rester en cohérence stricte avec apps/api/prisma/schema.prisma
// et le cahier des charges (§6.4, §6.5).

// Grande surface : TIROIR (poste) → MAGASIN (cash office) → CENTRALE.
export const TypeCaisse = {
  TIROIR: 'TIROIR',
  MAGASIN: 'MAGASIN',
  CENTRALE: 'CENTRALE',
} as const;
export type TypeCaisse = (typeof TypeCaisse)[keyof typeof TypeCaisse];

export const TypeTransaction = {
  VENTE: 'VENTE',
  SORTIE_FONDS: 'SORTIE_FONDS',
  /** Transfert tiroir ↔ magasin (hors circuit convoyeur §6.4). */
  TRANSFERT_INTERNE: 'TRANSFERT_INTERNE',
} as const;
export type TypeTransaction = (typeof TypeTransaction)[keyof typeof TypeTransaction];

// Machine à états stricte — §6.4 du cahier des charges.
// INITIEE -> EN_TRANSIT -> RECEPTIONNEE -> VALIDEE
//                                       -> LITIGE -> VALIDEE (régularisation)
export const StatutTransaction = {
  INITIEE: 'INITIEE',
  EN_TRANSIT: 'EN_TRANSIT',
  RECEPTIONNEE: 'RECEPTIONNEE',
  VALIDEE: 'VALIDEE',
  LITIGE: 'LITIGE',
} as const;
export type StatutTransaction = (typeof StatutTransaction)[keyof typeof StatutTransaction];

// Transitions autorisées (§6.4). Utilisé côté API pour la garde RBAC et côté
// client pour n'afficher que les actions permises — l'application de la
// règle reste toujours faite côté serveur. LITIGE -> VALIDEE = régularisation
// Contrôle interne / DAF uniquement (voir ROLES_REGULARISATION_LITIGE).
export const TRANSITIONS_AUTORISEES: Record<StatutTransaction, StatutTransaction[]> = {
  INITIEE: [StatutTransaction.EN_TRANSIT],
  EN_TRANSIT: [StatutTransaction.RECEPTIONNEE],
  RECEPTIONNEE: [StatutTransaction.VALIDEE, StatutTransaction.LITIGE],
  VALIDEE: [],
  LITIGE: [StatutTransaction.VALIDEE],
};

export const RoleLibelle = {
  DIRECTION_GENERALE: 'DIRECTION_GENERALE',
  DAF: 'DAF',
  CAISSIER_CENTRAL: 'CAISSIER_CENTRAL',
  CONTROLEUR_INTERNE: 'CONTROLEUR_INTERNE',
  SUPERVISEUR_ZONE: 'SUPERVISEUR_ZONE',
  RESPONSABLE_BOUTIQUE: 'RESPONSABLE_BOUTIQUE',
  CAISSIER_BOUTIQUE: 'CAISSIER_BOUTIQUE',
  // Convoyeur (§6.4) : peut faire passer INITIEE → EN_TRANSIT uniquement.
  CONVOYEUR: 'CONVOYEUR',
  RESPONSABLE_SI: 'RESPONSABLE_SI',
  RESPONSABLE_CRM: 'RESPONSABLE_CRM',
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
  NOUVEAU: 'NOUVEAU',
  REGULIER: 'REGULIER',
  VIP: 'VIP',
} as const;
export type SegmentClient = (typeof SegmentClient)[keyof typeof SegmentClient];

export const TypeClient = {
  PHYSIQUE: 'PHYSIQUE',
  MORALE: 'MORALE',
} as const;
export type TypeClient = (typeof TypeClient)[keyof typeof TypeClient];

export const NiveauFidelite = {
  BRONZE: 'BRONZE',
  ARGENT: 'ARGENT',
  OR: 'OR',
} as const;
export type NiveauFidelite = (typeof NiveauFidelite)[keyof typeof NiveauFidelite];

export const CanalInteraction = {
  APPEL: 'APPEL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  VISITE: 'VISITE',
  CAMPAGNE: 'CAMPAGNE',
  EMAIL: 'EMAIL',
} as const;
export type CanalInteraction = (typeof CanalInteraction)[keyof typeof CanalInteraction];

// ---------------------------------------------------------------------------
// Ventes / Point de vente boutique (§6.3.2, §5.1).
// Doit rester en cohérence stricte avec les enums Prisma correspondants
// (apps/api/prisma/schema.prisma : ModePaiement, StatutSessionCaisse).
// ---------------------------------------------------------------------------

export const ModePaiement = {
  ESPECES: 'ESPECES',
  CARTE: 'CARTE',
  MOBILE_MONEY: 'MOBILE_MONEY',
} as const;
export type ModePaiement = (typeof ModePaiement)[keyof typeof ModePaiement];

export const StatutSessionCaisse = {
  OUVERTE: 'OUVERTE',
  FERMEE: 'FERMEE',
} as const;
export type StatutSessionCaisse = (typeof StatutSessionCaisse)[keyof typeof StatutSessionCaisse];

// ---------------------------------------------------------------------------
// Achats — cycle commande → réception → facture → paiement.
// Extension validée par l'utilisateur (hors MCD §6.5 d'origine). Les
// paiements fournisseur sont un grand livre append-only distinct de
// TRANSACTION_CAISSE (§6.4) : ils ne débitent pas une caisse boutique.
// ---------------------------------------------------------------------------

export const StatutCommandeAchat = {
  BROUILLON: 'BROUILLON',
  CONFIRMEE: 'CONFIRMEE',
  PARTIELLEMENT_RECEPTIONNEE: 'PARTIELLEMENT_RECEPTIONNEE',
  RECEPTIONNEE: 'RECEPTIONNEE',
  CLOTUREE: 'CLOTUREE',
  ANNULEE: 'ANNULEE',
} as const;
export type StatutCommandeAchat =
  (typeof StatutCommandeAchat)[keyof typeof StatutCommandeAchat];

export const TRANSITIONS_COMMANDE_ACHAT: Record<
  StatutCommandeAchat,
  StatutCommandeAchat[]
> = {
  BROUILLON: [StatutCommandeAchat.CONFIRMEE, StatutCommandeAchat.ANNULEE],
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
  BROUILLON: 'BROUILLON',
  COMPTABILISEE: 'COMPTABILISEE',
  PARTIELLEMENT_PAYEE: 'PARTIELLEMENT_PAYEE',
  PAYEE: 'PAYEE',
  ANNULEE: 'ANNULEE',
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
  VIREMENT: 'VIREMENT',
  ESPECES: 'ESPECES',
  MOBILE_MONEY: 'MOBILE_MONEY',
} as const;
export type ModePaiementFournisseur =
  (typeof ModePaiementFournisseur)[keyof typeof ModePaiementFournisseur];

export const UsageEmplacement = {
  STOCK: 'STOCK',
  ENTREE: 'ENTREE',
  SORTIE: 'SORTIE',
  PERTE: 'PERTE',
  FOURNISSEUR: 'FOURNISSEUR',
  CLIENT: 'CLIENT',
} as const;
export type UsageEmplacement = (typeof UsageEmplacement)[keyof typeof UsageEmplacement];

export const TypeOperationStock = {
  RECEPTION: 'RECEPTION',
  LIVRAISON: 'LIVRAISON',
  TRANSFERT_INTERNE: 'TRANSFERT_INTERNE',
  REBUT: 'REBUT',
} as const;
export type TypeOperationStock =
  (typeof TypeOperationStock)[keyof typeof TypeOperationStock];

export const StatutBonStock = {
  BROUILLON: 'BROUILLON',
  PRET: 'PRET',
  FAIT: 'FAIT',
  ANNULE: 'ANNULE',
} as const;
export type StatutBonStock = (typeof StatutBonStock)[keyof typeof StatutBonStock];

export const TRANSITIONS_BON_STOCK: Record<StatutBonStock, StatutBonStock[]> = {
  BROUILLON: [StatutBonStock.PRET, StatutBonStock.ANNULE],
  PRET: [StatutBonStock.FAIT, StatutBonStock.ANNULE],
  FAIT: [],
  ANNULE: [],
};

export const MethodeCout = {
  CMP: 'CMP',
  FIFO: 'FIFO',
  STANDARD: 'STANDARD',
} as const;
export type MethodeCout = (typeof MethodeCout)[keyof typeof MethodeCout];

export const StrategieSortie = {
  FIFO: 'FIFO',
  FEFO: 'FEFO',
} as const;
export type StrategieSortie = (typeof StrategieSortie)[keyof typeof StrategieSortie];
