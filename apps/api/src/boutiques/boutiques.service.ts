import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Boutique } from '@prisma/client';
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
} from './boutique-scope.util';
import { CreateBoutiqueDto } from './dto/create-boutique.dto';
import { UpdateBoutiqueDto } from './dto/update-boutique.dto';

// Service Boutique (§3, §4, §6.2 du cahier des charges) : création réservée
// aux profils d'administration structurelle, lecture filtrée au périmètre de
// l'utilisateur (réseau entier / sa zone / sa boutique).
@Injectable()
export class BoutiquesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateBoutiqueDto,
    user: AuthenticatedUser,
  ): Promise<Boutique> {
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new BadRequestException(`Zone ${dto.zoneId} introuvable.`);
    }

    const boutique = await this.prisma.$transaction(async (tx) => {
      const created = await tx.boutique.create({
        data: { nom: dto.nom, adresse: dto.adresse, zoneId: dto.zoneId },
      });
      await tx.entrepot.create({
        data: {
          nom: `Principal — ${created.nom}`,
          code: 'PRINCIPAL',
          type: 'PRINCIPAL',
          boutiqueId: created.id,
        },
      });
      return created;
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BOUTIQUE_CREATED',
      entite: 'Boutique',
      entiteId: boutique.id,
      details: `nom=${boutique.nom};zoneId=${boutique.zoneId}`,
    });

    return boutique;
  }

  async findAll(user: AuthenticatedUser): Promise<Boutique[]> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return this.prisma.boutique.findMany({ orderBy: { nom: 'asc' } });
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return this.prisma.boutique.findMany({
        where: { zoneId },
        orderBy: { nom: 'asc' },
      });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      return this.prisma.boutique.findMany({ where: { id: boutiqueId } });
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les boutiques.`,
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Boutique> {
    const boutique = await this.prisma.boutique.findUnique({ where: { id } });
    if (!boutique) {
      throw new NotFoundException(`Boutique ${id} introuvable.`);
    }

    await this.assertBoutiqueInScope(boutique, user);
    return boutique;
  }

  async update(
    id: string,
    dto: UpdateBoutiqueDto,
    user: AuthenticatedUser,
  ): Promise<Boutique> {
    const boutique = await this.findOne(id, user);
    const updated = await this.prisma.boutique.update({
      where: { id: boutique.id },
      data: dto,
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'BOUTIQUE_UPDATED',
      entite: 'Boutique',
      entiteId: updated.id,
      details: JSON.stringify(dto),
    });
    return updated;
  }

  private async assertBoutiqueInScope(
    boutique: Boutique,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return;
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const scopedZoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        user,
      );
      if (scopedZoneId !== boutique.zoneId) {
        throw new ForbiddenException(
          "Cette boutique n'appartient pas au périmètre de supervision de l'utilisateur.",
        );
      }
      return;
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      if (boutiqueId !== boutique.id) {
        throw new ForbiddenException(
          "Cette boutique n'est pas la boutique de rattachement de l'utilisateur.",
        );
      }
      return;
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les boutiques.`,
    );
  }
}
