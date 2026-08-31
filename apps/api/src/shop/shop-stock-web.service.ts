import { Injectable } from '@nestjs/common';
import type { ParametreShop } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';

type ShopStockParams = Pick<
  ParametreShop,
  'entrepotWebDefautId' | 'retraitActif'
>;

/**
 * Stock web commandable : entrepôt hub, plafonné par le max des boutiques retrait
 * quand le retrait est actif (min hub, max retrait).
 * Évite d'ajouter au panier un article disponible au hub mais en rupture en boutique.
 */
@Injectable()
export class ShopStockWebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  async listEntrepotsRetraitWeb(): Promise<string[]> {
    const boutiques = await this.prisma.boutique.findMany({
      where: {
        actif: true,
        retraitWebActif: true,
        entrepotWebId: { not: null },
      },
      select: { entrepotWebId: true },
    });
    return boutiques
      .map((b) => b.entrepotWebId)
      .filter((id): id is string => Boolean(id));
  }

  async getStockWebDisponible(
    produitId: string,
    typeProduit: string,
    params: ShopStockParams,
    retraitEntrepotIds?: string[],
  ): Promise<number | undefined> {
    if (typeProduit !== 'ARTICLE') return undefined;
    if (!params.entrepotWebDefautId) return undefined;

    const hub = await this.stockService.getDisponible(
      produitId,
      params.entrepotWebDefautId,
    );

    if (!params.retraitActif) return hub;

    const retraitIds =
      retraitEntrepotIds ?? (await this.listEntrepotsRetraitWeb());
    if (!retraitIds.length) return hub;

    let maxRetrait = 0;
    for (const entrepotId of retraitIds) {
      const d = await this.stockService.getDisponible(produitId, entrepotId);
      maxRetrait = Math.max(maxRetrait, d);
    }

    return Math.min(hub, maxRetrait);
  }
}
