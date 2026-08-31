import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ShopStockWebService } from './shop-stock-web.service';
import { ShopBaseService, mapProduitCatalogue } from './shop-base.service';
import {
  STATUTS_COMMANDE_REVENUE,
  affiniteCategoriePourProduit,
  badgeDecouverte,
  construireProfilInteret,
  etapeAarrr,
  rangerFeed,
  raisonPersonnalisation,
  scoreDecouverte,
  syntheseAarrr,
  type ShopFunnelAction,
  type ProduitSignal,
} from './shop-aarrr.engine';
import type { ShopFunnelEventDto } from './dto/shop-funnel.dto';
import { interpretCatalogueQuery } from './catalogue-search.intelligence';

const FENETRE_30J_MS = 30 * 24 * 60 * 60 * 1000;
const FENETRE_7J_MS = 7 * 24 * 60 * 60 * 1000;
const FENETRE_24H_MS = 24 * 60 * 60 * 1000;
const CATALOGUE_FALLBACK = 24;

type EvenementServeur = {
  action: ShopFunnelAction;
  sessionId: string;
  compteClientId?: string | null;
  produitId?: string | null;
  commandeWebId?: string | null;
  codeParrain?: string | null;
};

@Injectable()
export class ShopAarrrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopBase: ShopBaseService,
    private readonly shopStockWeb: ShopStockWebService,
  ) {}

  async ingestPublic(
    dto: ShopFunnelEventDto,
    compteClientId?: string,
  ) {
    return this.persist({
      action: dto.action,
      sessionId: dto.sessionId,
      compteClientId,
      produitId: dto.produitId,
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      codeParrain: dto.codeParrain,
      requete: dto.requete,
    });
  }

  async ingestServeur(evt: EvenementServeur) {
    return this.persist(evt);
  }

  async decouverte(opts: {
    sessionId?: string;
    compteClientId?: string;
  }) {
    const params = await this.shopBase.assertShopActif();
    const paramsPrix = this.shopBase.toParametresPrix(params);
    const maintenant = Date.now();
    const d30 = new Date(maintenant - FENETRE_30J_MS);
    const d7 = maintenant - FENETRE_7J_MS;
    const d24 = maintenant - FENETRE_24H_MS;

    const [lignesWeb, lignesPos, eventsSession, produitsWeb] =
      await Promise.all([
        this.prisma.ligneCommandeWeb.findMany({
          where: {
            commande: {
              statut: { in: [...STATUTS_COMMANDE_REVENUE] },
              createdAt: { gte: d30 },
            },
          },
          select: {
            produitId: true,
            quantite: true,
            commande: { select: { createdAt: true } },
          },
        }),
        this.prisma.ligneVente.findMany({
          where: { vente: { dateVente: { gte: d30 } } },
          select: {
            produitId: true,
            quantite: true,
            vente: { select: { dateVente: true } },
          },
        }),
        opts.sessionId || opts.compteClientId
          ? this.prisma.shopFunnelEvent.findMany({
              where: {
                createdAt: { gte: d30 },
                OR: [
                  ...(opts.sessionId ? [{ sessionId: opts.sessionId }] : []),
                  ...(opts.compteClientId
                    ? [{ compteClientId: opts.compteClientId }]
                    : []),
                ],
              },
              select: { produitId: true, action: true, requete: true },
              take: 120,
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        this.prisma.produit.findMany({
          where: {
            actif: true,
            visibleWeb: true,
            ...(paramsPrix.fallbackPrixMagasin
              ? {}
              : { prixWeb: { gt: 0 } }),
          },
          take: 80,
          orderBy: { designation: 'asc' },
        }),
      ]);

    const ventes = new Map<
      string,
      { v24: number; v7: number; v30: number }
    >();
    const bumpVente = (produitId: string, at: Date, qty: number) => {
      const row = ventes.get(produitId) ?? { v24: 0, v7: 0, v30: 0 };
      row.v30 += qty;
      if (at.getTime() >= d7) row.v7 += qty;
      if (at.getTime() >= d24) row.v24 += qty;
      ventes.set(produitId, row);
    };
    for (const l of lignesWeb) {
      bumpVente(l.produitId, l.commande.createdAt, l.quantite);
    }
    for (const l of lignesPos) {
      bumpVente(l.produitId, l.vente.dateVente, l.quantite);
    }

    const vuesParProduit = new Map<string, number>();
    const panierSession = new Set<string>();
    for (const ev of eventsSession) {
      if (!ev.produitId) continue;
      if (ev.action === 'VIEW_PDP') {
        vuesParProduit.set(
          ev.produitId,
          (vuesParProduit.get(ev.produitId) ?? 0) + 1,
        );
      }
      if (ev.action === 'ADD_CART') {
        panierSession.add(ev.produitId);
        vuesParProduit.set(
          ev.produitId,
          (vuesParProduit.get(ev.produitId) ?? 0) + 1,
        );
      }
    }

    const ids = new Set<string>([
      ...ventes.keys(),
      ...vuesParProduit.keys(),
      ...panierSession,
      ...produitsWeb.map((p) => p.id),
    ]);

    const extraIds = [...ids].filter(
      (id) => !produitsWeb.some((p) => p.id === id),
    );
    const extraProduits =
      extraIds.length > 0
        ? await this.prisma.produit.findMany({
            where: {
              id: { in: extraIds },
              actif: true,
              visibleWeb: true,
            },
          })
        : [];
    const catalogue = [...produitsWeb, ...extraProduits];

    const produitMeta = new Map(
      catalogue.map((p) => [p.id, { categorie: p.categorie }]),
    );
    const profil = construireProfilInteret(
      eventsSession,
      produitMeta,
      (requete) =>
        interpretCatalogueQuery({ recherche: requete }).categorieImplied,
    );
    const categoriesVues = new Set(
      profil.categories.map((c) => c.libelle.toLowerCase()),
    );
    const rechercheFold = profil.recherches.map((r) =>
      r
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase(),
    );

    const items: Array<{
      id: string;
      signal: ProduitSignal;
      mapped: NonNullable<ReturnType<typeof mapProduitCatalogue>>;
    }> = [];

    const retraitEntrepots = params.retraitActif
      ? await this.shopStockWeb.listEntrepotsRetraitWeb()
      : [];

    for (const p of catalogue) {
      let stockDisponible: number | undefined;
      if (p.typeProduit === 'ARTICLE') {
        stockDisponible = await this.shopStockWeb.getStockWebDisponible(
          p.id,
          p.typeProduit,
          params,
          retraitEntrepots,
        );
      }
      const mapped = mapProduitCatalogue(p, paramsPrix, stockDisponible);
      if (!mapped) continue;
      const v = ventes.get(p.id) ?? { v24: 0, v7: 0, v30: 0 };
      const affinite = affiniteCategoriePourProduit(p.categorie, profil);
      const catFold = (p.categorie ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
      const designationFold = p.designation
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
      const matchRecherche = rechercheFold.some(
        (q) =>
          (q.length >= 2 &&
            (designationFold.includes(q) || catFold.includes(q))) ||
          (catFold && q.includes(catFold)),
      );
      const sig: ProduitSignal = {
        produitId: p.id,
        ventes24h: v.v24,
        ventes7j: v.v7,
        ventes30j: v.v30,
        stockDisponible: mapped.stockDisponible,
        vuesSession: vuesParProduit.get(p.id) ?? 0,
        categorieVue: Boolean(
          p.categorie && categoriesVues.has(p.categorie.toLowerCase()),
        ),
        affiniteCategorie: affinite,
        dansPanierSession: panierSession.has(p.id),
        matchRecherche,
      };
      items.push({ id: p.id, signal: sig, mapped });
    }

    items.sort(
      (a, b) =>
        scoreDecouverte(b.signal) - scoreDecouverte(a.signal) ||
        a.id.localeCompare(b.id),
    );
    const ranked = items.slice(0, CATALOGUE_FALLBACK + 8);
    const feed = rangerFeed(ranked);

    const present = (row: (typeof ranked)[number]) => ({
      ...row.mapped,
      unitesVendues30j: row.signal.ventes30j,
      badge: badgeDecouverte(row.signal) ?? undefined,
      score: scoreDecouverte(row.signal),
      raison: raisonPersonnalisation(row.signal, profil),
    });

    return {
      flash: feed.flash.map(present),
      pourVous: feed.pourVous.map(present),
      tendances: feed.tendances.map(present),
      profil: {
        personnalise: profil.personnalise,
        centresInteret: profil.categories.map((c) => c.libelle),
        message: profil.personnalise
          ? profil.categories[0]
            ? `Sélection selon vos intérêts · ${profil.categories[0].libelle}`
            : 'Sélection selon vos consultations récentes'
          : 'Découverte réseau — explorez pour personnaliser',
      },
    };
  }

  async tableauDeBord(fenetreJours = 7) {
    const jours = Math.min(90, Math.max(1, Math.floor(fenetreJours)));
    const depuis = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

    const [events, commandes, comptesParraines] = await Promise.all([
      this.prisma.shopFunnelEvent.findMany({
        where: { createdAt: { gte: depuis } },
        select: { action: true, sessionId: true, etape: true },
      }),
      this.prisma.commandeWeb.findMany({
        where: {
          createdAt: { gte: depuis },
          statut: { in: [...STATUTS_COMMANDE_REVENUE] },
        },
        select: {
          compteClientId: true,
          montantTotal: true,
        },
      }),
      this.prisma.compteClient.count({
        where: { createdAt: { gte: depuis }, parrainId: { not: null } },
      }),
    ]);

    const sessionsAcquisition = new Set<string>();
    const sessionsActivation = new Set<string>();
    let vuesHome = 0;
    let vuesPdp = 0;
    let recherches = 0;
    let landings = 0;
    let ajoutsPanier = 0;
    let inscriptions = 0;
    let checkouts = 0;
    let partages = 0;
    let inscriptionsParrainees = 0;
    for (const ev of events) {
      if (ev.etape === 'ACQUISITION') sessionsAcquisition.add(ev.sessionId);
      if (ev.etape === 'ACTIVATION') sessionsActivation.add(ev.sessionId);
      if (ev.action === 'VIEW_HOME') vuesHome += 1;
      if (ev.action === 'VIEW_PDP') vuesPdp += 1;
      if (ev.action === 'SEARCH') recherches += 1;
      if (ev.action === 'LANDING') landings += 1;
      if (ev.action === 'ADD_CART') ajoutsPanier += 1;
      if (ev.action === 'INSCRIPTION') inscriptions += 1;
      if (ev.action === 'CHECKOUT') checkouts += 1;
      if (ev.action === 'SHARE') partages += 1;
      if (ev.action === 'INSCRIPTION_PARRAINEE') inscriptionsParrainees += 1;
    }

    const parCompte = new Map<string, number>();
    let caTtc = 0;
    for (const c of commandes) {
      caTtc += Number(c.montantTotal);
      if (c.compteClientId) {
        parCompte.set(
          c.compteClientId,
          (parCompte.get(c.compteClientId) ?? 0) + 1,
        );
      }
    }
    let clientsRecurrents = 0;
    for (const n of parCompte.values()) {
      if (n >= 2) clientsRecurrents += 1;
    }

    return {
      fenetreJours: jours,
      ...syntheseAarrr({
        sessionsAcquisition: sessionsAcquisition.size,
        vuesHome,
        vuesPdp,
        recherches,
        landings,
        sessionsActivation: sessionsActivation.size,
        ajoutsPanier,
        inscriptions,
        checkouts,
        commandesPayees: commandes.length,
        caTtc: Math.round(caTtc),
        clientsRecurrents,
        clientsAcheteurs: parCompte.size,
        partages,
        inscriptionsParrainees: Math.max(
          inscriptionsParrainees,
          comptesParraines,
        ),
      }),
    };
  }

  async enregistrerCommande(opts: {
    sessionId: string;
    compteClientId?: string;
    commandeWebId: string;
    statut: string;
    premiereLigneProduitId?: string;
  }) {
    await this.ingestServeur({
      action: 'CHECKOUT',
      sessionId: opts.sessionId,
      compteClientId: opts.compteClientId,
      commandeWebId: opts.commandeWebId,
      produitId: opts.premiereLigneProduitId,
    });
    if (
      !(STATUTS_COMMANDE_REVENUE as readonly string[]).includes(opts.statut)
    ) {
      return;
    }
    let action: ShopFunnelAction = 'PURCHASE';
    if (opts.compteClientId) {
      const precedentes = await this.prisma.commandeWeb.count({
        where: {
          id: { not: opts.commandeWebId },
          compteClientId: opts.compteClientId,
          statut: { in: [...STATUTS_COMMANDE_REVENUE] },
        },
      });
      if (precedentes > 0) action = 'REPEAT_PURCHASE';
    }
    await this.ingestServeur({
      action,
      sessionId: opts.sessionId,
      compteClientId: opts.compteClientId,
      commandeWebId: opts.commandeWebId,
      produitId: opts.premiereLigneProduitId,
    });
  }

  async nouvelCodeParrainage(): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const code = `MA${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`;
      const exists = await this.prisma.compteClient.findUnique({
        where: { codeParrainage: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new BadRequestException('Impossible de générer un code parrainage.');
  }

  async resoudreParrain(code?: string | null) {
    const trimmed = code?.trim().toUpperCase();
    if (!trimmed) return null;
    return this.prisma.compteClient.findFirst({
      where: { codeParrainage: trimmed, actif: true },
      select: { id: true, codeParrainage: true },
    });
  }

  private async persist(evt: {
    action: ShopFunnelAction;
    sessionId: string;
    compteClientId?: string | null;
    produitId?: string | null;
    commandeWebId?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    codeParrain?: string | null;
    requete?: string | null;
  }) {
    const data: Prisma.ShopFunnelEventCreateInput = {
      etape: etapeAarrr(evt.action),
      action: evt.action,
      sessionId: evt.sessionId.slice(0, 64),
      utmSource: evt.utmSource?.slice(0, 80) ?? null,
      utmMedium: evt.utmMedium?.slice(0, 80) ?? null,
      utmCampaign: evt.utmCampaign?.slice(0, 120) ?? null,
      codeParrain: evt.codeParrain?.slice(0, 16) ?? null,
      requete: evt.requete?.slice(0, 80) ?? null,
    };
    if (evt.compteClientId) {
      data.compteClient = { connect: { id: evt.compteClientId } };
    }
    if (evt.produitId) {
      data.produit = { connect: { id: evt.produitId } };
    }
    if (evt.commandeWebId) {
      data.commandeWeb = { connect: { id: evt.commandeWebId } };
    }
    try {
      await this.prisma.shopFunnelEvent.create({ data });
    } catch {
      await this.prisma.shopFunnelEvent.create({
        data: {
          etape: etapeAarrr(evt.action),
          action: evt.action,
          sessionId: evt.sessionId.slice(0, 64),
          utmSource: data.utmSource,
          utmMedium: data.utmMedium,
          utmCampaign: data.utmCampaign,
          codeParrain: data.codeParrain,
          requete: data.requete,
        },
      });
    }
    return { ok: true as const };
  }
}
