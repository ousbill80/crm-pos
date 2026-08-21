import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ROLES_BOUTIQUE_REQUISE } from './access-scope.constants';

// Jamais passwordHash : cette sélection est la seule façon dont un
// utilisateur transite vers l'extérieur du service (§6.7).
const SELECT_UTILISATEUR = {
  id: true,
  login: true,
  nom: true,
  prenom: true,
  actif: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
  boutiqueId: true,
  role: { select: { id: true, libelle: true } },
} as const;

function genererMotDePasseTemporaire(): string {
  return crypto.randomBytes(9).toString('base64url');
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Cohérence rôle <-> périmètre (§4, §6.2, cf. schema.prisma:124-126) :
  // profils boutique = boutiqueId obligatoire, profils réseau entier =
  // boutiqueId interdit.
  private assertBoutiqueCoherente(
    role: RoleLibelle,
    boutiqueId: string | null,
  ): void {
    const requiseBoutique = ROLES_BOUTIQUE_REQUISE.includes(role);
    if (requiseBoutique && !boutiqueId) {
      throw new BadRequestException(
        `Le rôle ${role} nécessite un rattachement à une boutique (boutiqueId).`,
      );
    }
    if (!requiseBoutique && boutiqueId) {
      throw new BadRequestException(
        `Le rôle ${role} est un profil réseau entier : boutiqueId doit rester vide.`,
      );
    }
  }

  private async resolveRoleId(role: RoleLibelle): Promise<string> {
    const roleRow = await this.prisma.role.findUnique({
      where: { libelle: role },
    });
    if (!roleRow) {
      throw new BadRequestException(
        `Rôle "${role}" inconnu en base (aucune ligne Role correspondante).`,
      );
    }
    return roleRow.id;
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const boutiqueId = dto.boutiqueId ?? null;
    this.assertBoutiqueCoherente(dto.role, boutiqueId);

    const existant = await this.prisma.utilisateur.findUnique({
      where: { login: dto.login },
    });
    if (existant) {
      throw new BadRequestException(
        `Le login "${dto.login}" est déjà utilisé.`,
      );
    }

    if (boutiqueId) {
      const boutique = await this.prisma.boutique.findUnique({
        where: { id: boutiqueId },
      });
      if (!boutique) {
        throw new NotFoundException(`Boutique ${boutiqueId} introuvable.`);
      }
    }

    const roleId = await this.resolveRoleId(dto.role);
    const temporaryPassword = dto.password ?? genererMotDePasseTemporaire();

    const utilisateur = await this.prisma.utilisateur.create({
      data: {
        login: dto.login,
        nom: dto.nom,
        prenom: dto.prenom,
        roleId,
        boutiqueId,
        passwordHash: await AuthService.hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
      select: SELECT_UTILISATEUR,
    });

    await this.audit.record({
      utilisateurId: actor.userId,
      action: 'UTILISATEUR_CREE',
      entite: 'Utilisateur',
      entiteId: utilisateur.id,
      details: JSON.stringify({ login: utilisateur.login, role: dto.role }),
    });

    return { ...utilisateur, temporaryPassword };
  }

  async findAll(query: ListUsersQueryDto) {
    const where: Prisma.UtilisateurWhereInput = {
      ...(query.boutiqueId ? { boutiqueId: query.boutiqueId } : {}),
      ...(query.actif !== undefined ? { actif: query.actif } : {}),
      ...(query.role ? { role: { libelle: query.role } } : {}),
    };

    return this.prisma.utilisateur.findMany({
      where,
      select: SELECT_UTILISATEUR,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
  }

  async findOne(id: string) {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id },
      select: SELECT_UTILISATEUR,
    });
    if (!utilisateur) {
      throw new NotFoundException(`Utilisateur ${id} introuvable.`);
    }
    return utilisateur;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const existant = await this.prisma.utilisateur.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existant) {
      throw new NotFoundException(`Utilisateur ${id} introuvable.`);
    }

    if (id === actor.userId && dto.actif === false) {
      throw new ForbiddenException(
        'Un utilisateur ne peut pas désactiver son propre compte.',
      );
    }

    const roleCible = (dto.role ?? existant.role.libelle) as RoleLibelle;
    const boutiqueCible =
      dto.boutiqueId !== undefined ? dto.boutiqueId : existant.boutiqueId;
    this.assertBoutiqueCoherente(roleCible, boutiqueCible);

    if (boutiqueCible) {
      const boutique = await this.prisma.boutique.findUnique({
        where: { id: boutiqueCible },
      });
      if (!boutique) {
        throw new NotFoundException(`Boutique ${boutiqueCible} introuvable.`);
      }
    }

    const roleId = dto.role ? await this.resolveRoleId(dto.role) : undefined;

    const utilisateur = await this.prisma.utilisateur.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
        ...(dto.prenom !== undefined ? { prenom: dto.prenom } : {}),
        ...(roleId ? { roleId } : {}),
        ...(dto.boutiqueId !== undefined ? { boutiqueId: dto.boutiqueId } : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
      },
      select: SELECT_UTILISATEUR,
    });

    await this.audit.record({
      utilisateurId: actor.userId,
      action:
        dto.actif === false ? 'UTILISATEUR_DESACTIVE' : 'UTILISATEUR_MODIFIE',
      entite: 'Utilisateur',
      entiteId: id,
      details: JSON.stringify(dto),
    });

    return utilisateur;
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: AuthenticatedUser,
  ) {
    const existant = await this.prisma.utilisateur.findUnique({
      where: { id },
    });
    if (!existant) {
      throw new NotFoundException(`Utilisateur ${id} introuvable.`);
    }

    const temporaryPassword = dto.password ?? genererMotDePasseTemporaire();

    await this.prisma.utilisateur.update({
      where: { id },
      data: {
        passwordHash: await AuthService.hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.audit.record({
      utilisateurId: actor.userId,
      action: 'MOT_DE_PASSE_REINITIALISE',
      entite: 'Utilisateur',
      entiteId: id,
    });

    return { temporaryPassword };
  }
}
