// Seuils du programme de fidélité et de la segmentation client (§6.6).
//
// Le cahier des charges demande un "programme de fidélité par paliers" et
// une "segmentation paramétrable" mais ne fixe aucun seuil numérique.
// Choix d'interprétation (documenté ici et signalé dans le rapport de fin
// de tâche) : seuils simples et raisonnables, codés en dur pour cette
// première itération plutôt qu'une table de paramétrage en base — à
// remplacer par une véritable configuration admin si le besoin est confirmé
// avec l'utilisateur.

// Points de fidélité cumulés à partir desquels le palier change.
export const SEUIL_FIDELITE_ARGENT = 500;
export const SEUIL_FIDELITE_OR = 2000;

// Nombre de ventes historisées (Vente.clientId) à partir duquel un client
// est proposé pour un changement de segment lors d'un recalcul explicite
// (endpoint dédié, jamais déclenché automatiquement à la création d'une
// vente : la création de ventes est hors périmètre de ce module CRM).
export const SEUIL_SEGMENT_REGULIER_NB_VENTES = 5;
export const SEUIL_SEGMENT_VIP_NB_VENTES = 15;
