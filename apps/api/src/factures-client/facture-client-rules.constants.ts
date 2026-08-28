/**
 * Factures clients B2B — règles figées (hors CDC, interprétation documentée).
 *
 * Machine : BROUILLON → EMISE | ANNULEE. EMISE est immuable (lignes + GL).
 * Prix : HT (comme le devis B2B) ; TVA extraite au taux produit, sinon
 * taux shop par défaut (18 %). Écriture : D 411 / C 701 / C 4457 via
 * TypeSourceComptable.FACTURE_CLIENT — jamais VENTE_POS / COMMANDE_WEB.
 * Un devis TRANSFORMÉ avec venteId (ticket POS) ne peut pas devenir facture.
 *
 * Rôles écriture : CRM, responsable boutique, DAF, DG, RAF.
 * Encaissement 411 : RAF, DAF, caissier central, responsable boutique.
 * Caissier boutique : 403 (vente POS seulement, §4 / §6.2).
 */
import { RoleLibelle } from '@caisse-crm/shared';

export {
  transitionFactureClientAutorisee,
  transitionsFactureClientAutorisees,
  type StatutFactureClient,
} from './facture-client-transitions';

export const ROLES_FACTURE_CLIENT_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RAF_COMPTABLE,
];

export const ROLES_FACTURE_CLIENT_ENCAISSEMENT: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

export const ROLES_FACTURE_CLIENT_LECTURE: RoleLibelle[] = [
  ...new Set([
    ...ROLES_FACTURE_CLIENT_ECRITURE,
    ...ROLES_FACTURE_CLIENT_ENCAISSEMENT,
    RoleLibelle.CONTROLEUR_INTERNE,
    RoleLibelle.SUPERVISEUR_ZONE,
  ]),
];

export const TAUX_TVA_DEFAUT_FACTURE = 18;
