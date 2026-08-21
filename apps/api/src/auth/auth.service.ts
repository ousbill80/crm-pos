import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from './types';

// Verrouillage de compte après échecs répétés (§6.7 : « tentative d'accès
// non autorisée » détectable). Règle métier validée avec l'utilisateur :
// 5 échecs consécutifs -> verrouillage 15 minutes.
const MAX_TENTATIVES_ECHOUEES = 5;
const DUREE_VERROUILLAGE_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(
    login: string,
    password: string,
  ): Promise<{ accessToken: string; mustChangePassword: boolean }> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { login },
      include: { role: true },
    });

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (utilisateur.lockedUntil && utilisateur.lockedUntil > new Date()) {
      await this.audit.record({
        utilisateurId: utilisateur.id,
        action: 'LOGIN_ECHEC',
        entite: 'Utilisateur',
        entiteId: utilisateur.id,
        details: JSON.stringify({ raison: 'COMPTE_VERROUILLE' }),
      });
      throw new UnauthorizedException(
        'Compte verrouillé suite à plusieurs échecs de connexion. Réessayez plus tard.',
      );
    }

    const passwordValide = await bcrypt.compare(
      password,
      utilisateur.passwordHash,
    );

    if (!passwordValide) {
      const tentatives = utilisateur.failedLoginAttempts + 1;
      const verrouille = tentatives >= MAX_TENTATIVES_ECHOUEES;

      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: {
          failedLoginAttempts: tentatives,
          lockedUntil: verrouille
            ? new Date(Date.now() + DUREE_VERROUILLAGE_MS)
            : null,
        },
      });

      await this.audit.record({
        utilisateurId: utilisateur.id,
        action: 'LOGIN_ECHEC',
        entite: 'Utilisateur',
        entiteId: utilisateur.id,
        details: JSON.stringify({ tentatives }),
      });

      if (verrouille) {
        await this.audit.record({
          utilisateurId: utilisateur.id,
          action: 'COMPTE_VERROUILLE',
          entite: 'Utilisateur',
          entiteId: utilisateur.id,
          details: JSON.stringify({
            dureeMinutes: DUREE_VERROUILLAGE_MS / 60_000,
          }),
        });
      }

      throw new UnauthorizedException('Identifiants invalides');
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    await this.audit.record({
      utilisateurId: utilisateur.id,
      action: 'LOGIN_REUSSI',
      entite: 'Utilisateur',
      entiteId: utilisateur.id,
    });

    const payload: JwtPayload = {
      sub: utilisateur.id,
      login: utilisateur.login,
      role: utilisateur.role.libelle as RoleLibelle,
      boutiqueId: utilisateur.boutiqueId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      mustChangePassword: utilisateur.mustChangePassword,
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const utilisateur = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: userId },
    });

    const passwordValide = await bcrypt.compare(
      oldPassword,
      utilisateur.passwordHash,
    );
    if (!passwordValide) {
      throw new UnauthorizedException('Ancien mot de passe incorrect');
    }

    await this.prisma.utilisateur.update({
      where: { id: userId },
      data: {
        passwordHash: await AuthService.hashPassword(newPassword),
        mustChangePassword: false,
      },
    });

    await this.audit.record({
      utilisateurId: userId,
      action: 'MOT_DE_PASSE_CHANGE',
      entite: 'Utilisateur',
      entiteId: userId,
    });
  }

  // JWT stateless — aucune révocation serveur au logout (décision de scope
  // assumée), seule la déconnexion est journalisée (§6.7).
  async logout(userId: string): Promise<void> {
    await this.audit.record({
      utilisateurId: userId,
      action: 'LOGIN_DECONNEXION',
      entite: 'Utilisateur',
      entiteId: userId,
    });
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
