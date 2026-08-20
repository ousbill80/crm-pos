import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  Prisma,
  StatutTransaction,
  TypeTransaction,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import {
  requireOwnBoutiqueId,
  resolveZoneScopeForSuperviseur,
} from '../boutiques/boutique-scope.util';
import {
  ROLES_LECTURE_CAISSES,
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import { PrismaService } from '../prisma/prisma.service';

// Alertes automatiques — §6.7 :
// écart de caisse, versement non transmis sous 24 h, accès non autorisé.

export type TypeAlerte =
  | 'ECART_CAISSE'
  | 'VERSEMENT_EN_RETARD'
  | 'ACCES_REFUSE';

export interface AlerteDto {
  type: TypeAlerte;
  severite: 'WARNING' | 'CRITICAL';
  message: string;
  dateHeure: string;
  entite: string;
  entiteId: string;
  details?: Record<string, unknown>;
}

const DELAI_VERSEMENT_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AlertesService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(user: AuthenticatedUser): Promise<AlerteDto[]> {
    if (!ROLES_LECTURE_CAISSES.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user.role}" non habilité à consulter les alertes trésorerie.`,
      );
    }

    const caisseFilter = await this.resolveCaisseFilter(user);
    const [ecarts, retards, acces] = await Promise.all([
      this.alertesEcarts(caisseFilter),
      this.alertesRetards(caisseFilter),
      this.alertesAccesRefuses(user),
    ]);

    return [...ecarts, ...retards, ...acces].sort(
      (a, b) =>
        new Date(b.dateHeure).getTime() - new Date(a.dateHeure).getTime(),
    );
  }

  private async resolveCaisseFilter(
    user: AuthenticatedUser,
  ): Promise<Prisma.CaisseWhereInput | undefined> {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) {
      return undefined;
    }

    if (user.role === ROLE_SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      return { boutique: { zoneId } };
    }

    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) {
      const boutiqueId = requireOwnBoutiqueId(user);
      return { boutiqueId };
    }

    throw new ForbiddenException(
      `Rôle "${user.role}" sans périmètre alertes défini.`,
    );
  }

  private async alertesEcarts(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
  ): Promise<AlerteDto[]> {
    const litiges = await this.prisma.transactionCaisse.findMany({
      where: {
        type: TypeTransaction.SORTIE_FONDS,
        statut: StatutTransaction.LITIGE,
        ...(caisseFilter ? { caisse: caisseFilter } : {}),
      },
      include: {
        caisse: { include: { boutique: { select: { nom: true } } } },
        bordereau: {
          include: {
            reception: { select: { ecart: true, montantRecu: true } },
          },
        },
      },
      orderBy: { dateHeure: 'desc' },
      take: 100,
    });

    return litiges.map((t) => {
      const boutique = t.caisse.boutique?.nom ?? 'inconnue';
      const ecart = t.bordereau?.reception?.ecart;
      return {
        type: 'ECART_CAISSE' as const,
        severite: 'CRITICAL' as const,
        message: `Écart de caisse constaté (${boutique}) — transaction en litige`,
        dateHeure: t.dateHeure.toISOString(),
        entite: 'TransactionCaisse',
        entiteId: t.id,
        details: {
          montant: t.montant.toFixed(2),
          ecart: ecart?.toFixed(2) ?? null,
          montantRecu:
            t.bordereau?.reception?.montantRecu?.toFixed(2) ?? null,
          boutiqueId: t.caisse.boutiqueId,
        },
      };
    });
  }

  private async alertesRetards(
    caisseFilter: Prisma.CaisseWhereInput | undefined,
  ): Promise<AlerteDto[]> {
    const seuil = new Date(Date.now() - DELAI_VERSEMENT_MS);
    const retards = await this.prisma.transactionCaisse.findMany({
      where: {
        type: TypeTransaction.SORTIE_FONDS,
        statut: {
          in: [StatutTransaction.INITIEE, StatutTransaction.EN_TRANSIT],
        },
        dateHeure: { lt: seuil },
        ...(caisseFilter ? { caisse: caisseFilter } : {}),
      },
      include: {
        caisse: { include: { boutique: { select: { nom: true } } } },
      },
      orderBy: { dateHeure: 'asc' },
      take: 100,
    });

    return retards.map((t) => {
      const boutique = t.caisse.boutique?.nom ?? 'inconnue';
      const ageH = Math.floor(
        (Date.now() - t.dateHeure.getTime()) / (60 * 60 * 1000),
      );
      return {
        type: 'VERSEMENT_EN_RETARD' as const,
        severite: 'WARNING' as const,
        message: `Versement non transmis dans le délai (24 h) — ${boutique}, statut ${t.statut}, âgé de ${ageH} h`,
        dateHeure: t.dateHeure.toISOString(),
        entite: 'TransactionCaisse',
        entiteId: t.id,
        details: {
          montant: t.montant.toFixed(2),
          statut: t.statut,
          ageHeures: ageH,
          boutiqueId: t.caisse.boutiqueId,
        },
      };
    });
  }

  private async alertesAccesRefuses(
    user: AuthenticatedUser,
  ): Promise<AlerteDto[]> {
    if (!ROLES_RESEAU_TRESORERIE.includes(user.role)) {
      return [];
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.journalAudit.findMany({
      where: {
        action: 'ACCES_REFUSE',
        dateHeure: { gte: since },
      },
      include: {
        utilisateur: {
          select: { login: true, role: { select: { libelle: true } } },
        },
      },
      orderBy: { dateHeure: 'desc' },
      take: 100,
    });

    return rows.map((r) => {
      let parsed: Record<string, unknown> | undefined;
      if (r.details) {
        try {
          parsed = JSON.parse(r.details) as Record<string, unknown>;
        } catch {
          parsed = { raw: r.details };
        }
      }
      return {
        type: 'ACCES_REFUSE' as const,
        severite: 'WARNING' as const,
        message: `Tentative d'accès non autorisée — ${r.utilisateur.login} (${r.utilisateur.role.libelle})`,
        dateHeure: r.dateHeure.toISOString(),
        entite: r.entite,
        entiteId: r.entiteId,
        details: {
          utilisateurId: r.utilisateurId,
          login: r.utilisateur.login,
          role: r.utilisateur.role.libelle,
          ...parsed,
        },
      };
    });
  }
}
