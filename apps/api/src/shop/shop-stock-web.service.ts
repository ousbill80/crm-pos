import { Injectable } from '@nestjs/common';
import type { ParametreShop } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';

type ShopStockParams = Pick<
  ParametreShop,
  'entrepotWebDefautId' | 'retraitActif'
>;

/**
 * Stock web commandable : entrepôt hub (livraison / préparation commande).
 * La disponibilité retrait par boutique est exposée séparément (stocksRetrait).
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

    return hub;
  }
}
