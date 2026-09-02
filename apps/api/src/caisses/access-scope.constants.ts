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
// (zones/boutiques) : SI, Direction Générale et DAF (pilotage réseau).
export const ROLES_ADMIN_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
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
  RoleLibelle.DAF,
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
 * Catalogue produit (création / modification fiche) : SI, DG, DAF.
 * Distinct de l’import CSV et de l’admin structure (zones / magasins).
 * Permet l’auto-création depuis un bon de commande (EntityFinder).
 */
export const ROLES_CATALOGUE_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

/**
 * Fiches fournisseur (création / modification) : SI, DG, DAF.
 * Distinct de ROLES_ADMIN_STRUCTURE (zones / magasins).
 */
export const ROLES_FICHE_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.ACHATS,
];

/**
 * Réception quantitative fournisseur. Le rôle Logistique enregistre le fait
 * physique ; l'acceptation qualité appartient au groupe distinct ci-dessous.
 */
export const ROLES_RECEPTION_STOCK: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
];

/** Préparation d'une demande/commande : Achats, sans pouvoir l'approuver. */
export const ROLES_SAISIE_COMMANDE_ACHAT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.ACHATS,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Approbation achat : DAF / DG, séparée de la saisie opérationnelle. */
export const ROLES_APPROBATION_COMMANDE_ACHAT: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

/** Suivi production, transport et douane : fonction logistique dédiée. */
export const ROLES_LOGISTIQUE_IMPORT: RoleLibelle[] = [
  RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_SI,
];

/** Planning : le besoin est préparé par Achats ou initié dans sa boutique. */
export const ROLES_DEMANDE_ACHAT_ECRITURE: RoleLibelle[] = [
  RoleLibelle.ACHATS,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Décision selon les règles monétaires configurées, jamais par le demandeur. */
export const ROLES_APPROBATION_DEMANDE_ACHAT: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

/** Consultation et saisie comparative des offres : Achats + DAF / SI / DG. */
export const ROLES_SOURCING_ACHAT: RoleLibelle[] = [
  RoleLibelle.ACHATS,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_SI,
];

/**
 * Groupe de gestion conservé pour compatibilité des imports existants.
 * Les endpoints sensibles doivent préférer les groupes saisie/approbation.
 */
export const ROLES_COMMANDE_ACHAT: RoleLibelle[] = [
  ...ROLES_SAISIE_COMMANDE_ACHAT,
  ...ROLES_APPROBATION_COMMANDE_ACHAT,
];

/** Lecture achats (fournisseurs, commandes, factures) : pas le caissier / convoyeur. */
export const ROLES_LECTURE_ACHATS: RoleLibelle[] = [
  ...ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.ACHATS,
  RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
  RoleLibelle.QUALITE_STOCKS,
  RoleLibelle.RAF_COMPTABLE,
];

/** Contrôle qualité indépendant de la réception quantitative. */
export const ROLES_CONTROLE_QUALITE_RECEPTION: RoleLibelle[] = [
  RoleLibelle.QUALITE_STOCKS,
  RoleLibelle.DAF,
];

/** P2P : fait quantitatif — Logistique + DAF / SI / DG. */
export const ROLES_RECEPTION_P2P_QUANTITATIVE: RoleLibelle[] = [
  RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_SI,
];

/** P2P : décision qualité, putaway et retours — Qualité + DAF / SI / DG. */
export const ROLES_QUALITE_P2P_STOCK: RoleLibelle[] = [
  RoleLibelle.QUALITE_STOCKS,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_SI,
];

/** Coûts réels transport/douane à allouer avant mise en stock. */
export const ROLES_ALLOCATION_COUT_RECEPTION: RoleLibelle[] = [
  RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_SI,
];

/** Reliquat annulé seulement avec approbation financière auditée. */
export const ROLES_CLOTURE_COURTE_ACHAT: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

/** Saisie des factures fournisseur : RAF + DAF / SI / DG. */
export const ROLES_SAISIE_FACTURE_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RAF_COMPTABLE,
];

/** Comptabilisation après contrôle : RAF + DAF. */
export const ROLES_COMPTABILISATION_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
];

/** Rapprochement et comptabilisation P2P conforme : RAF + DAF. */
export const ROLES_RAPPROCHEMENT_FACTURE_P2P: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
];

/** Dérogation explicite à un litige P2P : séparation RAF vs DAF/DG. */
export const ROLES_EXCEPTION_FACTURE_P2P: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

/** Compatibilité des imports existants ; préférer les groupes spécialisés. */
export const ROLES_FACTURE_FOURNISSEUR: RoleLibelle[] = [
  ...ROLES_SAISIE_FACTURE_FOURNISSEUR,
  ...ROLES_COMPTABILISATION_FOURNISSEUR,
];

/**
 * Paiements fournisseur — grand livre Achats, pas TRANSACTION_CAISSE §6.4.
 * DAF + Caissier Central uniquement (trésorerie). Boutique et SI exclus.
 */
export const ROLES_PAIEMENT_FOURNISSEUR: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
];

/** Préparation et comptabilisation : RAF + DAF. */
export const ROLES_P2P_COMPTABILITE_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
];

/** Approbation niveau 2 des propositions de paiement : DAF uniquement. */
export const ROLES_P2P_PAIEMENT_APPROBATION: RoleLibelle[] = [RoleLibelle.DAF];

/** Approbation au-dessus du seuil exceptionnel : DG + DAF. */
export const ROLES_P2P_PAIEMENT_EXCEPTION: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

/** Exécution bancaire/mobile DAF ; caisse centrale limitée en service au central cash. */
export const ROLES_P2P_PAIEMENT_EXECUTION: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
];

/** Lecture comptable et audit sans droit de mutation. */
export const ROLES_P2P_COMPTABILITE_LECTURE: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.CONTROLEUR_INTERNE,
];

/** Génération des dotations d’amortissement : RAF (écriture) ou DAF. */
export const ROLES_P2P_IMMO_DOTATION: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
];

/** Création / mise en prêt des bons de stock (réseau). */
export const ROLES_BON_STOCK_PILOTE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
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
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

/** Fréquence cible (jours) au-delà de laquelle un entrepôt est « à inventorier ». */
export const INVENTAIRE_FREQUENCE_CIBLE_JOURS = 30;

/**
 * Rapprochement 3 voies (§5.2, ligne 259-261) : contrôle interne — ventes
 * enregistrées / bordereaux émis / réceptions validées. Explicitement
 * Contrôleur interne, DAF, Direction Générale (pas Caissier Central, dont
 * le travail de réception est l'objet même du contrôle).
 */
export const ROLES_CONTROLE_COHERENCE: RoleLibelle[] = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];
