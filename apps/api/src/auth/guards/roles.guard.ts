import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleLibelle } from '@caisse-crm/shared';
import { AuditService } from '../../audit/audit.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../types';

// Doit toujours s'exécuter après JwtAuthGuard. Rejette explicitement (403)
// toute requête d'un rôle non listé par @Roles(...) — règle imperative §6.4.
// §6.7 : journalise chaque tentative d'accès non autorisée (append-only).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RoleLibelle[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method?: string;
      url?: string;
    }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      if (user?.userId) {
        const handler = context.getHandler().name;
        const controller = context.getClass().name;
        void this.audit
          .record({
            utilisateurId: user.userId,
            action: 'ACCES_REFUSE',
            entite: 'ENDPOINT',
            entiteId: `${controller}.${handler}`,
            details: JSON.stringify({
              role: user.role,
              requiredRoles,
              method: request.method ?? null,
              path: request.url ?? null,
            }),
          })
          .catch(() => undefined);
      }

      throw new ForbiddenException(
        `Rôle "${user?.role ?? 'inconnu'}" non habilité pour cette opération.`,
      );
    }

    return true;
  }
}
