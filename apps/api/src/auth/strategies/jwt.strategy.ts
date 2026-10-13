import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser, JwtPayload } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET doit être défini (voir apps/api/.env)');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Compte introuvable ou désactivé.');
    }

    if (
      utilisateur.sessionsRevoqueesAvant &&
      (!payload.iat ||
        payload.iat * 1000 < utilisateur.sessionsRevoqueesAvant.getTime())
    ) {
      throw new UnauthorizedException(
        'Session révoquée : veuillez vous reconnecter.',
      );
    }

    return {
      userId: utilisateur.id,
      login: utilisateur.login,
      role: utilisateur.role.libelle as RoleLibelle,
      boutiqueId: utilisateur.boutiqueId,
    };
  }
}
