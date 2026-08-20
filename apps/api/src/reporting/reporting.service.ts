import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  Prisma,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_LECTURE_CAISSES,
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import { CaisseBalanceService } from '../caisses/caisse-balance.service';
import { CaissesService } from '../caisses/caisses.service';
import { PrismaService } from '../prisma/prisma.service';

// Reporting consolidé — §6.3.4 / §6.7 du cahier des charges.
// Agrégations réelles (zéro mock), filtrées au périmètre du profil.

export type PerimetreReporting = 'RESEAU' | 'ZONE' | 'BOUTIQUE';

export interface ReportingDashboardDto {
  perimetre: PerimetreReporting;
  genereAt: string;
  chiffreAffaires: {
    total: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      montant: string;
    }>;
  };
  versements: {
    parStatut: Array<{
      statut: StatutTransaction;
      nombre: number;
      montant: string;
    }>;
    enRetard24h: number;
  };
  ecarts: {
    nombreLitiges: number;
    montantEcartsAbsolus: string;
  };
  tresorerie: {
    totalSoldesAuxiliaires: string;
    caisses: Array<{
      caisseId: string;
      type: TypeCaisse;
      boutiqueId: string | null;
      solde: string;
    }>;
  };
  crm: {
    nombreClients: number;
    parSegment: Array<{ segment: string; nombre: number }>;
  };
}

const money = (value: Prisma.Decimal) => value.toFixed(2);
const zero = () => new Prisma.Decimal(0);

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caissesService: CaissesService,
    private readonly caisseBalanceService: CaisseBalanceService,
  ) {}

  async getDashboard(user: AuthenticatedUser): Promise<ReportingDashboardDto> {
    if (!ROLES_LECTURE_CAISSES.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user.role}" non habilité à consulter le reporting trésorerie.`,
      );
    }

    const perimetre = this.resolvePerimetre(user);
    const caisses = await this.caissesService.findAll(user);
    const caisseIds = caisses.map((c) => c.id);
    const boutiqueIds = [
      ...new Set(
        caisses
          .map((c) => c.boutiqueId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];

    const [chiffreAffaires, versements, ecarts, tresorerie, crm] =
      await Promise.all([
        this.aggreguerChiffreAffaires(caisseIds),
        this.aggreguerVersements(caisseIds),
        this.aggreguerEcarts(caisseIds),
        this.aggreguerTresorerie(caisses),
        this.aggreguerCrm(boutiqueIds, perimetre),
      ]);

    return {
      perimetre,
      genereAt: new Date().toISOString(),
      chiffreAffaires,
      versements,
      ecarts,
      tresorerie,
      crm,
    };
  }

  private resolvePerimetre(user: AuthenticatedUser): PerimetreReporting {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) return 'RESEAU';
    if (user.role === ROLE_SUPERVISEUR_ZONE) return 'ZONE';
    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) return 'BOUTIQUE';
    return 'RESEAU';
  }

  private async aggreguerChiffreAffaires(
    caisseIds: string[],
  ): Promise<ReportingDashboardDto['chiffreAffaires']> {
    if (caisseIds.length === 0) {
      return { total: '0.00', parBoutique: [] };
    }

    const ventes = await this.prisma.vente.groupBy({
      by: ['caisseId'],
      where: { caisseId: { in: caisseIds } },
      _sum: { montantTotal: true },
    });

    const caissesMeta = await this.prisma.caisse.findMany({
      where: { id: { in: caisseIds } },
      include: { boutique: { select: { id: true, nom: true } } },
    });
    const caisseById = new Map(caissesMeta.map((c) => [c.id, c]));

    const parBoutiqueMap = new Map<
      string,
      { boutiqueId: string; nomBoutique: string; montant: Prisma.Decimal }
    >();
    let total = zero();

    for (const row of ventes) {
      const montant = row._sum.montantTotal ?? zero();
      total = total.plus(montant);
      const caisse = caisseById.get(row.caisseId);
      if (!caisse?.boutiqueId || !caisse.boutique) continue;
      const prev = parBoutiqueMap.get(caisse.boutiqueId);
      if (prev) {
        prev.montant = prev.montant.plus(montant);
      } else {
        parBoutiqueMap.set(caisse.boutiqueId, {
          boutiqueId: caisse.boutiqueId,
          nomBoutique: caisse.boutique.nom,
          montant,
        });
      }
    }

    return {
      total: money(total),
      parBoutique: [...parBoutiqueMap.values()]
        .map((b) => ({
          boutiqueId: b.boutiqueId,
          nomBoutique: b.nomBoutique,
          montant: money(b.montant),
        }))
        .sort((a, b) => a.nomBoutique.localeCompare(b.nomBoutique)),
    };
  }

  private async aggreguerVersements(
    caisseIds: string[],
  ): Promise<ReportingDashboardDto['versements']> {
    const allStatuts = Object.values(StatutTransaction);
    if (caisseIds.length === 0) {
      return {
        parStatut: allStatuts.map((statut) => ({
          statut,
          nombre: 0,
          montant: '0.00',
        })),
        enRetard24h: 0,
      };
    }

    const grouped = await this.prisma.transactionCaisse.groupBy({
      by: ['statut'],
      where: {
        caisseId: { in: caisseIds },
        type: TypeTransaction.SORTIE_FONDS,
      },
      _count: { _all: true },
      _sum: { montant: true },
    });

    const byStatut = new Map(
      grouped.map((g) => [
        g.statut,
        { nombre: g._count._all, montant: g._sum.montant ?? zero() },
      ]),
    );

    // Transmission ≤ 24 h (§5.1) — approximation 24 h calendaires.
    const seuilRetard = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const enRetard24h = await this.prisma.transactionCaisse.count({
      where: {
        caisseId: { in: caisseIds },
        type: TypeTransaction.SORTIE_FONDS,
        statut: {
          in: [StatutTransaction.INITIEE, StatutTransaction.EN_TRANSIT],
        },
        dateHeure: { lt: seuilRetard },
      },
    });

    return {
      parStatut: allStatuts.map((statut) => {
        const row = byStatut.get(statut);
        return {
          statut,
          nombre: row?.nombre ?? 0,
          montant: money(row?.montant ?? zero()),
        };
      }),
      enRetard24h,
    };
  }

  private async aggreguerEcarts(
    caisseIds: string[],
  ): Promise<ReportingDashboardDto['ecarts']> {
    if (caisseIds.length === 0) {
      return { nombreLitiges: 0, montantEcartsAbsolus: '0.00' };
    }

    const litiges = await this.prisma.transactionCaisse.findMany({
      where: {
        caisseId: { in: caisseIds },
        type: TypeTransaction.SORTIE_FONDS,
        statut: StatutTransaction.LITIGE,
      },
      select: {
        bordereau: {
          select: {
            reception: { select: { ecart: true } },
          },
        },
      },
    });

    let montantEcarts = zero();
    for (const t of litiges) {
      const ecart = t.bordereau?.reception?.ecart;
      if (ecart) {
        montantEcarts = montantEcarts.plus(ecart.abs());
      }
    }

    return {
      nombreLitiges: litiges.length,
      montantEcartsAbsolus: money(montantEcarts),
    };
  }

  private async aggreguerTresorerie(
    caisses: Array<{ id: string; type: TypeCaisse; boutiqueId: string | null }>,
  ): Promise<ReportingDashboardDto['tresorerie']> {
    const lignes = await Promise.all(
      caisses.map(async (caisse) => ({
        caisseId: caisse.id,
        type: caisse.type,
        boutiqueId: caisse.boutiqueId,
        solde: await this.caisseBalanceService.calculerSolde(caisse.id),
      })),
    );

    const totalSoldesAuxiliaires = lignes
      .filter((l) => l.type === TypeCaisse.AUXILIAIRE)
      .reduce((acc, l) => acc.plus(l.solde), zero());

    return {
      totalSoldesAuxiliaires: money(totalSoldesAuxiliaires),
      caisses: lignes.map((l) => ({
        caisseId: l.caisseId,
        type: l.type,
        boutiqueId: l.boutiqueId,
        solde: money(l.solde),
      })),
    };
  }

  private async aggreguerCrm(
    boutiqueIds: string[],
    perimetre: PerimetreReporting,
  ): Promise<ReportingDashboardDto['crm']> {
    if (perimetre === 'RESEAU') {
      const grouped = await this.prisma.client.groupBy({
        by: ['segment'],
        _count: { _all: true },
      });
      return {
        nombreClients: grouped.reduce((n, g) => n + g._count._all, 0),
        parSegment: grouped
          .map((g) => ({ segment: g.segment, nombre: g._count._all }))
          .sort((a, b) => a.segment.localeCompare(b.segment)),
      };
    }

    if (boutiqueIds.length === 0) {
      return { nombreClients: 0, parSegment: [] };
    }

    const clients = await this.prisma.client.findMany({
      where: {
        ventes: {
          some: { caisse: { boutiqueId: { in: boutiqueIds } } },
        },
      },
      select: { segment: true },
    });

    const counts = new Map<string, number>();
    for (const c of clients) {
      counts.set(c.segment, (counts.get(c.segment) ?? 0) + 1);
    }

    return {
      nombreClients: clients.length,
      parSegment: [...counts.entries()]
        .map(([segment, nombre]) => ({ segment, nombre }))
        .sort((a, b) => a.segment.localeCompare(b.segment)),
    };
  }
}
