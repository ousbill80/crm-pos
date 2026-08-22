import { RoleLibelle } from '@caisse-crm/shared';

// ---------------------------------------------------------------------------
// Groupes de rôles pour le périmètre de données (§4, §6.2 du cahier des
// charges) des modules Zone / Boutique / Caisse. Utilisés à la fois pour le
// gating @Roles() au niveau des endpoints et pour le filtrage des résultats
// au niveau des services (le RBAC doit être vérifié côté serveur sur chaque
// endpoint sensible, pas seulement affiché/masqué côté UI).
// ---------------------------------------------------------------------------

// Rôles à vue consolidée réseau entier pour la trésorerie (caisses) :
// Direction Générale, DAF, Caissier Central, Contrôleur interne.
export const ROLES_RESEAU_TRESORERIE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
];

// Rôles à vue consolidée réseau entier pour la structure organisationnelle
// (zones/boutiques) : les rôles trésorerie réseau entier + Responsable SI
// (« Admin système — accès structure zones/boutiques », sans accès
// trésorerie propre — voir ROLES_RESEAU_TRESORERIE qui ne le contient pas).
export const ROLES_RESEAU_STRUCTURE: RoleLibelle[] = [
  ...ROLES_RESEAU_TRESORERIE,
  RoleLibelle.RESPONSABLE_SI,
];

// Rôles habilités à créer/modifier la structure organisationnelle
// (zones/boutiques) : Responsable SI ou Direction Générale uniquement.
export const ROLES_ADMIN_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

// Rôle à périmètre zone.
export const ROLE_SUPERVISEUR_ZONE = RoleLibelle.SUPERVISEUR_ZONE;

// Rôles à périmètre boutique unique (identité / filtre de données).
// Le CONVOYEUR (§6.4) est rattaché à une boutique et ne peut que mettre
// EN_TRANSIT — jamais encaisser (voir ROLES_POS_ECRITURE).
export const ROLES_PERIMETRE_BOUTIQUE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.CONVOYEUR,
];

// Écriture POS (session, vente, retour, clôture, file) — §4 / CLAUDE.md :
// caissier + responsable boutique uniquement. Convoyeur exclu.
export const ROLES_POS_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

// Transfert stock boutique (hors ajustement admin SI/DG) — même périmètre
// que le POS : pas le convoyeur.
export const ROLES_STOCK_ECRITURE_BOUTIQUE: RoleLibelle[] = [
  ...ROLES_POS_ECRITURE,
];

// Rôles autorisés à lire la structure (zones/boutiques) : tous les rôles
// métier de la hiérarchie caisses, à l'exclusion explicite de
// RESPONSABLE_CRM (« pas d'accès trésorerie, hors périmètre » — et par
// extension hors périmètre structure caisses/boutiques dans ce module).
export const ROLES_LECTURE_STRUCTURE: RoleLibelle[] = [
  ...ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
  ...ROLES_PERIMETRE_BOUTIQUE,
];

// Rôles autorisés à lire les caisses (trésorerie) : réseau entier trésorerie
// + superviseur de zone + périmètre boutique. RESPONSABLE_SI et
// RESPONSABLE_CRM en sont explicitement exclus (aucun accès trésorerie).
export const ROLES_LECTURE_CAISSES: RoleLibelle[] = [
  ...ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
  ...ROLES_PERIMETRE_BOUTIQUE,
];

// Inventaire physique (sécurité du stock) : comptage en boutique, sans le
// convoyeur (hors périmètre inventaire). La validation est un rôle distinct.
export const ROLES_INVENTAIRE_COMPTAGE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export const ROLES_INVENTAIRE_VALIDATION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/**
 * Fiches fournisseur (création / modification) : SI, DG, DAF.
 * Distinct de ROLES_ADMIN_STRUCTURE (zones / magasins / catalogue) — le DAF
 * pilote les achats, pas la configuration SI.
 */
export const ROLES_FICHE_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

/** Réception fournisseur → entrée en stock : SI / DG / DAF (entrepôt). La boutique réceptionne les transferts. */
export const ROLES_RECEPTION_STOCK: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

/** Bons de commande : SI / DG / DAF / responsable boutique (création + confirmation). */
export const ROLES_COMMANDE_ACHAT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Lecture achats (fournisseurs, commandes, factures) : pas le caissier / convoyeur. */
export const ROLES_LECTURE_ACHATS: RoleLibelle[] = [
  ...ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Factures fournisseur (saisie / comptabilisation) : SI, DG, DAF. */
export const ROLES_FACTURE_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

/**
 * Paiements fournisseur — grand livre Achats, pas TRANSACTION_CAISSE §6.4.
 * DAF + Caissier Central uniquement (trésorerie). Boutique et SI exclus.
 */
export const ROLES_PAIEMENT_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
];

/** Création / mise en prêt des bons de stock (réseau). */
export const ROLES_BON_STOCK_PILOTE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

/**
 * Répartition hub → boutiques après réception groupe.
 * SI / DG / DAF : multi-sites. RESPONSABLE_BOUTIQUE : uniquement son PRINCIPAL.
 */
export const ROLES_REPARTITION_STOCK: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Valider FAIT un bon : pilote réseau + responsable boutique (destination dans son magasin). */
export const ROLES_BON_STOCK_FAIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Fréquence cible (jours) au-delà de laquelle un entrepôt est « à inventorier ». */
export const INVENTAIRE_FREQUENCE_CIBLE_JOURS = 30;
