import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Caisse } from '@prisma/client';
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
  ) {}

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
