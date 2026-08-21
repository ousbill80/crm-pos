import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Caisse, TransactionCaisse } from '@prisma/client';
import { StatutTransaction, TypeCaisse } from '@prisma/client';
import { ROLES_CONFIG_TIROIRS } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_ADMIN_STRUCTURE,
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from './access-scope.constants';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import { CaisseBalanceService } from './caisse-balance.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCaisseDto,
  CreateTiroirDto,
  UpdateTiroirDto,
} from './dto/create-caisse.dto';

type CaisseAvecBoutique = Caisse & { boutique: { zoneId: string } | null };

@Injectable()
export class CaissesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caisseBalanceService: CaisseBalanceService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCaisseDto, user: AuthenticatedUser) {
    if (!ROLES_ADMIN_STRUCTURE.includes(user.role)) {
      throw new ForbiddenException(
        "Création de caisse réservée à l'admin structure.",
      );
    }
    if (dto.type === TypeCaisse.CENTRALE) {
      throw new BadRequestException(
        'La caisse CENTRALE unique ne se provisionne pas via cet endpoint.',
      );
    }
    if (dto.type === TypeCaisse.TIROIR) {
      throw new BadRequestException(
        'Les tiroirs se créent via POST /caisses/tiroirs (DAF).',
      );
    }
    if (!dto.boutiqueId) {
      throw new BadRequestException(
        'boutiqueId obligatoire pour une caisse MAGASIN.',
      );
    }
    const boutique = await this.prisma.boutique.findUnique({
      where: { id: dto.boutiqueId },
    });
    if (!boutique) {
      throw new BadRequestException(`Boutique ${dto.boutiqueId} introuvable.`);
    }
    const existante = await this.prisma.caisse.findFirst({
      where: { boutiqueId: dto.boutiqueId, type: TypeCaisse.MAGASIN },
    });
    if (existante) {
      throw new BadRequestException(
        'Cette boutique a déjà une caisse MAGASIN.',
      );
    }
    const caisse = await this.prisma.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId: dto.boutiqueId,
        libelle: dto.libelle ?? `Caisse magasin — ${boutique.nom}`,
      },
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'CAISSE_CREATED',
      entite: 'Caisse',
      entiteId: caisse.id,
      details: `type=${caisse.type};boutiqueId=${caisse.boutiqueId}`,
    });
    return caisse;
  }

  async createTiroir(dto: CreateTiroirDto, user: AuthenticatedUser) {
    if (!ROLES_CONFIG_TIROIRS.includes(user.role)) {
      throw new ForbiddenException(
        'Configuration des tiroirs réservée au DAF.',
      );
    }
    const boutique = await this.prisma.boutique.findUnique({
      where: { id: dto.boutiqueId },
    });
    if (!boutique) {
      throw new NotFoundException(`Boutique ${dto.boutiqueId} introuvable.`);
    }
    const magasin = await this.prisma.caisse.findFirst({
      where: { boutiqueId: dto.boutiqueId, type: TypeCaisse.MAGASIN },
    });
    if (!magasin) {
      throw new BadRequestException(
        'Créez d’abord une caisse MAGASIN pour cette boutique.',
      );
    }
    const code = dto.code.trim().toUpperCase();
    const existant = await this.prisma.caisse.findFirst({
      where: { boutiqueId: dto.boutiqueId, code },
    });
    if (existant) {
      throw new BadRequestException(
        `Le code tiroir « ${code} » existe déjà pour cette boutique.`,
      );
    }
    const tiroir = await this.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId: dto.boutiqueId,
        code,
        libelle: dto.libelle.trim(),
        actif: true,
        ordreAffichage: dto.ordreAffichage ?? 0,
      },
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'TIROIR_CREATED',
      entite: 'Caisse',
      entiteId: tiroir.id,
      details: JSON.stringify({
        boutiqueId: dto.boutiqueId,
        code,
        libelle: tiroir.libelle,
      }),
    });
    return tiroir;
  }

  async updateTiroir(
    id: string,
    dto: UpdateTiroirDto,
    user: AuthenticatedUser,
  ) {
    if (!ROLES_CONFIG_TIROIRS.includes(user.role)) {
      throw new ForbiddenException(
        'Configuration des tiroirs réservée au DAF.',
      );
    }
    const tiroir = await this.prisma.caisse.findUnique({ where: { id } });
    if (!tiroir || tiroir.type !== TypeCaisse.TIROIR) {
      throw new NotFoundException('Tiroir introuvable.');
    }
    if (dto.actif === false) {
      const sessionOuverte = await this.prisma.sessionCaisse.findFirst({
        where: { caisseId: id, statut: 'OUVERTE' },
      });
      if (sessionOuverte) {
        throw new BadRequestException(
          'Impossible de désactiver un tiroir avec une session ouverte.',
        );
      }
    }
    const updated = await this.prisma.caisse.update({
      where: { id },
      data: {
        ...(dto.libelle !== undefined ? { libelle: dto.libelle.trim() } : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
        ...(dto.ordreAffichage !== undefined
          ? { ordreAffichage: dto.ordreAffichage }
          : {}),
      },
    });
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'TIROIR_UPDATED',
      entite: 'Caisse',
      entiteId: id,
      details: JSON.stringify(dto),
    });
    return updated;
  }

  async findAll(user: AuthenticatedUser): Promise<Caisse[]> {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) {
      return this.prisma.caisse.findMany({
        orderBy: [{ boutiqueId: 'asc' }, { ordreAffichage: 'asc' }],
      });
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return this.prisma.caisse.findMany({
        where: { boutique: { zoneId } },
        orderBy: [{ boutiqueId: 'asc' }, { ordreAffichage: 'asc' }],
      });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      return this.prisma.caisse.findMany({
        where: { boutiqueId },
        orderBy: [{ ordreAffichage: 'asc' }],
      });
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les caisses.`,
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Caisse> {
    const caisse = await this.prisma.caisse.findUnique({
      where: { id },
      include: { boutique: { select: { zoneId: true } } },
    });
    if (!caisse) {
      throw new NotFoundException(`Caisse ${id} introuvable.`);
    }

    await this.assertCaisseInScope(caisse, user);
    return caisse;
  }

  async getSolde(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ caisseId: string; solde: string }> {
    await this.findOne(id, user);
    const solde = await this.caisseBalanceService.calculerSolde(id);
    return { caisseId: id, solde: solde.toFixed(2) };
  }

  async getMouvements(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TransactionCaisse[]> {
    await this.findOne(id, user);
    return this.prisma.transactionCaisse.findMany({
      where: { caisseId: id, statut: StatutTransaction.VALIDEE },
      orderBy: { dateHeure: 'desc' },
      take: 200,
    });
  }

  private async assertCaisseInScope(
    caisse: CaisseAvecBoutique,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) {
      return;
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      if (!caisse.boutique) {
        throw new ForbiddenException(
          "Cette caisse n'appartient pas au périmètre de supervision de l'utilisateur.",
        );
      }
      const scopedZoneId = await resolveZoneScopeForSuperviseur(
        this.prisma,
        user,
      );
      if (scopedZoneId !== caisse.boutique.zoneId) {
        throw new ForbiddenException(
          "Cette caisse n'appartient pas au périmètre de supervision de l'utilisateur.",
        );
      }
      return;
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      if (caisse.boutiqueId !== boutiqueId) {
        throw new ForbiddenException(
          "Cette caisse n'est pas rattachée à la boutique de l'utilisateur.",
        );
      }
      return;
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" non habilité à consulter les caisses.`,
    );
  }
}
