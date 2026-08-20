import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleLibelle } from '@caisse-crm/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../types';

// Doit toujours s'exécuter après JwtAuthGuard. Rejette explicitement (403)
// toute requête d'un rôle non listé par @Roles(...) — règle imperative §6.4 :
// aucune caisse auxiliaire ne doit pouvoir contourner cette vérification.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleLibelle[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user?.role ?? 'inconnu'}" non habilité pour cette opération.`,
      );
    }

    return true;
  }
}
