import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_PASSWORD_CHECK_KEY } from '../decorators/skip-password-check.decorator';
import type { AuthenticatedUser } from '../types';

// Doit toujours s'exécuter après JwtAuthGuard et avant RolesGuard. Bloque
// tout endpoint (hors @Public()/@SkipPasswordCheck()) tant que l'utilisateur
// a mustChangePassword=true en base (§6.7 : parcours de changement de mot
// de passe forcé, décision produit validée avec l'utilisateur). La valeur
// est relue en base à chaque requête (jamais depuis le JWT) pour rester
// exacte même si un changement de mot de passe a eu lieu en cours de vie du
// token — le JWT reste stateless, seule cette vérification serveur compte.
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isExempt = this.reflector.getAllAndOverride<boolean>(
      SKIP_PASSWORD_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isExempt) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return true;
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: user.userId },
      select: { mustChangePassword: true },
    });

    if (utilisateur?.mustChangePassword) {
      throw new ForbiddenException({
        message: 'Changement de mot de passe obligatoire avant tout autre accès.',
        code: 'MUST_CHANGE_PASSWORD',
      });
    }

    return true;
  }
}
