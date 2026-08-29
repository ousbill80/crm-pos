import { RoleLibelle } from './enums.js';

/** Applications du shell (ids stables — navigation §4 / §6.2). */
export const APP_PROFIL_IDS = [
  'pos',
  'ventes',
  'produits',
  'inventory',
  'purchase',
  'contacts',
  'accounting',
  'finance',
  'treasury',
  'dashboard',
  'settings',
  'help',
] as const;
export type AppProfilId = (typeof APP_PROFIL_IDS)[number];

export const APP_PROFIL_LIBELLES: Record<AppProfilId, string> = {
  pos: 'Point de vente',
  ventes: 'Ventes',
  produits: 'Produits',
  inventory: 'Stocks',
  purchase: 'Achats',
  contacts: 'CRM',
  accounting: 'Comptabilité',
  finance: 'Finance',
  treasury: 'Trésorerie',
  dashboard: 'Tableau de bord',
  settings: 'Configuration',
  help: 'Aide',
};

export const FAMILLE_PROFIL = {
  DIRECTION: 'DIRECTION',
  TRESORERIE: 'TRESORERIE',
  APPROVISIONNEMENT: 'APPROVISIONNEMENT',
  COMPTABILITE: 'COMPTABILITE',
  ZONE: 'ZONE',
  BOUTIQUE: 'BOUTIQUE',
  SUPPORT: 'SUPPORT',
} as const;
export type FamilleProfil = (typeof FAMILLE_PROFIL)[keyof typeof FAMILLE_PROFIL];

export const FAMILLE_PROFIL_LIBELLES: Record<FamilleProfil, string> = {
  DIRECTION: 'Direction & contrôle',
  TRESORERIE: 'Trésorerie réseau',
  APPROVISIONNEMENT: 'Achats, logistique & stocks',
  COMPTABILITE: 'Comptabilité',
  ZONE: 'Pilotage de zone',
  BOUTIQUE: 'Boutique',
  SUPPORT: 'Support (SI / CRM)',
};

export type PerimetreProfil = 'RESEAU' | 'ZONE' | 'BOUTIQUE' | 'SYSTEME' | 'CRM';

/**
 * true = tous les menus de l’app.
 * string[] = menus autorisés seulement (chemins).
 */
export type AccesApp = true | readonly string[];

export type ValidationCircuit = false | 'centrale' | 'niveau2' | 'seuils';

export interface ProfilMetier {
  role: RoleLibelle;
  libelle: string;
  famille: FamilleProfil;
  perimetre: PerimetreProfil;
  boutiqueRequise: boolean;
  validationCircuit: ValidationCircuit;
  accueil: string;
  apps: Partial<Record<AppProfilId, AccesApp>>;
  resume: string;
  interdit: string;
}

const POS: AccesApp = true;
/** Siège / zone : journal des sessions POS, jamais l’écran d’encaissement (§4). */
const POS_LECTURE: AccesApp = ['/ventes'];
const VENTES: AccesApp = true;
const CATALOGUE: AccesApp = true;
const STOCKS_COMPLET: AccesApp = true;
const STOCKS_CAISSIER: AccesApp = ['/stocks', '/inventaires'];
const ACHATS: AccesApp = true;
const ACHATS_COMMANDES: AccesApp = [
  '/fournisseurs',
  '/achats/planning',
  '/achats/consultations',
  '/achats/commandes',
];
const ACHATS_LOGISTIQUE: AccesApp = ['/achats/commandes', '/achats/receptions'];
const ACHATS_QUALITE: AccesApp = ['/achats/receptions'];
const ACHATS_COMPTABILITE: AccesApp = [
  '/fournisseurs',
  '/achats/commandes',
  '/achats/receptions',
  '/achats/factures',
];
/**
 * Caissier central : lecture réseau des fiches/commandes/factures (§ ROLES_LECTURE_ACHATS
 * côté API) + paiement fournisseur (§ ROLES_PAIEMENT_FOURNISSEUR, grand livre Achats distinct
 * de TRESORERIE_CAISSE). Pas de création fournisseur/commande/facture ni de réception.
 */
const ACHATS_TRESORERIE: AccesApp = ['/fournisseurs', '/achats/commandes', '/achats/factures'];
const CONTACTS_COMPLET: AccesApp = true;
const CONTACTS_SANS_CAMPAGNES: AccesApp = [
  '/clients',
  '/clients/pilotage',
  '/clients/fidelite',
  '/clients/segmentation',
  '/clients/interactions',
];
const CONTACTS_DIRECTION: AccesApp = [
  ...CONTACTS_SANS_CAMPAGNES,
  '/clients/croissance',
];
const FINANCE: AccesApp = true;
const COMPTABILITE: AccesApp = true;
const TRESORERIE_COMPLET: AccesApp = true;
const TRESORERIE_CAISSIER: AccesApp = ['/caisses', '/transactions'];
const DASHBOARD: AccesApp = true;
const CONFIG_COMPLET: AccesApp = true;
const CONFIG_CONTROLE: AccesApp = ['/entreprise', '/utilisateurs', '/audit', '/profils'];

/**
 * Profils §4 / §6.2 complétés par les fonctions P2P validées. Les rôles
 * spécialisés restent tous hors du circuit de validation de caisse §6.4.
 */
export const PROFILS: Record<RoleLibelle, ProfilMetier> = {
  DIRECTION_GENERALE: {
    role: RoleLibelle.DIRECTION_GENERALE,
    libelle: 'Direction générale',
    famille: FAMILLE_PROFIL.DIRECTION,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: 'seuils',
    accueil: '/finance',
    apps: {
      pos: POS_LECTURE,
      ventes: VENTES,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS,
      contacts: CONTACTS_DIRECTION,
      accounting: COMPTABILITE,
      finance: FINANCE,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
      settings: CONFIG_COMPLET,
    },
    resume:
      'Consultation réseau entier. Validation des versements uniquement au-delà du seuil exceptionnel.',
    interdit: 'N’opère pas la caisse boutique. Ne réceptionne pas en routine (§6.4).',
  },
  DAF: {
    role: RoleLibelle.DAF,
    libelle: 'DAF',
    famille: FAMILLE_PROFIL.DIRECTION,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: 'niveau2',
    accueil: '/finance',
    apps: {
      pos: POS_LECTURE,
      ventes: VENTES,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS,
      contacts: CONTACTS_DIRECTION,
      accounting: COMPTABILITE,
      finance: FINANCE,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
      settings: CONFIG_CONTROLE,
    },
    resume:
      'Pôle financier réseau : achats (fiches, commandes, réceptions, factures, paiements), résultat, stocks valorisés, trésorerie, validation niveau 2.',
    interdit: 'N’encaisse pas en boutique. Ne configure pas le SI (zones, magasins, catalogue).',
  },
  ACHATS: {
    role: RoleLibelle.ACHATS,
    libelle: 'Responsable achats',
    famille: FAMILLE_PROFIL.APPROVISIONNEMENT,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/achats/commandes',
    apps: {
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS_COMMANDES,
      dashboard: DASHBOARD,
    },
    resume: 'Référentiel fournisseurs, demandes et préparation des commandes réseau.',
    interdit:
      'N’approuve pas ses propres commandes, ne réceptionne pas, ne comptabilise pas et ne paie pas.',
  },
  LOGISTIQUE_TRANSIT_DOUANE: {
    role: RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    libelle: 'Logistique / Transit / Douane',
    famille: FAMILLE_PROFIL.APPROVISIONNEMENT,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/achats/receptions',
    apps: {
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS_LOGISTIQUE,
      dashboard: DASHBOARD,
    },
    resume: 'Suit production, expédition, transit, douane et réception quantitative.',
    interdit:
      'Ne gère pas le référentiel fournisseur, ne valide pas la qualité, ne comptabilise pas et ne paie pas.',
  },
  QUALITE_STOCKS: {
    role: RoleLibelle.QUALITE_STOCKS,
    libelle: 'Qualité / Stocks',
    famille: FAMILLE_PROFIL.APPROVISIONNEMENT,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/achats/receptions',
    apps: {
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS_QUALITE,
      dashboard: DASHBOARD,
    },
    resume: 'Contrôle la conformité qualité, la quarantaine et l’acceptation en stock.',
    interdit: 'Ne commande pas, ne comptabilise pas, ne paie pas et ne valide aucune caisse.',
  },
  RAF_COMPTABLE: {
    role: RoleLibelle.RAF_COMPTABLE,
    libelle: 'RAF / Comptable',
    famille: FAMILLE_PROFIL.COMPTABILITE,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/finance/comptabilite',
    apps: {
      purchase: ACHATS_COMPTABILITE,
      accounting: COMPTABILITE,
      finance: FINANCE,
      dashboard: DASHBOARD,
      ventes: ['/ventes/factures'],
    },
    resume:
      'Saisit et comptabilise les factures fournisseur dans les référentiels fiscaux et SYSCOHADA.',
    interdit:
      'Ne crée pas de fournisseur ou commande, ne réceptionne pas, ne paie pas et ne valide aucune caisse.',
  },
  CAISSIER_CENTRAL: {
    role: RoleLibelle.CAISSIER_CENTRAL,
    libelle: 'Caissier central / Trésorier',
    famille: FAMILLE_PROFIL.TRESORERIE,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: 'centrale',
    accueil: '/finance',
    apps: {
      pos: POS_LECTURE,
      ventes: VENTES,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS_TRESORERIE,
      contacts: CONTACTS_SANS_CAMPAGNES,
      accounting: COMPTABILITE,
      finance: FINANCE,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
    },
    resume: 'Réceptionne et valide les SORTIE_FONDS magasin → centrale (machine à états §6.4).',
    interdit: 'N’initie pas une vente boutique. N’administre pas les utilisateurs.',
  },
  CONTROLEUR_INTERNE: {
    role: RoleLibelle.CONTROLEUR_INTERNE,
    libelle: 'Contrôleur interne / Auditeur',
    famille: FAMILLE_PROFIL.DIRECTION,
    perimetre: 'RESEAU',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/finance',
    apps: {
      pos: POS_LECTURE,
      ventes: VENTES,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      contacts: CONTACTS_DIRECTION,
      accounting: COMPTABILITE,
      finance: FINANCE,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
      settings: CONFIG_CONTROLE,
    },
    resume: 'Lecture + audit réseau. Arbitre les litiges de versement.',
    interdit: 'Ne réceptionne pas, ne valide pas, n’encaisse pas.',
  },
  SUPERVISEUR_ZONE: {
    role: RoleLibelle.SUPERVISEUR_ZONE,
    libelle: 'Superviseur de zone',
    famille: FAMILLE_PROFIL.ZONE,
    perimetre: 'ZONE',
    boutiqueRequise: true,
    validationCircuit: false,
    accueil: '/dashboard',
    apps: {
      pos: POS_LECTURE,
      ventes: VENTES,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      contacts: CONTACTS_SANS_CAMPAGNES,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
    },
    resume: 'Pilotage des boutiques de sa zone. Lecture CA, stocks, versements.',
    interdit: 'Ne valide pas, ne réceptionne pas, n’administre pas le SI.',
  },
  RESPONSABLE_BOUTIQUE: {
    role: RoleLibelle.RESPONSABLE_BOUTIQUE,
    libelle: 'Responsable boutique',
    famille: FAMILLE_PROFIL.BOUTIQUE,
    perimetre: 'BOUTIQUE',
    boutiqueRequise: true,
    validationCircuit: false,
    accueil: '/dashboard',
    apps: {
      pos: POS,
      ventes: VENTES,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS,
      contacts: CONTACTS_SANS_CAMPAGNES,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
    },
    resume:
      'Sa boutique : POS, initiation des versements magasin → centrale, mise en transit, stock.',
    interdit: 'Ne réceptionne pas et ne valide pas un versement (§6.4).',
  },
  CAISSIER_BOUTIQUE: {
    role: RoleLibelle.CAISSIER_BOUTIQUE,
    libelle: 'Caissier(ère) boutique',
    famille: FAMILLE_PROFIL.BOUTIQUE,
    perimetre: 'BOUTIQUE',
    boutiqueRequise: true,
    validationCircuit: false,
    accueil: '/pos',
    apps: {
      pos: POS,
      ventes: VENTES,
      inventory: STOCKS_CAISSIER,
      contacts: CONTACTS_SANS_CAMPAGNES,
      treasury: TRESORERIE_CAISSIER,
      dashboard: DASHBOARD,
    },
    resume: 'Poste de caisse : encaisser, clôturer, initier le versement du jour vers la centrale.',
    interdit:
      'Pas de catalogue, pas d’achats, pas de configuration, pas de validation / réception / litige.',
  },
  CONVOYEUR: {
    role: RoleLibelle.CONVOYEUR,
    libelle: 'Convoyeur',
    famille: FAMILLE_PROFIL.BOUTIQUE,
    perimetre: 'BOUTIQUE',
    boutiqueRequise: true,
    validationCircuit: false,
    accueil: '/transactions',
    apps: {
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
    },
    resume: 'Passe les versements Initiée → En transit uniquement (§6.4).',
    interdit: 'N’encaisse pas, ne réceptionne pas, ne valide pas.',
  },
  RESPONSABLE_SI: {
    role: RoleLibelle.RESPONSABLE_SI,
    libelle: 'Responsable SI',
    famille: FAMILLE_PROFIL.SUPPORT,
    perimetre: 'SYSTEME',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/utilisateurs',
    apps: {
      settings: CONFIG_COMPLET,
      produits: CATALOGUE,
      inventory: STOCKS_COMPLET,
      purchase: ACHATS,
    },
    resume: 'Admin système : comptes, structure, catalogues, journal d’audit.',
    interdit: 'Pas d’accès trésorerie / validation de fonds (§4).',
  },
  RESPONSABLE_CRM: {
    role: RoleLibelle.RESPONSABLE_CRM,
    libelle: 'Responsable commercial / CRM',
    famille: FAMILLE_PROFIL.SUPPORT,
    perimetre: 'CRM',
    boutiqueRequise: false,
    validationCircuit: false,
    accueil: '/clients',
    apps: {
      contacts: CONTACTS_COMPLET,
      ventes: ['/ventes/devis', '/ventes/factures'],
    },
    resume: 'Module CRM complet : fiches, segmentation, fidélité, campagnes (§6.6).',
    interdit: 'Pas d’accès caisse, stocks, finance, configuration SI.',
  },
};

export const LISTE_PROFILS: ProfilMetier[] = [
  PROFILS.DIRECTION_GENERALE,
  PROFILS.DAF,
  PROFILS.ACHATS,
  PROFILS.LOGISTIQUE_TRANSIT_DOUANE,
  PROFILS.QUALITE_STOCKS,
  PROFILS.RAF_COMPTABLE,
  PROFILS.CONTROLEUR_INTERNE,
  PROFILS.CAISSIER_CENTRAL,
  PROFILS.SUPERVISEUR_ZONE,
  PROFILS.RESPONSABLE_BOUTIQUE,
  PROFILS.CAISSIER_BOUTIQUE,
  PROFILS.CONVOYEUR,
  PROFILS.RESPONSABLE_SI,
  PROFILS.RESPONSABLE_CRM,
];

export const ROLES_BOUTIQUE_REQUISE: RoleLibelle[] = LISTE_PROFILS.filter(
  (p) => p.boutiqueRequise,
).map((p) => p.role);

// Aide : accessible à tous les profils (manuels d’utilisation).
for (const profil of LISTE_PROFILS) {
  profil.apps.help = true;
}

export function profilOf(role: RoleLibelle): ProfilMetier {
  return PROFILS[role];
}

export function labelProfil(role: RoleLibelle): string {
  return PROFILS[role]?.libelle ?? role;
}

export function homeForRole(role: RoleLibelle): string {
  return PROFILS[role]?.accueil ?? '/dashboard';
}

export function rolesPourApp(appId: AppProfilId): RoleLibelle[] {
  return LISTE_PROFILS.filter((p) => p.apps[appId] !== undefined).map((p) => p.role);
}

export function menuAutorise(role: RoleLibelle, appId: AppProfilId, menuPath: string): boolean {
  const acces = PROFILS[role]?.apps[appId];
  if (acces === undefined) return false;
  if (acces === true) return true;
  const base = menuPath.split('?')[0];
  return acces.some((p) => {
    const allowed = p.split('?')[0];
    return base === allowed || base.startsWith(`${allowed}/`);
  });
}

export function rolesPourMenu(appId: AppProfilId, menuPath: string): RoleLibelle[] {
  return LISTE_PROFILS.filter((p) => menuAutorise(p.role, appId, menuPath)).map((p) => p.role);
}

export function accueilApp(role: RoleLibelle, appId: AppProfilId, fallback: string): string {
  const acces = PROFILS[role]?.apps[appId];
  if (acces === undefined) return fallback;
  if (acces === true) return fallback;
  return acces[0] ?? fallback;
}

export function labelValidation(v: ValidationCircuit): string {
  if (v === 'centrale') return 'Oui — réception / validation';
  if (v === 'niveau2') return 'Oui — niveau 2 (DAF)';
  if (v === 'seuils') return 'Seuils exceptionnels seulement';
  return 'Non';
}

export function labelPerimetre(p: PerimetreProfil): string {
  if (p === 'RESEAU') return 'Réseau entier';
  if (p === 'ZONE') return 'Sa zone';
  if (p === 'BOUTIQUE') return 'Sa boutique';
  if (p === 'SYSTEME') return 'Administration système';
  return 'Module CRM';
}

/** Création / reset MDP comptes (§4) — miroir API ROLES_ADMIN_UTILISATEURS. */
export const ROLES_ADMIN_UTILISATEURS: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

/** Lecture annuaire (§4) — miroir API ROLES_LECTURE_UTILISATEURS. */
export const ROLES_LECTURE_UTILISATEURS: RoleLibelle[] = [
  ...ROLES_ADMIN_UTILISATEURS,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];
