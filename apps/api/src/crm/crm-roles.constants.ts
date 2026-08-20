import { RoleLibelle } from '@caisse-crm/shared';

// Matrice RBAC du module CRM (§6.6 du cahier des charges).
//
// Le cahier des charges ne détaille pas une matrice de droits exhaustive
// pour le CRM (contrairement à §6.4 pour les transactions). Choix
// d'interprétation retenu, documenté ici et signalé dans le rapport de fin
// de tâche :
//   - RESPONSABLE_CRM (propriétaire fonctionnel du module, §4) : accès
//     complet (création, lecture, modification, administration fidélité).
//   - Rôles boutique (CAISSIER_BOUTIQUE, RESPONSABLE_BOUTIQUE) : peuvent
//     créer une fiche client (accueil d'un client en boutique) et une
//     interaction CRM courante (ex. visite), et consulter la fiche
//     consolidée réseau — mais ne peuvent pas modifier un client existant
//     ni piloter la fidélité/segmentation (actions à portée réseau
//     réservées au Responsable CRM).
//   - Rôles à vue consolidée réseau (DIRECTION_GENERALE, DAF,
//     CAISSIER_CENTRAL, CONTROLEUR_INTERNE, SUPERVISEUR_ZONE) : lecture
//     seule — cohérent avec "fiche client unique consolidée réseau"
//     (§6.6) qui doit être visible depuis n'importe quelle boutique/niveau
//     hiérarchique.
//   - RESPONSABLE_SI : aucun accès aux données CRM par défaut (périmètre
//     "admin système", §4 — pas de périmètre de données client).

export const CRM_ROLES_LECTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export const CRM_ROLES_CREATION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export const CRM_ROLES_ADMIN: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];
