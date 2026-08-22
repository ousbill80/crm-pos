import { RoleLibelle } from './enums.js';

/** Applications du shell (ids stables — navigation §4 / §6.2). */
export const APP_PROFIL_IDS = [
  'pos',
  'ventes',
  'produits',
  'inventory',
  'purchase',
  'contacts',
  'finance',
  'treasury',
  'dashboard',
  'settings',
] as const;
export type AppProfilId = (typeof APP_PROFIL_IDS)[number];

export const APP_PROFIL_LIBELLES: Record<AppProfilId, string> = {
  pos: 'Point de vente',
  ventes: 'Ventes',
  produits: 'Produits',
  inventory: 'Stocks',
  purchase: 'Achats',
  contacts: 'CRM',
  finance: 'Finance',
  treasury: 'Trésorerie',
  dashboard: 'Tableau de bord',
  settings: 'Configuration',
};

export const FAMILLE_PROFIL = {
  DIRECTION: 'DIRECTION',
  TRESORERIE: 'TRESORERIE',
  ZONE: 'ZONE',
  BOUTIQUE: 'BOUTIQUE',
  SUPPORT: 'SUPPORT',
} as const;
export type FamilleProfil = (typeof FAMILLE_PROFIL)[keyof typeof FAMILLE_PROFIL];

export const FAMILLE_PROFIL_LIBELLES: Record<FamilleProfil, string> = {
  DIRECTION: 'Direction & contrôle',
  TRESORERIE: 'Trésorerie réseau',
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
const FINANCE: AccesApp = true;
const TRESORERIE_COMPLET: AccesApp = true;
const TRESORERIE_CAISSIER: AccesApp = ['/caisses', '/transactions'];
const DASHBOARD: AccesApp = true;
const CONFIG_COMPLET: AccesApp = true;
const CONFIG_CONTROLE: AccesApp = [
  '/entreprise',
  '/utilisateurs',
  '/audit',
  '/profils',
];

/**
 * Catalogue fermé des profils §4 / §6.2.
 * On n’ajoute pas de rôle, on ne bascule pas « peut valider » : c’est le CDC.
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
      contacts: CONTACTS_SANS_CAMPAGNES,
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
      contacts: CONTACTS_SANS_CAMPAGNES,
      finance: FINANCE,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
      settings: CONFIG_CONTROLE,
    },
    resume:
      'Pôle financier réseau : résultat, stocks valorisés, trésorerie, validation niveau 2.',
    interdit: 'N’encaisse pas en boutique. Ne configure pas le SI.',
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
      finance: FINANCE,
      treasury: TRESORERIE_COMPLET,
      dashboard: DASHBOARD,
    },
    resume:
      'Réceptionne et valide les SORTIE_FONDS magasin → centrale (machine à états §6.4).',
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
      contacts: CONTACTS_SANS_CAMPAGNES,
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
    resume:
      'Poste de caisse : encaisser, session tiroir, clients, stock boutique, inventaire.',
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
      ventes: ['/ventes/devis'],
    },
    resume: 'Module CRM complet : fiches, segmentation, fidélité, campagnes (§6.6).',
    interdit: 'Pas d’accès caisse, stocks, finance, configuration SI.',
  },
};

export const LISTE_PROFILS: ProfilMetier[] = [
  PROFILS.DIRECTION_GENERALE,
  PROFILS.DAF,
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
  return LISTE_PROFILS.filter((p) => p.apps[appId] !== undefined).map(
    (p) => p.role,
  );
}

export function menuAutorise(
  role: RoleLibelle,
  appId: AppProfilId,
  menuPath: string,
): boolean {
  const acces = PROFILS[role]?.apps[appId];
  if (acces === undefined) return false;
  if (acces === true) return true;
  const base = menuPath.split('?')[0];
  return acces.some((p) => {
    const allowed = p.split('?')[0];
    return base === allowed || base.startsWith(`${allowed}/`);
  });
}

export function rolesPourMenu(
  appId: AppProfilId,
  menuPath: string,
): RoleLibelle[] {
  return LISTE_PROFILS.filter((p) =>
    menuAutorise(p.role, appId, menuPath),
  ).map((p) => p.role);
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
