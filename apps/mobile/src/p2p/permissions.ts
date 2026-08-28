import { RoleLibelle, profilOf, type RoleLibelle as Role } from '@caisse-crm/shared';

export type P2pCapability =
  | 'READ'
  | 'REQUEST_WRITE'
  | 'REQUEST_APPROVE'
  | 'ORDER_WRITE'
  | 'ORDER_APPROVE'
  | 'IMPORT'
  | 'RECEIPT'
  | 'QUALITY'
  | 'INVOICE_REVIEW'
  | 'INVOICE_EXCEPTION'
  | 'ACCOUNTING'
  | 'PAYMENT_APPROVE'
  | 'PAYMENT_EXCEPTION'
  | 'PAYMENT_EXECUTE'
  | 'AI_REVIEW'
  | 'AI_POLICY_APPROVE'
  | 'AI_AUDIT'
  | 'AI_REMEDIATE';

const ROLES: Record<P2pCapability, readonly Role[]> = {
  READ: [
    RoleLibelle.RESPONSABLE_SI,
    RoleLibelle.DIRECTION_GENERALE,
    RoleLibelle.DAF,
    RoleLibelle.CONTROLEUR_INTERNE,
    RoleLibelle.CAISSIER_CENTRAL,
    RoleLibelle.SUPERVISEUR_ZONE,
    RoleLibelle.RESPONSABLE_BOUTIQUE,
    RoleLibelle.ACHATS,
    RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    RoleLibelle.QUALITE_STOCKS,
    RoleLibelle.RAF_COMPTABLE,
  ],
  REQUEST_WRITE: [RoleLibelle.ACHATS, RoleLibelle.RESPONSABLE_BOUTIQUE],
  REQUEST_APPROVE: [RoleLibelle.DAF, RoleLibelle.DIRECTION_GENERALE],
  ORDER_WRITE: [
    RoleLibelle.RESPONSABLE_SI,
    RoleLibelle.ACHATS,
    RoleLibelle.RESPONSABLE_BOUTIQUE,
  ],
  ORDER_APPROVE: [RoleLibelle.DAF, RoleLibelle.DIRECTION_GENERALE],
  IMPORT: [RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE],
  RECEIPT: [RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE],
  QUALITY: [RoleLibelle.QUALITE_STOCKS],
  INVOICE_REVIEW: [RoleLibelle.RAF_COMPTABLE],
  INVOICE_EXCEPTION: [RoleLibelle.DAF, RoleLibelle.DIRECTION_GENERALE],
  ACCOUNTING: [RoleLibelle.RAF_COMPTABLE],
  PAYMENT_APPROVE: [RoleLibelle.DAF],
  PAYMENT_EXCEPTION: [RoleLibelle.DIRECTION_GENERALE],
  PAYMENT_EXECUTE: [RoleLibelle.DAF, RoleLibelle.CAISSIER_CENTRAL],
  AI_REVIEW: [RoleLibelle.RAF_COMPTABLE],
  AI_POLICY_APPROVE: [RoleLibelle.DAF],
  AI_AUDIT: [
    RoleLibelle.CONTROLEUR_INTERNE,
    RoleLibelle.DAF,
    RoleLibelle.DIRECTION_GENERALE,
    RoleLibelle.RAF_COMPTABLE,
  ],
  AI_REMEDIATE: [RoleLibelle.CONTROLEUR_INTERNE, RoleLibelle.DAF],
};

export function canP2p(role: Role, capability: P2pCapability): boolean {
  return ROLES[capability].includes(role);
}

export function hasP2pMobileAccess(role: Role): boolean {
  return profilOf(role).apps.purchase !== undefined || canP2p(role, 'AI_AUDIT');
}

export function isBoutiqueCashier(role: Role): boolean {
  return role === RoleLibelle.CAISSIER_BOUTIQUE;
}

export function assertP2p(role: Role, capability: P2pCapability): void {
  if (!canP2p(role, capability)) {
    throw new Error(`Action P2P interdite pour le rôle ${role}.`);
  }
}
