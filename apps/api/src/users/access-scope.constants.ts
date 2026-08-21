import { RoleLibelle } from '@caisse-crm/shared';

// ---------------------------------------------------------------------------
// Administration des comptes utilisateurs (§4, §6.2) — miroir du pattern
// ROLES_ADMIN_STRUCTURE (apps/api/src/caisses/access-scope.constants.ts).
// ---------------------------------------------------------------------------

// Création/modification/désactivation/reset mot de passe : Responsable SI +
// Direction Générale uniquement.
export const ROLES_ADMIN_UTILISATEURS: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

// Lecture de l'annuaire utilisateurs : administration + DAF + Contrôleur
// interne (périmètre de contrôle réseau entier, §4).
export const ROLES_LECTURE_UTILISATEURS: RoleLibelle[] = [
  ...ROLES_ADMIN_UTILISATEURS,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];

// Rôles à périmètre boutique : le compte est inexploitable sans boutiqueId
// (cf. apps/api/src/boutiques/boutique-scope.util.ts pour SUPERVISEUR_ZONE).
// Tous les autres rôles sont des profils réseau entier (boutiqueId doit
// rester null, §6.2).
export const ROLES_BOUTIQUE_REQUISE: RoleLibelle[] = [
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.CONVOYEUR,
];
