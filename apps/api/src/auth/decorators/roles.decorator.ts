import { SetMetadata } from '@nestjs/common';
import type { RoleLibelle } from '@caisse-crm/shared';

export const ROLES_KEY = 'roles';

// Restreint l'accès à un endpoint aux rôles listés (§4, §6.2 du cahier des
// charges). Toujours combiné avec JwtAuthGuard + RolesGuard — cette règle
// est appliquée côté serveur, jamais seulement dans l'UI.
export const Roles = (...roles: RoleLibelle[]) => SetMetadata(ROLES_KEY, roles);
