import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Entrepot } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_STRUCTURE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { CreateEntrepotDto } from './dto/create-entrepot.dto';
import { UpdateEntrepotDto } from './dto/update-entrepot.dto';

@Injectable()
export class EntrepotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateEntrepotDto,
    user: AuthenticatedUser,
  ): Promise<Entrepot> {
    const boutique = await this.prisma.boutique.findUnique({
      where: { id: dto.boutiqueId },
    });
    if (!boutique) {
      throw new BadRequestException(`Boutique ${dto.boutiqueId} introuvable.`);
    }
    await this.assertBoutiqueInScope(boutique.id, boutique.zoneId, user);

    let entrepot: Entrepot;
    try {
      entrepot = await this.prisma.entrepot.create({
        data: {
          nom: dto.nom,
          code: dto.code,
          boutiqueId: dto.boutiqueId,
          type: dto.type ?? 'SECONDAIRE',
          usage: dto.usage ?? 'STOCK',
          reseau: dto.reseau ?? false,
          virtuel: dto.virtuel ?? false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Un entrepôt avec le code "${dto.code}" existe déjà pour cette boutique.`,
        );
      }
      throw error;
    }
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'ENTREPOT_CREATED',
      entite: 'Entrepot',
      entiteId: entrepot.id,
      details: `code=${entrepot.code};boutiqueId=${entrepot.boutiqueId}`,
    });
    return entrepot;
  }

  async findAll(user: AuthenticatedUser, boutiqueId?: string) {
    const where = await this.scopeWhere(user, boutiqueId);
    return this.prisma.entrepot.findMany({
      where,
      include: { boutique: { select: { id: true, nom: true } } },
      orderBy: [{ boutique: { nom: 'asc' } }, { nom: 'asc' }],
    });
  }

  async update(
    id: string,
    dto: UpdateEntrepotDto,
    user: AuthenticatedUser,
  ): Promise<Entrepot> {
    const entrepot = await this.prisma.entrepot.findUnique({
      where: { id },
      include: { boutique: true },
    });
    if (!entrepot) throw new NotFoundException(`Entrepôt ${id} introuvable.`);
    await this.assertBoutiqueInScope(
      entrepot.boutiqueId,
      entrepot.boutique.zoneId,
      user,
    );
    const updated = await this.prisma.entrepot.update({
      where: { id },
      data: dto,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'ENTREPOT_UPDATED',
      entite: 'Entrepot',
      entiteId: id,
      details: JSON.stringify(dto),
    });
    return updated;
  }

  private async scopeWhere(
    user: AuthenticatedUser,
    boutiqueId?: string,
  ): Promise<object> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return boutiqueId ? { boutiqueId } : {};
    }
    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return {
        boutique: { zoneId, ...(boutiqueId ? { id: boutiqueId } : {}) },
      };
    }
    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const own = requireOwnBoutiqueId(user);
      if (boutiqueId && boutiqueId !== own) {
        throw new ForbiddenException('Boutique hors périmètre.');
      }
      return { boutiqueId: own };
    }
    throw new ForbiddenException('Rôle non habilité sur les entrepôts.');
  }

  private async assertBoutiqueInScope(
    boutiqueId: string,
    zoneId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) return;
    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const scoped = await resolveZoneScopeForSuperviseur(this.prisma, user);
      if (scoped !== zoneId) {
        throw new ForbiddenException('Boutique hors zone de supervision.');
      }
      return;
    }
    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      if (requireOwnBoutiqueId(user) !== boutiqueId) {
        throw new ForbiddenException('Boutique hors périmètre.');
      }
      return;
    }
    throw new ForbiddenException('Rôle non habilité.');
  }
}
