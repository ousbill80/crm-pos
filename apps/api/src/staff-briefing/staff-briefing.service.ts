import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { StatutTransaction, TypeTransaction } from '@prisma/client';
import { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';
import { STATUTS_COMMANDE_REVENUE } from '../shop/shop-aarrr.engine';
import { StaffBriefingMailer } from './staff-briefing.mailer';
import { renderBriefing, type LiensBriefing } from './staff-briefing.templates';
import {
  ROLES_ALERTE_SHOP,
  ROLES_BRIEFING_EXECUTIF,
  ROLES_BRIEFING_SOIR,
  ROLES_RELANCE_CONNEXION,
  debutJourAbidjan,
  estDernierJourDuMois,
  finJourAbidjan,
  inactifDepuisHeures,
  jourCleAbidjan,
  cleSemaineIso,
  shopNecessiteAttention,
  type SnapshotFinance,
  type SnapshotShop,
  type SnapshotStocks,
  type SnapshotVentes,
  type TypeBriefing,
} from './staff-briefing.engine';

const SEUIL_INACTIVITE_H = 48;

@Injectable()
export class StaffBriefingService {
  private readonly logger = new Logger(StaffBriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stocks: StockService,
    private readonly mailer: StaffBriefingMailer,
    private readonly config: ConfigService,
  ) {}

  enabled(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    return this.config.get<string>('STAFF_BRIEFING_ENABLED')?.trim() === 'true';
  }

  async cycleSoir(now = new Date()): Promise<number> {
    const jour = jourCleAbidjan(now);
    const ventes = await this.snapshotVentes(
      debutJourAbidjan(now),
      finJourAbidjan(now),
      jour,
    );
    return this.diffuser('SOIR', ROLES_BRIEFING_SOIR, `SOIR:${jour}`, {
      ventes,
    });
  }

  async cycleHebdo(now = new Date()): Promise<number> {
    const fin = finJourAbidjan(now);
    const debut = new Date(debutJourAbidjan(now));
    debut.setUTCDate(debut.getUTCDate() - 6);
    const ventes = await this.snapshotVentes(
      debut,
      fin,
      `semaine ${cleSemaineIso(now)}`,
    );
    const [stocks, finance] = await Promise.all([
      this.snapshotStocks(),
      this.snapshotFinance(debut, fin),
    ]);
    return this.diffuser(
      'HEBDO',
      ROLES_BRIEFING_EXECUTIF,
      `HEBDO:${cleSemaineIso(now)}`,
      { ventes, stocks, finance },
    );
  }

  async cycleMensuel(now = new Date()): Promise<number> {
    if (!estDernierJourDuMois(now)) return 0;
    const jour = jourCleAbidjan(now);
    const mois = jour.slice(0, 7);
    const debut = new Date(`${mois}-01T00:00:00.000Z`);
    const ventes = await this.snapshotVentes(debut, finJourAbidjan(now), mois);
    const [stocks, finance] = await Promise.all([
      this.snapshotStocks(),
      this.snapshotFinance(debut, finJourAbidjan(now)),
    ]);
    return this.diffuser('MOIS', ROLES_BRIEFING_EXECUTIF, `MOIS:${mois}`, {
      ventes,
      stocks,
      finance,
    });
  }

  async cycleRelances(now = new Date()): Promise<number> {
    const jour = jourCleAbidjan(now);
    const users = await this.destinataires(ROLES_RELANCE_CONNEXION);
    let n = 0;
    for (const u of users) {
      const last = await this.prisma.journalAudit.findFirst({
        where: { utilisateurId: u.id, action: 'LOGIN_REUSSI' },
        orderBy: { dateHeure: 'desc' },
        select: { dateHeure: true },
      });
      if (!inactifDepuisHeures(last?.dateHeure ?? null, now, SEUIL_INACTIVITE_H)) {
        continue;
      }
      const heures = last
        ? Math.round((now.getTime() - last.dateHeure.getTime()) / 3600_000)
        : 999;
      n += await this.envoyerUn(
        'RELANCE_CONNEXION',
        `RELANCE:${u.id}:${jour}`,
        u,
        { heuresSansConnexion: heures },
      );
    }
    return n;
  }

  async cycleShopInactif(now = new Date()): Promise<number> {
    const shop = await this.snapshotShop(now);
    if (!shopNecessiteAttention(shop)) return 0;
    const jour = jourCleAbidjan(now);
    return this.diffuser(
      'SHOP_INACTIF',
      ROLES_ALERTE_SHOP,
      `SHOP_INACTIF:${jour}`,
      { shop },
    );
  }

  private liens(): LiensBriefing {
    const crm = (
      this.config.get<string>('CRM_PUBLIC_URL')?.trim() ||
      'https://crm.majorautoparts.shop'
    ).replace(/\/$/, '');
    const shop = (
      this.config.get<string>('SHOP_PUBLIC_URL')?.trim() ||
      'https://www.majorautoparts.shop'
    ).replace(/\/$/, '');
    return {
      crm,
      shop,
      dashboard: `${crm}/dashboard`,
      finance: `${crm}/finance`,
      croissance: `${crm}/clients/croissance`,
    };
  }

  private async destinataires(roles: RoleLibelle[]) {
    return this.prisma.utilisateur.findMany({
      where: {
        actif: true,
        email: { not: null },
        role: { libelle: { in: roles } },
      },
      select: {
        id: true,
        email: true,
        prenom: true,
        nom: true,
        role: { select: { libelle: true } },
      },
    });
  }

  private async diffuser(
    type: TypeBriefing,
    roles: RoleLibelle[],
    cleLot: string,
    ctx: {
      ventes?: SnapshotVentes;
      stocks?: SnapshotStocks;
      finance?: SnapshotFinance;
      shop?: SnapshotShop;
    },
  ): Promise<number> {
    const users = await this.destinataires(roles);
    let n = 0;
    for (const u of users) {
      n += await this.envoyerUn(type, `${cleLot}:${u.id}`, u, ctx);
    }
    return n;
  }

  private async envoyerUn(
    type: TypeBriefing,
    cleUnique: string,
    u: {
      id: string;
      email: string | null;
      prenom: string;
      role: { libelle: string };
    },
    ctx: {
      ventes?: SnapshotVentes;
      stocks?: SnapshotStocks;
      finance?: SnapshotFinance;
      shop?: SnapshotShop;
      heuresSansConnexion?: number;
    },
  ): Promise<number> {
    if (!u.email) return 0;
    const deja = await this.prisma.staffBriefingEnvoi.findUnique({
      where: { cleUnique },
    });
    if (deja) return 0;
    const role = u.role.libelle as RoleLibelle;
    const briefing = renderBriefing(type, role, u.prenom || 'Bonjour', {
      ...ctx,
      liens: this.liens(),
    });
    let resendId: string | null = null;
    try {
      resendId = await this.mailer.envoyer(u.email, briefing);
    } catch (err) {
      this.logger.warn(`Échec briefing ${type} → ${u.id}: ${String(err)}`);
      return 0;
    }
    if (!resendId) return 0;
    await this.prisma.staffBriefingEnvoi.create({
      data: {
        type,
        cleUnique,
        utilisateurId: u.id,
        destinataireHash: this.hashDest(u.email),
        resendId,
      },
    });
    return 1;
  }

  private hashDest(email: string): string {
    return createHash('sha256').update(email.toLowerCase()).digest('hex');
  }

  private async snapshotVentes(
    from: Date,
    to: Date,
    periodeLabel: string,
  ): Promise<SnapshotVentes> {
    const [ventes, web, litiges, retards] = await Promise.all([
      this.prisma.vente.findMany({
        where: { dateVente: { gte: from, lte: to } },
        select: {
          montantTotal: true,
          caisse: { select: { boutique: { select: { nom: true } } } },
        },
      }),
      this.prisma.commandeWeb.aggregate({
        where: {
          createdAt: { gte: from, lte: to },
          statut: { in: [...STATUTS_COMMANDE_REVENUE] },
        },
        _sum: { montantTotal: true },
        _count: { _all: true },
      }),
      this.prisma.transactionCaisse.count({
        where: {
          type: TypeTransaction.SORTIE_FONDS,
          statut: StatutTransaction.LITIGE,
        },
      }),
      this.delaiHeures().then((h) =>
        this.prisma.transactionCaisse.count({
          where: {
            type: TypeTransaction.SORTIE_FONDS,
            statut: {
              in: [StatutTransaction.INITIEE, StatutTransaction.EN_TRANSIT],
            },
            dateHeure: { lte: new Date(Date.now() - h * 3600_000) },
          },
        }),
      ),
    ]);
    const parMap = new Map<string, { ca: number; tickets: number }>();
    let caReseau = 0;
    for (const v of ventes) {
      const nom = v.caisse.boutique?.nom ?? 'Caisse';
      const mt = Number(v.montantTotal);
      caReseau += mt;
      const row = parMap.get(nom) ?? { ca: 0, tickets: 0 };
      row.ca += mt;
      row.tickets += 1;
      parMap.set(nom, row);
    }
    return {
      periodeLabel,
      caReseau,
      tickets: ventes.length,
      parBoutique: [...parMap.entries()].map(([nom, r]) => ({
        nom,
        ca: r.ca,
        tickets: r.tickets,
      })),
      caWeb: Number(web._sum.montantTotal ?? 0),
      commandesWeb: web._count._all,
      litigesOuverts: litiges,
      versementsEnRetard: retards,
    };
  }

  private async snapshotStocks(): Promise<SnapshotStocks> {
    const entrepots = await this.prisma.entrepot.findMany({
      where: { actif: true },
      select: { id: true },
    });
    const synthese = await this.stocks.synthese(entrepots.map((e) => e.id));
    return {
      valeurStock: Number(synthese.kpis.valeurStock),
      ruptures: synthese.kpis.ruptures,
      sousSeuil: synthese.kpis.sousSeuil,
    };
  }

  private async snapshotFinance(
    from: Date,
    to: Date,
  ): Promise<SnapshotFinance> {
    const h = await this.delaiHeures();
    const [file, valides, retards] = await Promise.all([
      this.prisma.transactionCaisse.groupBy({
        by: ['statut'],
        where: { type: TypeTransaction.SORTIE_FONDS },
        _count: { _all: true },
        _sum: { montant: true },
      }),
      this.prisma.transactionCaisse.aggregate({
        where: {
          type: TypeTransaction.SORTIE_FONDS,
          statut: StatutTransaction.VALIDEE,
          dateHeure: { gte: from, lte: to },
        },
        _count: { _all: true },
        _sum: { montant: true },
      }),
      this.prisma.transactionCaisse.count({
        where: {
          type: TypeTransaction.SORTIE_FONDS,
          statut: {
            in: [StatutTransaction.INITIEE, StatutTransaction.EN_TRANSIT],
          },
          dateHeure: { lte: new Date(Date.now() - h * 3600_000) },
        },
      }),
    ]);
    const byStatut = new Map(
      file.map((g) => [
        g.statut,
        { n: g._count._all, montant: Number(g._sum.montant ?? 0) },
      ]),
    );
    const pick = (s: StatutTransaction) =>
      byStatut.get(s) ?? { n: 0, montant: 0 };
    return {
      initiee: pick(StatutTransaction.INITIEE),
      enTransit: pick(StatutTransaction.EN_TRANSIT),
      receptionnee: pick(StatutTransaction.RECEPTIONNEE),
      valideePeriode: {
        n: valides._count._all,
        montant: Number(valides._sum.montant ?? 0),
      },
      litige: pick(StatutTransaction.LITIGE),
      versementsEnRetard: retards,
    };
  }

  private async snapshotShop(now: Date): Promise<SnapshotShop> {
    const depuis = new Date(now.getTime() - 7 * 24 * 3600_000);
    const [params, produitsVisibles, commandes7j, sessions7j] =
      await Promise.all([
        this.prisma.parametreShop.findFirst({ select: { shopActif: true } }),
        this.prisma.produit.count({
          where: { actif: true, visibleWeb: true },
        }),
        this.prisma.commandeWeb.count({
          where: {
            createdAt: { gte: depuis },
            statut: { in: [...STATUTS_COMMANDE_REVENUE] },
          },
        }),
        this.prisma.shopFunnelEvent
          .findMany({
            where: { createdAt: { gte: depuis }, etape: 'ACQUISITION' },
            distinct: ['sessionId'],
            select: { sessionId: true },
          })
          .then((rows) => rows.length),
      ]);
    return {
      shopActif: params?.shopActif === true,
      produitsVisibles,
      commandes7j,
      sessions7j,
    };
  }

  private async delaiHeures(): Promise<number> {
    const s = await this.prisma.societe.findFirst({
      select: { delaiVersementHeures: true },
    });
    return s?.delaiVersementHeures ?? 24;
  }
}
