import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Zone } from '@prisma/client';
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
import { CreateZoneDto } from './dto/create-zone.dto';

// Service Zone (§3, §4, §6.2 du cahier des charges) : création réservée aux
// profils d'administration structurelle, lecture filtrée au périmètre de
// l'utilisateur (réseau entier / sa zone / sa boutique).
@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateZoneDto, user: AuthenticatedUser): Promise<Zone> {
    const zone = await this.prisma.zone.create({
      data: { nomZone: dto.nomZone },
    });

    await this.audit.record({
      utilisateurId: user.userId,
      action: 'ZONE_CREATED',
      entite: 'Zone',
      entiteId: zone.id,
      details: `nomZone=${zone.nomZone}`,
    });

    return zone;
  }

  async findAll(user: AuthenticatedUser): Promise<Zone[]> {
    if (ROLES_RESEAU_STRUCTURE.includes(user.role)) {
      return this.prisma.zone.findMany({ orderBy: { nomZone: 'asc' } });
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return this.prisma.zone.findMany({ where: { id: zoneId } });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const zoneId = await this.resolveOwnZoneId(user);
      return this.prisma.zone.findMany({ where: { id: zoneId } });
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les zones.`,
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Zone> {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      throw new NotFoundException(`Zone ${id} introuvable.`);
    }

    await this.assertZoneInScope(zone.id, user);
    return zone;
  }

  private async resolveOwnZoneId(user: AuthenticatedUser): Promise<string> {
    const boutiqueId = requireOwnBoutiqueId(user);
    const boutique = await this.prisma.boutique.findUnique({
      where: { id: boutiqueId },
      select: { zoneId: true },
    });
    if (!boutique) {
      throw new ForbiddenException('Boutique de rattachement introuvable.');
    }
    return boutique.zoneId;
  }

  private async assertZoneInScope(
    zoneId: string,
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
      if (scopedZoneId !== zoneId) {
        throw new ForbiddenException(
          "Cette zone n'appartient pas au périmètre de supervision de l'utilisateur.",
        );
      }
      return;
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const ownZoneId = await this.resolveOwnZoneId(user);
      if (ownZoneId !== zoneId) {
        throw new ForbiddenException(
          "Cette zone n'appartient pas au périmètre de la boutique de l'utilisateur.",
        );
      }
      return;
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les zones.`,
    );
  }
}
