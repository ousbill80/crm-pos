import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma, StatutTransaction, TypeTransaction } from '@prisma/client';
import { RoleLibelle } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';
import { STATUTS_COMMANDE_REVENUE } from '../shop/shop-aarrr.engine';
import { StaffBriefingMailer } from './staff-briefing.mailer';
import { renderBriefing, type BriefingHtml, type LiensBriefing } from './staff-briefing.templates';
import { echantillonsIllustration } from './staff-briefing-echantillons';
import { AlertesMailer } from '../alertes/alertes-mailer';
import {
  renderMailDigestDaf,
  renderMailPointNonVerse,
  renderMailReceptionDaf,
} from '../alertes/alertes-mail';
import {
  ROLES_ALERTE_SHOP,
  ROLES_BRIEFING_EXECUTIF,
  ROLES_BRIEFING_SOIR,
  ROLES_CLOTURE_CAISSE,
  ROLES_RELANCE_CONNEXION,
  debutJourAbidjan,
  estDernierJourDuMois,
  finJourAbidjan,
  inactifDepuisHeures,
  jourCleAbidjan,
  cleSemaineIso,
  parseHeureFinService,
  shopNecessiteAttention,
  synthetiserCloture,
  synthetiserCompteResultat,
  assemblerSnapshotVentes,
  type HorizonVentes,
  type SnapshotCloture,
  type SnapshotFinance,
  type SnapshotGl,
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
    private readonly alertesMailer: AlertesMailer,
    private readonly config: ConfigService,
  ) {}

  enabled(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    return this.config.get<string>('STAFF_BRIEFING_ENABLED')?.trim() === 'true';
  }

  /**
   * Envoi unique de tous les modèles (briefings + alertes fonds) vers une
   * liste d’adresses. Préfixe [TEST], n’écrit pas StaffBriefingEnvoi.
   */
  async envoyerEchantillonsTest(
    emails: string[],
  ): Promise<{ type: string; to: string; ok: boolean }[]> {
    const dest = [
      ...new Set(
        emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')),
      ),
    ];
    if (dest.length === 0) return [];
    const illustration =
      this.config.get<string>('STAFF_MAIL_TEST_ILLUSTRATION')?.trim() === '1';
    const pieces = illustration
      ? echantillonsIllustration(this.liens())
      : await this.construireEchantillons(new Date());
    const resultats: { type: string; to: string; ok: boolean }[] = [];
    for (const to of dest) {
      for (const p of pieces) {
        let id: string | null = null;
        try {
          id =
            p.canal === 'briefing'
              ? await this.mailer.envoyer(to, p.mail)
              : await this.alertesMailer.envoyer(to, p.mail);
        } catch (err) {
          this.logger.warn(
            `Échantillon ${p.type} → ${to}: ${String(err)}`,
          );
        }
        resultats.push({ type: p.type, to, ok: Boolean(id) });
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return resultats;
  }

  async construireEchantillonsTest(now = new Date()) {
    return this.construireEchantillons(now);
  }

  private marquerTest(mail: BriefingHtml): BriefingHtml {
    const bandeau =
      '<div style="background:#b42318;color:#fff;padding:10px 16px;font:12px/1.4 sans-serif">E-MAIL DE TEST — maquette des envois automatiques. Ne pas traiter comme une alerte opérationnelle.</div>';
    return {
      objet: `[TEST] ${mail.objet}`.slice(0, 180),
      text: `[TEST — ne pas traiter comme une alerte opérationnelle]\n${mail.text}`,
      html: mail.html.includes('<body')
        ? mail.html.replace(/<body([^>]*)>/i, `<body$1>${bandeau}`)
        : `${bandeau}${mail.html}`,
    };
  }

  private async construireEchantillons(
    now: Date,
  ): Promise<Array<{ type: string; canal: 'briefing' | 'alerte'; mail: BriefingHtml }>> {
    const jour = jourCleAbidjan(now);
    const fin = finJourAbidjan(now);
    const debutJour = debutJourAbidjan(now);
    const debutSemaine = new Date(debutJour);
    debutSemaine.setUTCDate(debutSemaine.getUTCDate() - 6);
    const mois = jour.slice(0, 7);
    const debutMois = new Date(`${mois}-01T00:00:00.000Z`);
    const [
      ventesJour,
      ventesSemaine,
      ventesMois,
      cloture,
      stocks,
      finance,
      gl,
      shop,
    ] = await Promise.all([
      this.snapshotVentes(debutJour, fin, jour, 'JOUR'),
      this.snapshotVentes(
        debutSemaine,
        fin,
        `semaine ${cleSemaineIso(now)}`,
        'SEMAINE',
      ),
      this.snapshotVentes(debutMois, fin, mois, 'MOIS'),
      this.snapshotCloture(now, debutJour),
      this.snapshotStocks(),
      this.snapshotFinance(debutSemaine, fin),
      this.snapshotGl(debutMois, fin),
      this.snapshotShop(now),
    ]);
    return this.rendrePieces({
      ventesJour,
      ventesSemaine,
      ventesMois,
      cloture,
      stocks,
      finance,
      gl,
      shop,
    });
  }

  private rendrePieces(ctx: {
      ventesJour: SnapshotVentes;
      ventesSemaine: SnapshotVentes;
      ventesMois: SnapshotVentes;
      cloture: SnapshotCloture;
      stocks: SnapshotStocks;
      finance: SnapshotFinance;
      gl: SnapshotGl;
      shop: SnapshotShop;
    },
  ) {
    const { ventesJour, ventesSemaine, ventesMois, cloture, stocks, finance, gl, shop } =
      ctx;
    const role = RoleLibelle.DAF;
    const prenom = 'Équipe';
    const liens = this.liens();
    const briefings: Array<{ type: TypeBriefing; mail: BriefingHtml }> = [
      {
        type: 'SOIR',
        mail: renderBriefing('SOIR', role, prenom, {
          ventes: ventesJour,
          cloture,
          liens,
        }),
      },
      {
        type: 'HEBDO',
        mail: renderBriefing('HEBDO', role, prenom, {
          ventes: ventesSemaine,
          stocks,
          finance,
          gl,
          liens,
        }),
      },
      {
        type: 'MOIS',
        mail: renderBriefing('MOIS', role, prenom, {
          ventes: ventesMois,
          stocks,
          finance,
          gl,
          liens,
        }),
      },
      {
        type: 'CLOTURE_CAISSE',
        mail: renderBriefing('CLOTURE_CAISSE', role, prenom, { cloture, liens }),
      },
      {
        type: 'RELANCE_CONNEXION',
        mail: renderBriefing('RELANCE_CONNEXION', role, prenom, {
          heuresSansConnexion: 72,
          liens,
        }),
      },
      {
        type: 'SHOP_INACTIF',
        mail: renderBriefing('SHOP_INACTIF', role, prenom, { shop, liens }),
      },
    ];
    const posUrl = this.alertesMailer.crmUrl('/pos');
    const receptionUrl = this.alertesMailer.crmUrl('/tresorerie/reception');
    const alertes = [
      {
        type: 'POINT_JOUR_NON_VERSE',
        mail: renderMailPointNonVerse({
          boutique: 'Marcory',
          montant: '125000',
          ageHeures: 26,
          ctaUrl: posUrl,
        }),
      },
      {
        type: 'RECEPTION_DAF_EN_ATTENTE',
        mail: renderMailReceptionDaf({
          boutique: 'Yopougon',
          montant: '84000',
          ctaUrl: receptionUrl,
        }),
      },
      {
        type: 'DIGEST_FONDS_DAF',
        mail: renderMailDigestDaf({
          nonTransferes: [
            {
              boutique: 'Marcory',
              montant: '125000',
              etape: 'Non transféré',
              age: '26 h',
            },
          ],
          aReceptionner: [
            {
              boutique: 'Yopougon',
              montant: '84000',
              etape: 'En transit — à réceptionner',
              age: '2 h',
            },
          ],
          ctaUrl: receptionUrl,
        }),
      },
    ];
    return [
      ...briefings.map((b) => ({
        type: b.type,
        canal: 'briefing' as const,
        mail: this.marquerTest(b.mail),
      })),
      ...alertes.map((a) => ({
        type: a.type,
        canal: 'alerte' as const,
        mail: this.marquerTest(a.mail),
      })),
    ];
  }

  async cycleSoir(now = new Date()): Promise<number> {
    const jour = jourCleAbidjan(now);
    const [ventes, cloture] = await Promise.all([
      this.snapshotVentes(debutJourAbidjan(now), finJourAbidjan(now), jour, 'JOUR'),
      this.snapshotCloture(now, debutJourAbidjan(now)),
    ]);
    return this.diffuser('SOIR', ROLES_BRIEFING_SOIR, `SOIR:${jour}`, {
      ventes,
      cloture,
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
      'SEMAINE',
    );
    const [stocks, finance, gl] = await Promise.all([
      this.snapshotStocks(),
      this.snapshotFinance(debut, fin),
      this.snapshotGl(debut, fin),
    ]);
    return this.diffuser(
      'HEBDO',
      ROLES_BRIEFING_EXECUTIF,
      `ETAT_FIN:HEBDO:${cleSemaineIso(now)}`,
      { ventes, stocks, finance, gl },
    );
  }

  async cycleMensuel(now = new Date()): Promise<number> {
    if (!estDernierJourDuMois(now)) return 0;
    const jour = jourCleAbidjan(now);
    const mois = jour.slice(0, 7);
    const debut = new Date(`${mois}-01T00:00:00.000Z`);
    const ventes = await this.snapshotVentes(debut, finJourAbidjan(now), mois, 'MOIS');
    const [stocks, finance, gl] = await Promise.all([
      this.snapshotStocks(),
      this.snapshotFinance(debut, finJourAbidjan(now)),
      this.snapshotGl(debut, finJourAbidjan(now)),
    ]);
    return this.diffuser('MOIS', ROLES_BRIEFING_EXECUTIF, `ETAT_FIN:MOIS:${mois}`, {
      ventes,
      stocks,
      finance,
      gl,
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

  async cycleCloture(now = new Date()): Promise<number> {
    const snap = await this.snapshotCloture(now);
    if (snap.enRetard.length === 0) return 0;
    const jour = jourCleAbidjan(now);
    const fp = createHash('sha256')
      .update(
        snap.enRetard
          .map((s) => s.id)
          .sort()
          .join(','),
      )
      .digest('hex')
      .slice(0, 12);
    return this.diffuser(
      'CLOTURE_CAISSE',
      ROLES_CLOTURE_CAISSE,
      `CLOTURE:${jour}:${fp}`,
      { cloture: snap },
    );
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
      gl?: SnapshotGl;
      shop?: SnapshotShop;
      cloture?: SnapshotCloture;
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
      gl?: SnapshotGl;
      shop?: SnapshotShop;
      cloture?: SnapshotCloture;
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

  private periodePrecedente(
    from: Date,
    to: Date,
    horizon: HorizonVentes,
  ): { from: Date; to: Date } {
    if (horizon === 'JOUR') {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() - 1);
      return { from: debutJourAbidjan(d), to: finJourAbidjan(d) };
    }
    if (horizon === 'SEMAINE') {
      const duree = to.getTime() - from.getTime();
      return {
        from: new Date(from.getTime() - duree - 1),
        to: new Date(from.getTime() - 1),
      };
    }
    const jour = jourCleAbidjan(from);
    const [y, m] = jour.split('-').map(Number);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const debutPrev = new Date(
      `${prevY}-${String(prevM).padStart(2, '0')}-01T00:00:00.000Z`,
    );
    return { from: debutPrev, to: new Date(from.getTime() - 1) };
  }

  private async snapshotVentes(
    from: Date,
    to: Date,
    periodeLabel: string,
    horizon: HorizonVentes = 'JOUR',
  ): Promise<SnapshotVentes> {
    const prec = this.periodePrecedente(from, to, horizon);
    const [ventes, web, litiges, retards, boutiques, precAgg, precWeb] =
      await Promise.all([
      this.prisma.vente.findMany({
        where: { dateVente: { gte: from, lte: to } },
        select: {
          montantTotal: true,
          modePaiement: true,
          paiements: { select: { modePaiement: true, montant: true } },
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
      this.prisma.boutique.findMany({ select: { nom: true } }),
      this.prisma.vente.aggregate({
        where: { dateVente: { gte: prec.from, lte: prec.to } },
        _sum: { montantTotal: true },
        _count: { _all: true },
      }),
      this.prisma.commandeWeb.aggregate({
        where: {
          createdAt: { gte: prec.from, lte: prec.to },
          statut: { in: [...STATUTS_COMMANDE_REVENUE] },
        },
        _sum: { montantTotal: true },
      }),
    ]);
    const parMap = new Map<string, { ca: number; tickets: number }>();
    for (const b of boutiques) {
      parMap.set(b.nom, { ca: 0, tickets: 0 });
    }
    const mixMap = new Map<string, { montant: number; tickets: number }>();
    let caReseau = 0;
    for (const v of ventes) {
      const nom = v.caisse.boutique?.nom ?? 'Caisse';
      const mt = Number(v.montantTotal);
      caReseau += mt;
      const row = parMap.get(nom) ?? { ca: 0, tickets: 0 };
      row.ca += mt;
      row.tickets += 1;
      parMap.set(nom, row);
      const lignes =
        v.paiements.length > 0
          ? v.paiements.map((p) => ({
              mode: p.modePaiement,
              montant: Number(p.montant),
            }))
          : [{ mode: v.modePaiement, montant: mt }];
      for (const l of lignes) {
        const mix = mixMap.get(l.mode) ?? { montant: 0, tickets: 0 };
        mix.montant += l.montant;
        mix.tickets += 1;
        mixMap.set(l.mode, mix);
      }
    }
    const webCa = Number(web._sum.montantTotal ?? 0);
    const precCa =
      Number(precAgg._sum.montantTotal ?? 0) + Number(precWeb._sum.montantTotal ?? 0);
    return assemblerSnapshotVentes({
      horizon,
      periodeLabel,
      caReseau,
      tickets: ventes.length,
      parBoutique: [...parMap.entries()].map(([nom, r]) => ({
        nom,
        ca: r.ca,
        tickets: r.tickets,
      })),
      caWeb: webCa,
      commandesWeb: web._count._all,
      mixPaiement: [...mixMap.entries()].map(([mode, r]) => ({
        mode,
        montant: r.montant,
        tickets: r.tickets,
      })),
      litigesOuverts: litiges,
      versementsEnRetard: retards,
      boutiquesTotal: Math.max(boutiques.length, parMap.size),
      caPrecedent: precCa,
      ticketsPrecedent: precAgg._count._all,
    });
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

  private heureFinService(): number {
    return parseHeureFinService(this.config.get<string>('STAFF_CLOTURE_HEURE'));
  }

  private async snapshotCloture(
    now: Date,
    depuis = new Date(debutJourAbidjan(now).getTime() - 24 * 3600_000),
  ): Promise<SnapshotCloture> {
    const rows = await this.prisma.sessionCaisse.findMany({
      where: {
        OR: [
          { statut: 'OUVERTE' },
          { clotureDateHeure: { gte: debutJourAbidjan(now) } },
          { ouvertureDateHeure: { gte: depuis } },
        ],
      },
      select: {
        id: true,
        statut: true,
        ouvertureDateHeure: true,
        clotureDateHeure: true,
        clotureTemoinId: true,
        caisse: {
          select: {
            libelle: true,
            code: true,
            boutique: { select: { nom: true } },
          },
        },
      },
    });
    return synthetiserCloture(
      rows.map((s) => ({
        id: s.id,
        statut: s.statut,
        ouvertureDateHeure: s.ouvertureDateHeure,
        clotureDateHeure: s.clotureDateHeure,
        clotureTemoinId: s.clotureTemoinId,
        boutiqueNom: s.caisse.boutique?.nom ?? 'Caisse',
        caisseLibelle: s.caisse.libelle || s.caisse.code || 'Tiroir',
      })),
      now,
      this.heureFinService(),
    );
  }

  private async snapshotGl(from: Date, to: Date): Promise<SnapshotGl> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        numero: string;
        intitule: string;
        debit: string;
        credit: string;
        solde: string;
      }>
    >(Prisma.sql`
      SELECT c.numero, c.intitule,
             COALESCE(SUM(l.debit), 0)::text AS debit,
             COALESCE(SUM(l.credit), 0)::text AS credit,
             COALESCE(SUM(l.debit - l.credit), 0)::text AS solde
      FROM compte_comptable c
      LEFT JOIN ligne_ecriture_comptable l ON l."compteId" = c.id
      LEFT JOIN ecriture_comptable e ON e.id = l."ecritureId"
        AND e."dateComptable" BETWEEN ${from} AND ${to}
      GROUP BY c.numero, c.intitule
      ORDER BY c.numero
    `);
    const [file, factures, lots] = await Promise.all([
      this.prisma.fileEcritureComptable.groupBy({
        by: ['statut'],
        _count: { _all: true },
      }),
      this.prisma.factureFournisseur.aggregate({
        where: { statut: { in: ['COMPTABILISEE', 'PARTIELLEMENT_PAYEE'] } },
        _count: { _all: true },
        _sum: { montant: true },
      }),
      this.prisma.propositionPaiementFournisseur.count({
        where: { statut: 'PREPAREE' },
      }),
    ]);
    const fileMap = new Map(file.map((g) => [g.statut, g._count._all]));
    return synthetiserCompteResultat(rows, {
      fileAttente: fileMap.get('EN_ATTENTE') ?? 0,
      fileErreur: fileMap.get('ERREUR') ?? 0,
      facturesFournisseurOuvertes: factures._count._all,
      montantFacturesOuvertes: Number(factures._sum.montant ?? 0),
      lotsPaiementAApprouver: lots,
    });
  }

  private async delaiHeures(): Promise<number> {
    const s = await this.prisma.societe.findFirst({
      select: { delaiVersementHeures: true },
    });
    return s?.delaiVersementHeures ?? 24;
  }
}
