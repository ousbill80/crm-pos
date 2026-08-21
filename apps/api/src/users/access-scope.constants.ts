import { RoleLibelle } from '@caisse-crm/shared';

// Administration des comptes utilisateurs (§4, §6.2).
// Doit rester aligné sur packages/shared ROLES_*_UTILISATEURS / ROLES_BOUTIQUE_REQUISE.
export const ROLES_ADMIN_UTILISATEURS: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

export const ROLES_LECTURE_UTILISATEURS: RoleLibelle[] = [
  ...ROLES_ADMIN_UTILISATEURS,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];

export const ROLES_BOUTIQUE_REQUISE: RoleLibelle[] = [
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.CONVOYEUR,
];
