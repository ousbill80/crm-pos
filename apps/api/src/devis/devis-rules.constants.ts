/**
 * Devis clients B2B — règles figées (hors CDC, interprétation documentée).
 *
 * Machine à états :
 *   BROUILLON → ENVOYE → ACCEPTE | REFUSE
 *   BROUILLON | ENVOYE → ANNULE
 *   ACCEPTE → TRANSFORME (venteId optionnel ; pas d’ouverture POS automatique)
 *
 * TVA : hors TVA (montants nets, pas de ligne TVA).
 * Rôles écriture : RESPONSABLE_CRM, RESPONSABLE_BOUTIQUE, DAF, DIRECTION_GENERALE.
 */
import { RoleLibelle } from '@caisse-crm/shared';

export {
  transitionDevisAutorisee,
  transitionsDevisAutorisees,
  type StatutDevis,
} from './devis-transitions';

export const ROLES_DEVIS_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

export const ROLES_DEVIS_LECTURE: RoleLibelle[] = [
  ...ROLES_DEVIS_ECRITURE,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.SUPERVISEUR_ZONE,
];
