import { RoleLibelle, ROLES_GESTION_COMMANDES_WEB } from '@caisse-crm/shared';

export const ROLES_COMMANDES_WEB_LECTURE: RoleLibelle[] = [
  ...ROLES_GESTION_COMMANDES_WEB,
  RoleLibelle.DAF,
];

export const ROLES_COMMANDES_WEB_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export const ROLES_PARAMETRES_SHOP: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

export const ROLES_SHOP_AARRR_LECTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_CRM,
];

export const ROLES_CONVERSION_VENTE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];
