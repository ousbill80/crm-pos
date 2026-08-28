import { RoleLibelle } from '@caisse-crm/shared';

export const ROLES_ACCOUNTING_AI_INTAKE = [RoleLibelle.RAF_COMPTABLE];
export const ROLES_ACCOUNTING_AI_REVIEW = [RoleLibelle.RAF_COMPTABLE];
export const ROLES_ACCOUNTING_AI_POLICY_APPROVAL = [RoleLibelle.DAF];
export const ROLES_ACCOUNTING_AI_FINDING_REMEDIATION = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
];
export const ROLES_ACCOUNTING_AI_AUDIT = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RAF_COMPTABLE,
];
