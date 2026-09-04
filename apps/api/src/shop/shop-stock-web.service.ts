import { Injectable } from '@nestjs/common';
import type { ParametreShop } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stocks/stock.service';

type ShopStockParams = Pick<
  ParametreShop,
  'entrepotWebDefautId' | 'retraitActif'
>;

export type BoutiqueRetraitWeb = {
  boutiqueId: string;
  nom: string;
  adresse: string;
  delaiRetraitHeures: number | null;
  entrepotId: string;
};

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

  /**
   * Boutiques click & collect : stock lu sur l’entrepôt web dédié, sinon
   * le PRINCIPAL du magasin — pas le hub réseau (sinon toutes les boutiques
   * affichent le même stock et une boutique nouvellement créée reste invisible).
   */
  async listBoutiquesRetraitAvecEntrepot(): Promise<BoutiqueRetraitWeb[]> {
    const boutiques = await this.prisma.boutique.findMany({
      where: { actif: true, retraitWebActif: true },
      select: {
        id: true,
        nom: true,
        adresse: true,
        delaiRetraitHeures: true,
        entrepotWebId: true,
        entrepots: {
          where: { code: 'PRINCIPAL', actif: true },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { nom: 'asc' },
    });
    return boutiques
      .map((b) => {
        const entrepotId = b.entrepotWebId ?? b.entrepots[0]?.id ?? null;
        if (!entrepotId) return null;
        return {
          boutiqueId: b.id,
          nom: b.nom,
          adresse: b.adresse,
          delaiRetraitHeures: b.delaiRetraitHeures,
          entrepotId,
        };
      })
      .filter((b): b is BoutiqueRetraitWeb => b != null);
  }

  async listEntrepotsRetraitWeb(): Promise<string[]> {
    const rows = await this.listBoutiquesRetraitAvecEntrepot();
    return [...new Set(rows.map((b) => b.entrepotId))];
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
