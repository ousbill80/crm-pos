import type { RoleLibelle } from '@caisse-crm/shared';

export interface SessionUser {
  userId: string;
  login: string;
  role: RoleLibelle;
  boutiqueId: string | null;
  prenom?: string | null;
  nom?: string | null;
}
