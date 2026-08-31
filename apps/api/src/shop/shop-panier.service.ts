import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculerLigneCommandeWeb,
  resoudrePrixProduitShop,
  ShopBaseService,
} from './shop-base.service';
import { signerPanierId, verifierPanierToken } from './shop-panier.token';
import type { PanierLigneDto } from './dto/shop-checkout.dto';
import { resoudreEntrepotWebId } from './entrepot-web.resolver';
import { ShopStockWebService } from './shop-stock-web.service';

@Injectable()
export class ShopPanierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopBase: ShopBaseService,
    private readonly config: ConfigService,
    private readonly shopStockWeb: ShopStockWebService,
  ) {}

  private panierSecret(): string {
    return (
      this.config.get<string>('SHOP_PANIER_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'dev-shop-panier-secret'
    );
  }

  async creerPanier(): Promise<{ panierId: string; token: string }> {
    const params = await this.shopBase.assertShopActif();
    if (!params.entrepotWebDefautId) {
      throw new BadRequestException('Entrepôt web par défaut non configuré.');
    }
    const panierId = randomUUID();
    await this.prisma.commandeWeb.create({
      data: {
        id: panierId,
        clientOperationId: randomUUID(),
        statut: 'PANIER',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PREPAYE_PSP',
        entrepotId: params.entrepotWebDefautId,
      },
    });
    return { panierId, token: signerPanierId(panierId, this.panierSecret()) };
  }

  async resolvePanier(token: string | undefined) {
    const panierId = verifierPanierToken(token, this.panierSecret());
    if (!panierId) {
      throw new BadRequestException('Panier invalide ou expiré.');
    }
    const panier = await this.prisma.commandeWeb.findUnique({
      where: { id: panierId },
      include: { lignes: true },
    });
    if (!panier || panier.statut !== 'PANIER') {
      throw new NotFoundException('Panier introuvable.');
    }
    return panier;
  }

  async getPanier(token: string | undefined) {
    const panier = await this.resolvePanier(token);
    const params = await this.shopBase.getParametresShop();
    return this.formatPanier(panier, params);
  }

  /** Enrichit les lignes (image, slug, stock) pour le drawer marketplace. */
  private async enrichLignesMeta(
    lignes: Array<{ produitId: string }>,
    entrepotId: string | null,
  ): Promise<
    Map<
      string,
      { imageUrl: string | null; slug: string | null; stockDisponible: number | null }
    >
  > {
    const ids = [...new Set(lignes.map((l) => l.produitId))];
    const map = new Map<
      string,
      { imageUrl: string | null; slug: string | null; stockDisponible: number | null }
    >();
    if (!ids.length) return map;

    const produits = await this.prisma.produit.findMany({
      where: { id: { in: ids } },
      select: { id: true, imageUrl: true, slug: true, typeProduit: true },
    });
    const stockByProduit = new Map<string, number>();
    if (entrepotId) {
      const params = await this.shopBase.getParametresShop();
      const retraitEntrepots = params.retraitActif
        ? await this.shopStockWeb.listEntrepotsRetraitWeb()
        : [];
      await Promise.all(
        produits.map(async (p) => {
          if (p.typeProduit !== 'ARTICLE') return;
          const qty = await this.shopStockWeb.getStockWebDisponible(
            p.id,
            p.typeProduit,
            params,
            retraitEntrepots,
          );
          if (qty != null) stockByProduit.set(p.id, qty);
        }),
      );
    }
    for (const p of produits) {
      map.set(p.id, {
        imageUrl: p.imageUrl,
        slug: p.slug,
        stockDisponible: stockByProduit.has(p.id)
          ? stockByProduit.get(p.id)!
          : null,
      });
    }
    return map;
  }

  async updateLignes(token: string | undefined, lignes: PanierLigneDto[]) {
    const panier = await this.resolvePanier(token);
    const params = await this.shopBase.assertShopActif();
    const paramsPrix = this.shopBase.toParametresPrix(params);

    if (!lignes.length) {
      await this.prisma.ligneCommandeWeb.deleteMany({
        where: { commandeWebId: panier.id },
      });
      return this.getPanier(token);
    }

    const produitIds = [...new Set(lignes.map((l) => l.produitId))];
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: produitIds }, actif: true, visibleWeb: true },
    });
    if (produits.length !== produitIds.length) {
      throw new BadRequestException('Un ou plusieurs produits sont invalides.');
    }

    const entrepotId = resoudreEntrepotWebId('LIVRAISON', {
      parametreShop: params,
    });
    if (!entrepotId) {
      throw new BadRequestException('Entrepôt web par défaut non configuré.');
    }

    const retraitEntrepots = params.retraitActif
      ? await this.shopStockWeb.listEntrepotsRetraitWeb()
      : [];

    for (const ligne of lignes) {
      const produit = produits.find((p) => p.id === ligne.produitId)!;
      if (produit.typeProduit !== 'ARTICLE') continue;
      const dispo = await this.shopStockWeb.getStockWebDisponible(
        produit.id,
        produit.typeProduit,
        params,
        retraitEntrepots,
      );
      if (dispo == null || dispo <= 0) {
        throw new BadRequestException(
          `« ${produit.designation} » est en rupture de stock.`,
        );
      }
      if (ligne.quantite > dispo) {
        throw new BadRequestException(
          `Stock insuffisant pour « ${produit.designation} » (disponible : ${dispo}).`,
        );
      }
    }

    const lignesData: Prisma.LigneCommandeWebCreateManyInput[] = [];
    let montantArticlesHt = 0;
    let montantTva = 0;
    let montantArticlesTtc = 0;

    for (const ligne of lignes) {
      if (ligne.quantite < 1) {
        throw new BadRequestException('Quantité invalide.');
      }
      const produit = produits.find((p) => p.id === ligne.produitId)!;
      const prix = resoudrePrixProduitShop(
        {
          prixWeb: produit.prixWeb ? Number(produit.prixWeb) : null,
          prixUnitaire: Number(produit.prixUnitaire),
          visibleWeb: produit.visibleWeb,
          tauxTva: produit.tauxTva ? Number(produit.tauxTva) : null,
          designation: produit.designation,
        },
        paramsPrix,
      );
      if (!prix) {
        throw new BadRequestException(
          `Produit "${produit.designation}" non disponible sur le web.`,
        );
      }
      const calc = calculerLigneCommandeWeb(ligne.quantite, prix);
      montantArticlesHt += calc.prixUnitaireHt * ligne.quantite;
      montantTva += calc.montantTvaLigne;
      montantArticlesTtc += calc.montantLigneTtc;
      lignesData.push({
        commandeWebId: panier.id,
        produitId: produit.id,
        quantite: ligne.quantite,
        prixUnitaireHt: calc.prixUnitaireHt,
        tauxTva: calc.tauxTva,
        montantTvaLigne: calc.montantTvaLigne,
        prixUnitaireTtc: calc.prixUnitaireTtc,
        designationSnapshot: produit.designation,
        referenceSnapshot: produit.reference,
      });
    }

    await this.prisma.$transaction([
      this.prisma.ligneCommandeWeb.deleteMany({
        where: { commandeWebId: panier.id },
      }),
      this.prisma.ligneCommandeWeb.createMany({ data: lignesData }),
      this.prisma.commandeWeb.update({
        where: { id: panier.id },
        data: {
          montantArticlesHt,
          montantTva,
          montantArticlesTtc,
          montantTotal: montantArticlesTtc,
          entrepotId,
        },
      }),
    ]);

    return this.getPanier(token);
  }

  private async formatPanier(
    panier: {
      id: string;
      entrepotId?: string | null;
      montantArticlesHt: Prisma.Decimal;
      montantTva: Prisma.Decimal;
      montantArticlesTtc: Prisma.Decimal;
      montantTotal: Prisma.Decimal;
      lignes: Array<{
        produitId: string;
        quantite: number;
        prixUnitaireHt: Prisma.Decimal;
        prixUnitaireTtc: Prisma.Decimal;
        designationSnapshot: string;
        referenceSnapshot: string | null;
      }>;
    },
    params: {
      modeAffichagePrix: string;
      dureeReservationPanierMin: number;
      entrepotWebDefautId?: string | null;
    },
  ) {
    const meta = await this.enrichLignesMeta(
      panier.lignes,
      panier.entrepotId ?? params.entrepotWebDefautId ?? null,
    );
    return {
      id: panier.id,
      lignes: panier.lignes.map((l) => {
        const m = meta.get(l.produitId);
        const prixTtc = Number(l.prixUnitaireTtc);
        return {
          produitId: l.produitId,
          quantite: l.quantite,
          designation: l.designationSnapshot,
          reference: l.referenceSnapshot,
          prixUnitaireHt: Number(l.prixUnitaireHt),
          prixUnitaireTtc: prixTtc,
          montantLigne: prixTtc * l.quantite,
          imageUrl: m?.imageUrl ?? null,
          slug: m?.slug ?? null,
          stockDisponible: m?.stockDisponible ?? null,
        };
      }),
      montantArticlesHt: Number(panier.montantArticlesHt),
      montantTva: Number(panier.montantTva),
      montantArticlesTtc: Number(panier.montantArticlesTtc),
      montantTotal: Number(panier.montantTotal),
      modeAffichage: params.modeAffichagePrix,
      ttlMinutes: params.dureeReservationPanierMin,
      articleCount: panier.lignes.reduce((s, l) => s + l.quantite, 0),
    };
  }
}
