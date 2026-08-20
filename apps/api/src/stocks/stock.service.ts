import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MouvementStock, Prisma, StockQuant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface AppliquerMouvementInput {
  produitId: string;
  entrepotId: string;
  type: 'RECEPTION' | 'VENTE' | 'RETOUR' | 'AJUSTEMENT' | 'TRANSFERT_OUT' | 'TRANSFERT_IN';
  /** Delta signé : +entrée / −sortie (sauf AJUSTEMENT qui pose la quantité cible via ajuster()). */
  delta: number;
  utilisateurId: string;
  reference?: string;
}

/**
 * Source unique de vérité stock multi-emplacement.
 * Mutate StockQuant + append MouvementStock + recalcule cache Produit.stock.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getQuantite(produitId: string, entrepotId: string): Promise<number> {
    const quant = await this.prisma.stockQuant.findUnique({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    return quant?.quantite ?? 0;
  }

  async trouverEntrepotPrincipalBoutique(boutiqueId: string): Promise<string> {
    const entrepot = await this.prisma.entrepot.findFirst({
      where: { boutiqueId, type: 'PRINCIPAL', actif: true },
    });
    if (!entrepot) {
      throw new NotFoundException(
        `Aucun entrepôt PRINCIPAL actif pour la boutique ${boutiqueId}.`,
      );
    }
    return entrepot.id;
  }

  async appliquerMouvement(
    input: AppliquerMouvementInput,
    tx?: Tx,
  ): Promise<MouvementStock> {
    if (tx) {
      return this.appliquerMouvementTx(tx, input);
    }
    return this.prisma.$transaction((inner) =>
      this.appliquerMouvementTx(inner, input),
    );
  }

  async ajuster(params: {
    produitId: string;
    entrepotId: string;
    quantiteComptee: number;
    utilisateurId: string;
    reference?: string;
  }): Promise<MouvementStock> {
    if (params.quantiteComptee < 0) {
      throw new BadRequestException('La quantité comptée ne peut pas être négative.');
    }
    return this.prisma.$transaction(async (tx) => {
      const actuel = await this.getQuantiteTx(tx, params.produitId, params.entrepotId);
      const delta = params.quantiteComptee - actuel;
      return this.appliquerMouvementTx(tx, {
        produitId: params.produitId,
        entrepotId: params.entrepotId,
        type: 'AJUSTEMENT',
        delta,
        utilisateurId: params.utilisateurId,
        reference: params.reference,
      });
    });
  }

  async transferer(params: {
    produitId: string;
    entrepotSourceId: string;
    entrepotDestId: string;
    quantite: number;
    utilisateurId: string;
  }): Promise<{ sortie: MouvementStock; entree: MouvementStock }> {
    if (params.quantite <= 0) {
      throw new BadRequestException('La quantité à transférer doit être positive.');
    }
    if (params.entrepotSourceId === params.entrepotDestId) {
      throw new BadRequestException('Entrepôt source et destination identiques.');
    }
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.entrepot.findUnique({
        where: { id: params.entrepotSourceId },
      });
      const dest = await tx.entrepot.findUnique({
        where: { id: params.entrepotDestId },
      });
      if (!source || !dest) {
        throw new NotFoundException('Entrepôt source ou destination introuvable.');
      }
      const ref = `TRF-${Date.now()}`;
      const sortie = await this.appliquerMouvementTx(tx, {
        produitId: params.produitId,
        entrepotId: params.entrepotSourceId,
        type: 'TRANSFERT_OUT',
        delta: -params.quantite,
        utilisateurId: params.utilisateurId,
        reference: ref,
      });
      const entree = await this.appliquerMouvementTx(tx, {
        produitId: params.produitId,
        entrepotId: params.entrepotDestId,
        type: 'TRANSFERT_IN',
        delta: params.quantite,
        utilisateurId: params.utilisateurId,
        reference: ref,
      });
      return { sortie, entree };
    });
  }

  private async getQuantiteTx(
    tx: Tx,
    produitId: string,
    entrepotId: string,
  ): Promise<number> {
    const quant = await tx.stockQuant.findUnique({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    return quant?.quantite ?? 0;
  }

  private async appliquerMouvementTx(
    tx: Tx,
    input: AppliquerMouvementInput,
  ): Promise<MouvementStock> {
    const produit = await tx.produit.findUnique({ where: { id: input.produitId } });
    if (!produit) {
      throw new NotFoundException(`Produit ${input.produitId} introuvable.`);
    }
    const entrepot = await tx.entrepot.findUnique({
      where: { id: input.entrepotId },
    });
    if (!entrepot || !entrepot.actif) {
      throw new NotFoundException(`Entrepôt ${input.entrepotId} introuvable ou inactif.`);
    }

    const actuel = await this.getQuantiteTx(tx, input.produitId, input.entrepotId);
    const apres = actuel + input.delta;
    if (apres < 0) {
      throw new BadRequestException(
        `Stock insuffisant pour "${produit.designation}" sur l'entrepôt ${entrepot.code} (disponible : ${actuel}, delta : ${input.delta}).`,
      );
    }

    await tx.stockQuant.upsert({
      where: {
        produitId_entrepotId: {
          produitId: input.produitId,
          entrepotId: input.entrepotId,
        },
      },
      update: { quantite: apres },
      create: {
        produitId: input.produitId,
        entrepotId: input.entrepotId,
        quantite: apres,
      },
    });

    const somme = await tx.stockQuant.aggregate({
      where: { produitId: input.produitId },
      _sum: { quantite: true },
    });
    await tx.produit.update({
      where: { id: input.produitId },
      data: { stock: somme._sum.quantite ?? 0 },
    });

    return tx.mouvementStock.create({
      data: {
        produitId: input.produitId,
        entrepotId: input.entrepotId,
        type: input.type,
        quantite: input.delta,
        stockApres: apres,
        reference: input.reference,
        utilisateurId: input.utilisateurId,
      },
    });
  }

  async listerQuants(filters: {
    entrepotId?: string;
    produitId?: string;
    entrepotIds?: string[];
  }): Promise<(StockQuant & { produit: { designation: string; seuilReappro: number | null }; entrepot: { nom: string; code: string; boutiqueId: string } })[]> {
    return this.prisma.stockQuant.findMany({
      where: {
        ...(filters.produitId ? { produitId: filters.produitId } : {}),
        ...(filters.entrepotId
          ? { entrepotId: filters.entrepotId }
          : filters.entrepotIds
            ? { entrepotId: { in: filters.entrepotIds } }
            : {}),
      },
      include: {
        produit: { select: { designation: true, seuilReappro: true } },
        entrepot: { select: { nom: true, code: true, boutiqueId: true } },
      },
      orderBy: [{ entrepot: { nom: 'asc' } }, { produit: { designation: 'asc' } }],
    });
  }
}
