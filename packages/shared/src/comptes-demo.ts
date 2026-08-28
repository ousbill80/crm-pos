import { RoleLibelle } from './enums.js';
import {
  FAMILLE_PROFIL,
  FAMILLE_PROFIL_LIBELLES,
  LISTE_PROFILS,
  PROFILS,
  type FamilleProfil,
} from './profils.js';

/**
 * Comptes seedés en local uniquement (apps/api/prisma/seed.ts).
 * Catalogue fermé 1:1 avec RoleLibelle — toute omission casse le typecheck.
 * Jamais utilisés en production : le login web ne les affiche qu’en DEV.
 */
export interface CompteDemo {
  login: string;
  role: RoleLibelle;
  /** Libellé court sur le bouton login. */
  libelleCourt: string;
  /** Une ligne : ce que ce profil peut / ne peut pas (§4). */
  hint: string;
}

export const COMPTES_DEMO: Record<RoleLibelle, CompteDemo> = {
  DIRECTION_GENERALE: {
    login: 'demo-dg',
    role: RoleLibelle.DIRECTION_GENERALE,
    libelleCourt: 'DG',
    hint: 'Réseau · seuils exceptionnels',
  },
  DAF: {
    login: 'demo-daf',
    role: RoleLibelle.DAF,
    libelleCourt: 'DAF',
    hint: 'Finance · validation niveau 2',
  },
  ACHATS: {
    login: 'demo-achats',
    role: RoleLibelle.ACHATS,
    libelleCourt: 'Achats',
    hint: 'Fournisseurs · demandes · commandes',
  },
  LOGISTIQUE_TRANSIT_DOUANE: {
    login: 'demo-logistique',
    role: RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    libelleCourt: 'Logistique',
    hint: 'Transit · douane · réception',
  },
  QUALITE_STOCKS: {
    login: 'demo-qualite',
    role: RoleLibelle.QUALITE_STOCKS,
    libelleCourt: 'Qualité',
    hint: 'Contrôle qualité · stocks',
  },
  RAF_COMPTABLE: {
    login: 'demo-raf',
    role: RoleLibelle.RAF_COMPTABLE,
    libelleCourt: 'RAF',
    hint: 'Factures · comptabilité',
  },
  CAISSIER_CENTRAL: {
    login: 'demo-central',
    role: RoleLibelle.CAISSIER_CENTRAL,
    libelleCourt: 'Central',
    hint: 'Réception / validation §6.4',
  },
  CONTROLEUR_INTERNE: {
    login: 'demo-controle',
    role: RoleLibelle.CONTROLEUR_INTERNE,
    libelleCourt: 'Contrôle',
    hint: 'Audit · litiges (sans valider)',
  },
  SUPERVISEUR_ZONE: {
    login: 'demo-superviseur',
    role: RoleLibelle.SUPERVISEUR_ZONE,
    libelleCourt: 'Zone',
    hint: 'Pilotage zone (lecture)',
  },
  RESPONSABLE_BOUTIQUE: {
    login: 'demo-pos-temoin',
    role: RoleLibelle.RESPONSABLE_BOUTIQUE,
    libelleCourt: 'Magasin',
    hint: 'POS + initiation versements',
  },
  CAISSIER_BOUTIQUE: {
    login: 'demo-pos-caissier',
    role: RoleLibelle.CAISSIER_BOUTIQUE,
    libelleCourt: 'Caissier',
    hint: 'POS · jamais valider / réceptionner',
  },
  CONVOYEUR: {
    login: 'demo-convoyeur',
    role: RoleLibelle.CONVOYEUR,
    libelleCourt: 'Convoyeur',
    hint: 'Initiée → En transit seulement',
  },
  RESPONSABLE_SI: {
    login: 'demo-respsi',
    role: RoleLibelle.RESPONSABLE_SI,
    libelleCourt: 'SI',
    hint: 'Créer utilisateurs & structure',
  },
  RESPONSABLE_CRM: {
    login: 'demo-crm',
    role: RoleLibelle.RESPONSABLE_CRM,
    libelleCourt: 'CRM',
    hint: 'Clients · campagnes (§6.6)',
  },
};

export const LISTE_COMPTES_DEMO: CompteDemo[] = LISTE_PROFILS.map((p) => COMPTES_DEMO[p.role]);

export function comptesDemoParFamille(): Array<{
  famille: FamilleProfil;
  libelle: string;
  comptes: CompteDemo[];
}> {
  const ordre: FamilleProfil[] = [
    FAMILLE_PROFIL.DIRECTION,
    FAMILLE_PROFIL.TRESORERIE,
    FAMILLE_PROFIL.APPROVISIONNEMENT,
    FAMILLE_PROFIL.COMPTABILITE,
    FAMILLE_PROFIL.ZONE,
    FAMILLE_PROFIL.BOUTIQUE,
    FAMILLE_PROFIL.SUPPORT,
  ];
  return ordre.map((famille) => ({
    famille,
    libelle: FAMILLE_PROFIL_LIBELLES[famille],
    comptes: LISTE_COMPTES_DEMO.filter((c) => PROFILS[c.role].famille === famille),
  }));
}
