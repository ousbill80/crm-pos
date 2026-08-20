import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    login: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { login },
      include: { role: true },
    });

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const passwordValide = await bcrypt.compare(
      password,
      utilisateur.passwordHash,
    );
    if (!passwordValide) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const payload: JwtPayload = {
      sub: utilisateur.id,
      login: utilisateur.login,
      role: utilisateur.role.libelle as RoleLibelle,
      boutiqueId: utilisateur.boutiqueId,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
