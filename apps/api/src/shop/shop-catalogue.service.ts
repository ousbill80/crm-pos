import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';
import { ShopBaseService, mapProduitCatalogue } from './shop-base.service';
import {
  interpretCatalogueQuery,
  marqueFieldOr,
  tokenFieldOr,
  type CatalogueTri,
} from './catalogue-search.intelligence';
import { parseAttributsMap } from './parse-attributs';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

@Injectable()
export class ShopCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopBase: ShopBaseService,
    private readonly stockService: StockService,
  ) {}

  async listCatalogue(query: {
    categorie?: string;
    recherche?: string;
    marque?: string;
    tri?: CatalogueTri;
    page?: number;
    limit?: number;
  }) {
    const params = await this.shopBase.assertShopActif();
    const paramsPrix = this.shopBase.toParametresPrix(params);
    const entrepotId = params.entrepotWebDefautId;

    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)),
    );
    const skip = (page - 1) * limit;
    const tri: CatalogueTri = query.tri ?? 'designation';

    const interpreted = interpretCatalogueQuery({
      recherche: query.recherche,
      marque: query.marque,
      categorie: query.categorie,
    });
    const whereFinal = this.buildWhere(
      query.categorie,
      interpreted,
      paramsPrix.fallbackPrixMagasin,
    );

    const orderBy: Prisma.ProduitOrderByWithRelationInput[] =
      tri === 'prix_asc'
        ? [{ prixWeb: 'asc' }, { designation: 'asc' }]
        : tri === 'prix_desc'
          ? [{ prixWeb: 'desc' }, { designation: 'asc' }]
          : [{ designation: 'asc' }];

    const [total, produits, categoryRows] = await Promise.all([
      this.prisma.produit.count({ where: whereFinal }),
      this.prisma.produit.findMany({
        where: whereFinal,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.produit.groupBy({
        by: ['categorie'],
        where: {
          actif: true,
          visibleWeb: true,
          categorie: { not: null },
        },
        _count: { _all: true },
        orderBy: { categorie: 'asc' },
      }),
    ]);

    const items: Array<NonNullable<ReturnType<typeof mapProduitCatalogue>>> =
      [];
    for (const p of produits) {
      let stockDisponible: number | undefined;
      if (entrepotId && p.typeProduit === 'ARTICLE') {
        stockDisponible = await this.stockService.getDisponible(
          p.id,
          entrepotId,
        );
      }
      const mapped = mapProduitCatalogue(p, paramsPrix, stockDisponible);
      if (mapped) items.push(mapped);
    }

    const pageCount = Math.max(1, Math.ceil(total / limit));
    const categories = categoryRows
      .map((r) => r.categorie)
      .filter((c): c is string => Boolean(c));

    return {
      items,
      categories,
      interpreted: {
        marque: interpreted.marque,
        tokens: interpreted.tokens,
        categorieSuggeree: interpreted.categorieImplied,
        aliasesMarque: interpreted.marqueTerms,
      },
      pagination: {
        page,
        limit,
        total,
        pageCount,
        hasNext: page < pageCount,
        hasPrev: page > 1,
      },
      parametres: { modeAffichage: paramsPrix.modeAffichagePrix },
    };
  }

  private buildWhere(
    categorie: string | undefined,
    interpreted: ReturnType<typeof interpretCatalogueQuery>,
    fallbackPrixMagasin: boolean,
  ): Prisma.ProduitWhereInput {
    const and: Prisma.ProduitWhereInput[] = [
      { actif: true },
      { visibleWeb: true },
    ];

    if (categorie?.trim()) {
      and.push({ categorie: categorie.trim() });
    }

    // Navigation rayon : une carte par famille. La recherche (H7, 18"…)
    // inclut les SKUs enfants pour atterrir sur la bonne variante.
    const browsing =
      interpreted.tokens.length === 0 &&
      interpreted.marqueTerms.length === 0 &&
      !interpreted.raw;
    if (browsing) {
      and.push({ parentId: null });
    }

    if (interpreted.marqueTerms.length > 0) {
      and.push({
        OR: marqueFieldOr(interpreted.marqueTerms),
      });
    }

    for (const token of interpreted.tokens) {
      and.push({
        OR: tokenFieldOr(token),
      });
    }

    // Recherche phrase complète si tokens vides mais raw présent
    // (ex. référence exacte d’un seul caractère filtré, ou phrase brand-only déjà couverte)
    if (
      interpreted.tokens.length === 0 &&
      interpreted.raw &&
      !interpreted.marque
    ) {
      and.push({
        OR: tokenFieldOr(interpreted.raw),
      });
    }

    if (fallbackPrixMagasin) {
      and.push({
        OR: [
          { prixWeb: { gt: 0 } },
          { AND: [{ prixWeb: null }, { prixUnitaire: { gt: 0 } }] },
        ],
      });
    } else {
      and.push({ prixWeb: { gt: 0 } });
    }

    return { AND: and };
  }

  async getBySlug(slug: string) {
    const params = await this.shopBase.assertShopActif();
    const paramsPrix = this.shopBase.toParametresPrix(params);
    const produit = await this.prisma.produit.findFirst({
      where: { slug, actif: true, visibleWeb: true },
    });
    if (!produit) {
      throw new NotFoundException(`Produit "${slug}" introuvable.`);
    }

    const rootId = produit.parentId ?? produit.id;
    const family = await this.prisma.produit.findMany({
      where: {
        actif: true,
        visibleWeb: true,
        OR: [{ id: rootId }, { parentId: rootId }],
      },
      orderBy: [{ designation: 'asc' }],
    });

    const stockById = new Map<string, number | undefined>();
    if (params.entrepotWebDefautId) {
      await Promise.all(
        family.map(async (p) => {
          if (p.typeProduit !== 'ARTICLE') {
            stockById.set(p.id, undefined);
            return;
          }
          const qty = await this.stockService.getDisponible(
            p.id,
            params.entrepotWebDefautId!,
          );
          stockById.set(p.id, qty);
        }),
      );
    }

    const mappedFamily = family
      .map((p) => {
        const m = mapProduitCatalogue(p, paramsPrix, stockById.get(p.id));
        if (!m) return null;
        const attributsMap = parseAttributsMap(p.attributs);
        return {
          ...m,
          attributsMap,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    const current =
      mappedFamily.find((p) => p.id === produit.id) ??
      (() => {
        const m = mapProduitCatalogue(
          produit,
          paramsPrix,
          stockById.get(produit.id),
        );
        if (!m) return null;
        return { ...m, attributsMap: parseAttributsMap(produit.attributs) };
      })();

    if (!current) {
      throw new NotFoundException(`Produit "${slug}" non disponible en ligne.`);
    }

    const variantes = mappedFamily.filter((p) => p.id !== current.id);

    const stocksRetrait = await this.buildStocksRetrait(
      current.id,
      current.typeProduit,
      params,
    );

    return {
      ...current,
      variantes,
      stocksRetrait,
    };
  }

  private async buildStocksRetrait(
    produitId: string,
    typeProduit: string,
    params: Awaited<ReturnType<ShopBaseService['assertShopActif']>>,
  ) {
    if (typeProduit !== 'ARTICLE' || !params.retraitActif) return [];

    const boutiques = await this.prisma.boutique.findMany({
      where: { actif: true, retraitWebActif: true },
      select: { id: true, nom: true, entrepotWebId: true },
      orderBy: { nom: 'asc' },
    });

    const rows: Array<{
      boutiqueId: string;
      nom: string;
      disponible: number;
    }> = [];

    for (const boutique of boutiques) {
      const entrepotId =
        boutique.entrepotWebId ?? params.entrepotWebDefautId ?? null;
      if (!entrepotId) continue;
      rows.push({
        boutiqueId: boutique.id,
        nom: boutique.nom,
        disponible: await this.stockService.getDisponible(produitId, entrepotId),
      });
    }

    return rows;
  }

  async listBoutiquesRetrait() {
    const params = await this.shopBase.assertShopActif();
    if (!params.retraitActif) return [];
    return this.prisma.boutique.findMany({
      where: { actif: true, retraitWebActif: true },
      select: {
        id: true,
        nom: true,
        adresse: true,
        delaiRetraitHeures: true,
      },
      orderBy: { nom: 'asc' },
    });
  }

  async listZonesLivraison() {
    const params = await this.shopBase.assertShopActif();
    if (!params.livraisonActive) return [];
    return this.prisma.zoneLivraison.findMany({
      where: { actif: true },
      orderBy: { libelle: 'asc' },
    });
  }
}
