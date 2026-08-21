// Types partagés entre apps/api, apps/web et apps/mobile.
// Doivent rester en cohérence stricte avec apps/api/prisma/schema.prisma
// et le cahier des charges (§6.4, §6.5).

export const TypeCaisse = {
  AUXILIAIRE: 'AUXILIAIRE',
  CENTRALE: 'CENTRALE',
} as const;
export type TypeCaisse = (typeof TypeCaisse)[keyof typeof TypeCaisse];

export const TypeTransaction = {
  VENTE: 'VENTE',
  SORTIE_FONDS: 'SORTIE_FONDS',
} as const;
export type TypeTransaction = (typeof TypeTransaction)[keyof typeof TypeTransaction];

// Machine à états stricte — §6.4 du cahier des charges.
// INITIEE -> EN_TRANSIT -> RECEPTIONNEE -> VALIDEE
//                                       -> LITIGE -> VALIDEE (régularisation)
export const StatutTransaction = {
  INITIEE: 'INITIEE',
  EN_TRANSIT: 'EN_TRANSIT',
  RECEPTIONNEE: 'RECEPTIONNEE',
  VALIDEE: 'VALIDEE',
  LITIGE: 'LITIGE',
} as const;
export type StatutTransaction = (typeof StatutTransaction)[keyof typeof StatutTransaction];

// Transitions autorisées (§6.4). Utilisé côté API pour la garde RBAC et côté
// client pour n'afficher que les actions permises — l'application de la
// règle reste toujours faite côté serveur. LITIGE -> VALIDEE = régularisation
// Contrôle interne / DAF uniquement (voir ROLES_REGULARISATION_LITIGE).
export const TRANSITIONS_AUTORISEES: Record<StatutTransaction, StatutTransaction[]> = {
  INITIEE: [StatutTransaction.EN_TRANSIT],
  EN_TRANSIT: [StatutTransaction.RECEPTIONNEE],
  RECEPTIONNEE: [StatutTransaction.VALIDEE, StatutTransaction.LITIGE],
  VALIDEE: [],
  LITIGE: [StatutTransaction.VALIDEE],
};

export const RoleLibelle = {
  DIRECTION_GENERALE: 'DIRECTION_GENERALE',
  DAF: 'DAF',
  CAISSIER_CENTRAL: 'CAISSIER_CENTRAL',
  CONTROLEUR_INTERNE: 'CONTROLEUR_INTERNE',
  SUPERVISEUR_ZONE: 'SUPERVISEUR_ZONE',
  RESPONSABLE_BOUTIQUE: 'RESPONSABLE_BOUTIQUE',
  CAISSIER_BOUTIQUE: 'CAISSIER_BOUTIQUE',
  RESPONSABLE_SI: 'RESPONSABLE_SI',
  RESPONSABLE_CRM: 'RESPONSABLE_CRM',
} as const;
export type RoleLibelle = (typeof RoleLibelle)[keyof typeof RoleLibelle];

// Rôles habilités à réceptionner/valider une transaction (§6.4, règle imperative).
export const ROLES_VALIDATION_CAISSE_CENTRALE: RoleLibelle[] = [
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.DAF,
];

// Régularisation d'un LITIGE (§6.4) : Contrôle interne (arbitrage) + DAF (niveau 2).
export const ROLES_REGULARISATION_LITIGE: RoleLibelle[] = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
];

// ---------------------------------------------------------------------------
// CRM (§6.6) — segmentation, fidélité, interactions.
// Doit rester en cohérence stricte avec les enums Prisma correspondants
// (apps/api/prisma/schema.prisma : SegmentClient, NiveauFidelite, CanalInteraction).
// ---------------------------------------------------------------------------

export const SegmentClient = {
  NOUVEAU: 'NOUVEAU',
  REGULIER: 'REGULIER',
  VIP: 'VIP',
} as const;
export type SegmentClient = (typeof SegmentClient)[keyof typeof SegmentClient];

export const NiveauFidelite = {
  BRONZE: 'BRONZE',
  ARGENT: 'ARGENT',
  OR: 'OR',
} as const;
export type NiveauFidelite = (typeof NiveauFidelite)[keyof typeof NiveauFidelite];

export const CanalInteraction = {
  APPEL: 'APPEL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  VISITE: 'VISITE',
  CAMPAGNE: 'CAMPAGNE',
} as const;
export type CanalInteraction = (typeof CanalInteraction)[keyof typeof CanalInteraction];

// ---------------------------------------------------------------------------
// Ventes / Point de vente boutique (§6.3.2, §5.1).
// Doit rester en cohérence stricte avec les enums Prisma correspondants
// (apps/api/prisma/schema.prisma : ModePaiement, StatutSessionCaisse).
// ---------------------------------------------------------------------------

export const ModePaiement = {
  ESPECES: 'ESPECES',
  CARTE: 'CARTE',
  MOBILE_MONEY: 'MOBILE_MONEY',
} as const;
export type ModePaiement = (typeof ModePaiement)[keyof typeof ModePaiement];

export const StatutSessionCaisse = {
  OUVERTE: 'OUVERTE',
  FERMEE: 'FERMEE',
} as const;
export type StatutSessionCaisse = (typeof StatutSessionCaisse)[keyof typeof StatutSessionCaisse];
