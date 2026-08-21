import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ModePaiement,
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
import { toCsv } from '../common/csv.util';

export interface PeriodeFiltre {
  dateFrom?: string;
  dateTo?: string;
}

function periodeWhere(
  periode?: PeriodeFiltre,
): Prisma.DateTimeFilter | undefined {
  if (!periode?.dateFrom && !periode?.dateTo) return undefined;
  return {
    ...(periode.dateFrom ? { gte: new Date(periode.dateFrom) } : {}),
    ...(periode.dateTo ? { lte: new Date(periode.dateTo) } : {}),
  };
}

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
    parModePaiement: Array<{ modePaiement: ModePaiement; montant: string }>;
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
  rentabiliteParBoutique: Array<{
    boutiqueId: string;
    nomBoutique: string;
    chiffreAffairesNet: string;
    coutDesVentes: string;
    margeBrute: string;
    tauxMarge: string;
    valeurStock: string;
  }>;
}

export type AgeingBucket = '0_24h' | '24_48h' | '48_72h' | 'plus_72h';

// Pilotage Agicap-like — lecture pure, projections indicatives (pas d'écriture).
export interface TresoreriePilotageDto {
  position: {
    soldeAuxiliaires: string;
    soldeCentrale: string;
    cashConseille: string;
    versementsEnCours: string;
  };
  ageing: Array<{
    bucket: AgeingBucket;
    nombre: number;
    montant: string;
  }>;
  courbe: Array<{
    jourOffset: number;
    date: string;
    cashBase: string;
    cashHaut: string;
    cashBas: string;
  }>;
  meta: {
    moyenneCaJournalier30j: string;
    methode: 'MOYENNE_CA_30J';
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

  async getDashboard(
    user: AuthenticatedUser,
    periode?: PeriodeFiltre,
  ): Promise<ReportingDashboardDto> {
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

    const [
      chiffreAffaires,
      versements,
      ecarts,
      tresorerie,
      crm,
      rentabiliteParBoutique,
    ] = await Promise.all([
      this.aggreguerChiffreAffaires(caisseIds, periode),
      this.aggreguerVersements(caisseIds),
      this.aggreguerEcarts(caisseIds),
      this.aggreguerTresorerie(caisses),
      this.aggreguerCrm(boutiqueIds, perimetre),
      this.aggreguerRentabiliteParBoutique(caisseIds, boutiqueIds, periode),
    ]);

    return {
      perimetre,
      genereAt: new Date().toISOString(),
      chiffreAffaires,
      versements,
      ecarts,
      tresorerie,
      crm,
      rentabiliteParBoutique,
    };
  }

  // Cash position + ageing + courbe 30 j (patterns Agicap / Kyriba).
  // Projections = moyenne CA 30 j × horizon — indicatives, jamais écrites.
  async getTresoreriePilotage(
    user: AuthenticatedUser,
  ): Promise<TresoreriePilotageDto> {
    if (!ROLES_LECTURE_CAISSES.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user.role}" non habilité à consulter le reporting trésorerie.`,
      );
    }

    const caisses = await this.caissesService.findAll(user);
    const caisseIds = caisses.map((c) => c.id);
    const tresorerie = await this.aggreguerTresorerie(caisses);

    let soldeAuxiliaires = zero();
    let soldeCentrale = zero();
    for (const c of tresorerie.caisses) {
      const solde = new Prisma.Decimal(c.solde);
      if (c.type === TypeCaisse.MAGASIN || c.type === TypeCaisse.TIROIR) {
        soldeAuxiliaires = soldeAuxiliaires.plus(solde);
      } else if (c.type === TypeCaisse.CENTRALE) {
        soldeCentrale = soldeCentrale.plus(solde);
      }
    }
    const cashConseille = soldeAuxiliaires.plus(soldeCentrale);

    const enCoursStatuts: StatutTransaction[] = [
      StatutTransaction.INITIEE,
      StatutTransaction.EN_TRANSIT,
      StatutTransaction.RECEPTIONNEE,
    ];

    const enCours =
      caisseIds.length === 0
        ? []
        : await this.prisma.transactionCaisse.findMany({
            where: {
              caisseId: { in: caisseIds },
              statut: { in: enCoursStatuts },
            },
            select: { montant: true, dateHeure: true },
          });

    let versementsEnCours = zero();
    const buckets: Record<
      AgeingBucket,
      { nombre: number; montant: Prisma.Decimal }
    > = {
      '0_24h': { nombre: 0, montant: zero() },
      '24_48h': { nombre: 0, montant: zero() },
      '48_72h': { nombre: 0, montant: zero() },
      plus_72h: { nombre: 0, montant: zero() },
    };
    const now = Date.now();
    const H = 60 * 60 * 1000;
    for (const t of enCours) {
      versementsEnCours = versementsEnCours.plus(t.montant);
      const ageH = (now - t.dateHeure.getTime()) / H;
      let bucket: AgeingBucket;
      if (ageH < 24) bucket = '0_24h';
      else if (ageH < 48) bucket = '24_48h';
      else if (ageH < 72) bucket = '48_72h';
      else bucket = 'plus_72h';
      buckets[bucket].nombre += 1;
      buckets[bucket].montant = buckets[bucket].montant.plus(t.montant);
    }

    const depuis = new Date();
    depuis.setHours(0, 0, 0, 0);
    depuis.setDate(depuis.getDate() - 29);
    const ventes =
      caisseIds.length === 0
        ? []
        : await this.prisma.vente.findMany({
            where: {
              caisseId: { in: caisseIds },
              dateVente: { gte: depuis },
            },
            select: { montantTotal: true },
          });
    const totalCa30j = ventes.reduce(
      (acc, v) => acc.plus(v.montantTotal),
      zero(),
    );
    const moyenneCa = totalCa30j.div(30);

    const courbe: TresoreriePilotageDto['courbe'] = [];
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    for (let d = 0; d <= 30; d++) {
      const jour = new Date(aujourdhui);
      jour.setDate(aujourdhui.getDate() + d);
      const pente = moyenneCa.mul(d);
      const cashBase = cashConseille.plus(pente);
      const cashHaut = cashConseille.plus(pente.mul(1.1));
      const cashBas = cashConseille.plus(pente.mul(0.9));
      courbe.push({
        jourOffset: d,
        date: jour.toISOString().slice(0, 10),
        cashBase: money(cashBase),
        cashHaut: money(cashHaut),
        cashBas: money(cashBas),
      });
    }

    return {
      position: {
        soldeAuxiliaires: money(soldeAuxiliaires),
        soldeCentrale: money(soldeCentrale),
        cashConseille: money(cashConseille),
        versementsEnCours: money(versementsEnCours),
      },
      ageing: (['0_24h', '24_48h', '48_72h', 'plus_72h'] as AgeingBucket[]).map(
        (bucket) => ({
          bucket,
          nombre: buckets[bucket].nombre,
          montant: money(buckets[bucket].montant),
        }),
      ),
      courbe,
      meta: {
        moyenneCaJournalier30j: money(moyenneCa),
        methode: 'MOYENNE_CA_30J',
      },
    };
  }

  // Série temporelle du CA journalier (§6.3.4) — graphique d'évolution,
  // scopée au même périmètre de caisses que le tableau de bord.
  async ventesQuotidiennes(
    user: AuthenticatedUser,
    jours: number,
  ): Promise<Array<{ date: string; total: string }>> {
    if (!ROLES_LECTURE_CAISSES.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user.role}" non habilité à consulter le reporting trésorerie.`,
      );
    }

    const caisses = await this.caissesService.findAll(user);
    const caisseIds = caisses.map((c) => c.id);
    if (caisseIds.length === 0) return [];

    const depuis = new Date();
    depuis.setHours(0, 0, 0, 0);
    depuis.setDate(depuis.getDate() - (jours - 1));

    const ventes = await this.prisma.vente.findMany({
      where: { caisseId: { in: caisseIds }, dateVente: { gte: depuis } },
      select: { dateVente: true, montantTotal: true },
    });

    const parJour = new Map<string, Prisma.Decimal>();
    for (let i = 0; i < jours; i++) {
      const jour = new Date(depuis);
      jour.setDate(depuis.getDate() + i);
      parJour.set(jour.toISOString().slice(0, 10), zero());
    }
    for (const vente of ventes) {
      const cle = vente.dateVente.toISOString().slice(0, 10);
      const courant = parJour.get(cle);
      if (courant !== undefined) {
        parJour.set(cle, courant.plus(vente.montantTotal));
      }
    }

    return [...parJour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: money(total) }));
  }

  async getDashboardCsv(
    user: AuthenticatedUser,
    periode?: PeriodeFiltre,
  ): Promise<string> {
    const dashboard = await this.getDashboard(user, periode);
    return toCsv(
      dashboard.chiffreAffaires.parBoutique.map((b) => ({
        boutique: b.nomBoutique,
        montant: b.montant,
      })),
      [
        { key: 'boutique', header: 'Boutique' },
        { key: 'montant', header: 'Chiffre d’affaires' },
      ],
    );
  }

  async getVentesCsv(
    user: AuthenticatedUser,
    periode?: PeriodeFiltre,
  ): Promise<string> {
    if (!ROLES_LECTURE_CAISSES.includes(user.role)) {
      throw new ForbiddenException(
        `Rôle "${user.role}" non habilité à consulter le reporting trésorerie.`,
      );
    }

    const caisses = await this.caissesService.findAll(user);
    const caisseIds = caisses.map((c) => c.id);
    if (caisseIds.length === 0) return toCsv([], []);

    const ventes = await this.prisma.vente.findMany({
      where: {
        caisseId: { in: caisseIds },
        dateVente: periodeWhere(periode),
      },
      orderBy: { dateVente: 'desc' },
      select: {
        id: true,
        dateVente: true,
        montantTotal: true,
        modePaiement: true,
        caisseId: true,
        clientId: true,
      },
    });

    return toCsv(
      ventes.map((v) => ({
        id: v.id,
        date: v.dateVente,
        montant: v.montantTotal.toFixed(2),
        modePaiement: v.modePaiement,
        caisseId: v.caisseId,
        clientId: v.clientId,
      })),
      [
        { key: 'id', header: 'ID vente' },
        { key: 'date', header: 'Date' },
        { key: 'montant', header: 'Montant' },
        { key: 'modePaiement', header: 'Mode de paiement' },
        { key: 'caisseId', header: 'Caisse' },
        { key: 'clientId', header: 'Client' },
      ],
    );
  }

  private resolvePerimetre(user: AuthenticatedUser): PerimetreReporting {
    if (ROLES_RESEAU_TRESORERIE.includes(user.role)) return 'RESEAU';
    if (user.role === ROLE_SUPERVISEUR_ZONE) return 'ZONE';
    if (ROLES_PERIMETRE_BOUTIQUE.includes(user.role)) return 'BOUTIQUE';
    return 'RESEAU';
  }

  private async aggreguerChiffreAffaires(
    caisseIds: string[],
    periode?: PeriodeFiltre,
  ): Promise<ReportingDashboardDto['chiffreAffaires']> {
    if (caisseIds.length === 0) {
      return { total: '0.00', parBoutique: [], parModePaiement: [] };
    }

    const dateVente = periodeWhere(periode);

    const ventes = await this.prisma.vente.groupBy({
      by: ['caisseId'],
      where: { caisseId: { in: caisseIds }, dateVente },
      _sum: { montantTotal: true },
    });

    const parMode = await this.prisma.paiementVente.groupBy({
      by: ['modePaiement'],
      where: { vente: { caisseId: { in: caisseIds }, dateVente } },
      _sum: { montant: true },
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
      parModePaiement: parMode
        .map((m) => ({
          modePaiement: m.modePaiement,
          montant: money(m._sum.montant ?? zero()),
        }))
        .sort((a, b) => a.modePaiement.localeCompare(b.modePaiement)),
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
      .filter(
        (l) => l.type === TypeCaisse.MAGASIN || l.type === TypeCaisse.TIROIR,
      )
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

  // Rentabilité par boutique — priorité explicite (marge, pas seulement CA).
  // CA net et coût des ventes (CMV) sont calculés indépendamment du CA brut
  // de aggreguerChiffreAffaires (qui ne déduit pas les retours) pour que
  // marge = CA net − CMV net reste cohérent en interne. LigneVente.coutUnitaire
  // est un snapshot du CMP au moment de la vente — jamais recalculé
  // rétroactivement (cohérence grand livre) ; les ventes antérieures à
  // l'introduction de ce suivi (coutUnitaire null) sont exclues du CMV,
  // jamais approximées avec une valeur fabriquée.
  private async aggreguerRentabiliteParBoutique(
    caisseIds: string[],
    boutiqueIds: string[],
    periode?: PeriodeFiltre,
  ): Promise<ReportingDashboardDto['rentabiliteParBoutique']> {
    if (boutiqueIds.length === 0) {
      return [];
    }

    const boutiques = await this.prisma.boutique.findMany({
      where: { id: { in: boutiqueIds } },
      select: { id: true, nom: true },
    });
    const nomBoutiqueById = new Map(boutiques.map((b) => [b.id, b.nom]));

    interface Cumul {
      caBrut: Prisma.Decimal;
      cmvBrut: Prisma.Decimal;
      retoursMontant: Prisma.Decimal;
      retoursCout: Prisma.Decimal;
      valeurStock: Prisma.Decimal;
    }
    const cumulParBoutique = new Map<string, Cumul>();
    const cumul = (boutiqueId: string): Cumul => {
      let entry = cumulParBoutique.get(boutiqueId);
      if (!entry) {
        entry = {
          caBrut: zero(),
          cmvBrut: zero(),
          retoursMontant: zero(),
          retoursCout: zero(),
          valeurStock: zero(),
        };
        cumulParBoutique.set(boutiqueId, entry);
      }
      return entry;
    };

    if (caisseIds.length > 0) {
      const dateVente = periodeWhere(periode);
      const caisses = await this.prisma.caisse.findMany({
        where: { id: { in: caisseIds } },
        select: { id: true, boutiqueId: true },
      });
      const boutiqueIdByCaisseId = new Map(
        caisses.map((c) => [c.id, c.boutiqueId]),
      );

      const lignes = await this.prisma.ligneVente.findMany({
        where: { vente: { caisseId: { in: caisseIds }, dateVente } },
        select: {
          quantite: true,
          prixUnitaire: true,
          remise: true,
          coutUnitaire: true,
          vente: { select: { caisseId: true } },
        },
      });
      for (const ligne of lignes) {
        const boutiqueId = boutiqueIdByCaisseId.get(ligne.vente.caisseId);
        if (!boutiqueId) continue;
        const entry = cumul(boutiqueId);
        entry.caBrut = entry.caBrut.plus(
          ligne.prixUnitaire.times(ligne.quantite).minus(ligne.remise),
        );
        if (ligne.coutUnitaire !== null) {
          entry.cmvBrut = entry.cmvBrut.plus(
            ligne.coutUnitaire.times(ligne.quantite),
          );
        }
      }

      const retours = await this.prisma.retourVente.findMany({
        where: {
          ligneVente: { vente: { caisseId: { in: caisseIds }, dateVente } },
        },
        select: {
          quantite: true,
          montantRembourse: true,
          ligneVente: {
            select: {
              coutUnitaire: true,
              vente: { select: { caisseId: true } },
            },
          },
        },
      });
      for (const retour of retours) {
        const boutiqueId = boutiqueIdByCaisseId.get(
          retour.ligneVente.vente.caisseId,
        );
        if (!boutiqueId) continue;
        const entry = cumul(boutiqueId);
        entry.retoursMontant = entry.retoursMontant.plus(
          retour.montantRembourse,
        );
        if (retour.ligneVente.coutUnitaire !== null) {
          entry.retoursCout = entry.retoursCout.plus(
            retour.ligneVente.coutUnitaire.times(retour.quantite),
          );
        }
      }
    }

    const quants = await this.prisma.stockQuant.findMany({
      where: { entrepot: { boutiqueId: { in: boutiqueIds } } },
      select: {
        quantite: true,
        produit: { select: { coutMoyenPondere: true } },
        entrepot: { select: { boutiqueId: true } },
      },
    });
    for (const quant of quants) {
      const entry = cumul(quant.entrepot.boutiqueId);
      entry.valeurStock = entry.valeurStock.plus(
        quant.produit.coutMoyenPondere.times(quant.quantite),
      );
    }

    return boutiqueIds
      .map((boutiqueId) => {
        const c = cumulParBoutique.get(boutiqueId) ?? cumul(boutiqueId);
        const caNet = c.caBrut.minus(c.retoursMontant);
        const cmvNet = c.cmvBrut.minus(c.retoursCout);
        const margeBrute = caNet.minus(cmvNet);
        const tauxMarge = caNet.greaterThan(0)
          ? margeBrute.div(caNet).times(100).toFixed(2)
          : '0.00';
        return {
          boutiqueId,
          nomBoutique: nomBoutiqueById.get(boutiqueId) ?? boutiqueId,
          chiffreAffairesNet: money(caNet),
          coutDesVentes: money(cmvNet),
          margeBrute: money(margeBrute),
          tauxMarge,
          valeurStock: money(c.valeurStock),
        };
      })
      .sort((a, b) => a.nomBoutique.localeCompare(b.nomBoutique));
  }
}
