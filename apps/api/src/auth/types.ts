import type { RoleLibelle } from '@caisse-crm/shared';

// Contenu du payload JWT et de req.user après authentification.
// boutiqueId = null pour les profils à vue consolidée réseau
// (Direction Générale, DAF, Caissier Central, Contrôle interne — §6.2).
export interface AuthenticatedUser {
  userId: string;
  login: string;
  role: RoleLibelle;
  boutiqueId: string | null;
}

export interface JwtPayload {
  sub: string;
  login: string;
  role: RoleLibelle;
  boutiqueId: string | null;
}
