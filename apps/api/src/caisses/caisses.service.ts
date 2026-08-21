import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Caisse, TransactionCaisse } from '@prisma/client';
import { StatutTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types';
import {
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
import { CreateCaisseDto } from './dto/create-caisse.dto';
import { ROLES_ADMIN_STRUCTURE } from './access-scope.constants';

type CaisseAvecBoutique = Caisse & { boutique: { zoneId: string } | null };

// Service Caisse (§6.3.1, §6.2) : lecture filtrée au périmètre de
// l'utilisateur (réseau entier trésorerie / sa zone / sa boutique). Le
// solde n'est jamais lu depuis Caisse.soldeCourant ici — voir
// CaisseBalanceService, seule source de vérité (grand livre append-only).
@Injectable()
export class CaissesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caisseBalanceService: CaisseBalanceService,
    private readonly audit: AuditService,
  ) {}


  async create(dto: CreateCaisseDto, user: AuthenticatedUser) {
    if (!ROLES_ADMIN_STRUCTURE.includes(user.role)) {
      throw new ForbiddenException('Création de caisse réservée à l\'admin structure.');
    }
    if (dto.type === 'CENTRALE') {
      throw new BadRequestException(
        'La caisse CENTRALE unique ne se provisionne pas via cet endpoint.',
      );
    }
    if (dto.type === 'AUXILIAIRE' && !dto.boutiqueId) {
      throw new BadRequestException('boutiqueId obligatoire pour une caisse AUXILIAIRE.');
    }
    const boutique = await this.prisma.boutique.findUnique({
      where: { id: dto.boutiqueId },
    });
    if (!boutique) {
      throw new BadRequestException(`Boutique ${dto.boutiqueId} introuvable.`);
    }
    const caisse = await this.prisma.caisse.create({
      data: { type: dto.type, boutiqueId: dto.boutiqueId },
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

  async findAll(user: AuthenticatedUser): Promise<Caisse[]> {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) {
      return this.prisma.caisse.findMany();
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      // Les caisses CENTRALE (boutiqueId null) n'appartiennent à aucune
      // zone : un superviseur de zone ne les voit pas ici, seules les
      // caisses AUXILIAIRE des boutiques de sa zone sont dans son périmètre.
      return this.prisma.caisse.findMany({
        where: { boutique: { zoneId } },
      });
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      return this.prisma.caisse.findMany({ where: { boutiqueId } });
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
    // Réutilise la même vérification de périmètre que findOne() (404 si la
    // caisse n'existe pas, 403 si hors périmètre) avant tout calcul.
    await this.findOne(id, user);
    const solde = await this.caisseBalanceService.calculerSolde(id);
    return { caisseId: id, solde: solde.toFixed(2) };
  }

  // Grand livre lecture seule : mouvements VALIDEE de la caisse (jamais
  // le cache soldeCourant).
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
        // Caisse CENTRALE : hors périmètre d'un superviseur de zone.
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
