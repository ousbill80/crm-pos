import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type MouvementStock, type StockQuant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FENETRE_VENTES_JOURS,
  deficitStock,
  median,
  money,
  statutQuant,
  surplusStock,
  syntheseVide,
  worstStatut,
  type StatutStockLigne,
  type StockSyntheseDto,
} from './stock-synthese';

type Tx = Prisma.TransactionClient;

export interface AppliquerMouvementInput {
  produitId: string;
  entrepotId: string;
  type:
    | 'RECEPTION'
    | 'VENTE'
    | 'RETOUR'
    | 'AJUSTEMENT'
    | 'TRANSFERT_OUT'
    | 'TRANSFERT_IN';
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

  async ajuster(
    params: {
      produitId: string;
      entrepotId: string;
      quantiteComptee: number;
      utilisateurId: string;
      reference?: string;
    },
    tx?: Tx,
  ): Promise<MouvementStock> {
    if (params.quantiteComptee < 0) {
      throw new BadRequestException(
        'La quantité comptée ne peut pas être négative.',
      );
    }
    const run = async (client: Tx) => {
      const actuel = await this.getQuantiteTx(
        client,
        params.produitId,
        params.entrepotId,
      );
      const delta = params.quantiteComptee - actuel;
      return this.appliquerMouvementTx(client, {
        produitId: params.produitId,
        entrepotId: params.entrepotId,
        type: 'AJUSTEMENT',
        delta,
        utilisateurId: params.utilisateurId,
        reference: params.reference,
      });
    };
    if (tx) return run(tx);
    return this.prisma.$transaction((inner) => run(inner));
  }

  async transferer(params: {
    produitId: string;
    entrepotSourceId: string;
    entrepotDestId: string;
    quantite: number;
    utilisateurId: string;
  }): Promise<{ sortie: MouvementStock; entree: MouvementStock }> {
    if (params.quantite <= 0) {
      throw new BadRequestException(
        'La quantité à transférer doit être positive.',
      );
    }
    if (params.entrepotSourceId === params.entrepotDestId) {
      throw new BadRequestException(
        'Entrepôt source et destination identiques.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.entrepot.findUnique({
        where: { id: params.entrepotSourceId },
      });
      const dest = await tx.entrepot.findUnique({
        where: { id: params.entrepotDestId },
      });
      if (!source || !dest) {
        throw new NotFoundException(
          'Entrepôt source ou destination introuvable.',
        );
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
    const produit = await tx.produit.findUnique({
      where: { id: input.produitId },
    });
    if (!produit) {
      throw new NotFoundException(`Produit ${input.produitId} introuvable.`);
    }
    const entrepot = await tx.entrepot.findUnique({
      where: { id: input.entrepotId },
    });
    if (!entrepot || !entrepot.actif) {
      throw new NotFoundException(
        `Entrepôt ${input.entrepotId} introuvable ou inactif.`,
      );
    }

    const actuel = await this.getQuantiteTx(
      tx,
      input.produitId,
      input.entrepotId,
    );
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
  }): Promise<
    (StockQuant & {
      produit: {
        designation: string;
        seuilReappro: number | null;
        coutMoyenPondere: Prisma.Decimal;
        prixUnitaire: Prisma.Decimal;
        stock: number;
      };
      entrepot: {
        nom: string;
        code: string;
        boutiqueId: string;
        boutique: { nom: string };
      };
    })[]
  > {
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
        produit: {
          select: {
            designation: true,
            seuilReappro: true,
            coutMoyenPondere: true,
            prixUnitaire: true,
            stock: true,
          },
        },
        entrepot: {
          select: {
            nom: true,
            code: true,
            boutiqueId: true,
            boutique: { select: { nom: true } },
          },
        },
      },
      orderBy: [
        { entrepot: { nom: 'asc' } },
        { produit: { designation: 'asc' } },
      ],
    });
  }

  async listerMouvements(filters: {
    produitId?: string;
    entrepotId?: string;
    entrepotIds?: string[];
  }) {
    return this.prisma.mouvementStock.findMany({
      where: {
        ...(filters.produitId ? { produitId: filters.produitId } : {}),
        ...(filters.entrepotId
          ? { entrepotId: filters.entrepotId }
          : filters.entrepotIds
            ? {
                OR: [
                  { entrepotId: { in: filters.entrepotIds } },
                  { entrepotId: null },
                ],
              }
            : {}),
      },
      include: {
        produit: { select: { designation: true } },
        entrepot: { select: { code: true, nom: true } },
        utilisateur: { select: { prenom: true, nom: true } },
      },
      orderBy: { dateHeure: 'desc' },
      take: 200,
    });
  }

  /**
   * Cockpit inventaire : valorisation CMP, couverture (ventes 14 j),
   * suggestions de transfert interne. Lecture seule — n'écrit jamais
   * StockQuant / Produit.stock (grand livre append-only).
   */
  async synthese(entrepotIds: string[]): Promise<StockSyntheseDto> {
    if (entrepotIds.length === 0) {
      return syntheseVide();
    }

    const [entrepots, quants, ventes] = await Promise.all([
      this.prisma.entrepot.findMany({
        where: { id: { in: entrepotIds } },
        include: { boutique: { select: { nom: true } } },
        orderBy: [{ boutique: { nom: 'asc' } }, { nom: 'asc' }],
      }),
      this.prisma.stockQuant.findMany({
        where: { entrepotId: { in: entrepotIds } },
        include: {
          produit: {
            select: {
              designation: true,
              reference: true,
              categorie: true,
              actif: true,
              seuilReappro: true,
              coutMoyenPondere: true,
              stock: true,
            },
          },
        },
      }),
      this.prisma.mouvementStock.groupBy({
        by: ['produitId'],
        where: {
          type: 'VENTE',
          dateHeure: {
            gte: new Date(
              Date.now() - FENETRE_VENTES_JOURS * 24 * 60 * 60 * 1000,
            ),
          },
          OR: [{ entrepotId: { in: entrepotIds } }, { entrepotId: null }],
        },
        _sum: { quantite: true },
      }),
    ]);

    const ventesParProduit = new Map<string, number>();
    for (const row of ventes) {
      ventesParProduit.set(row.produitId, Math.abs(row._sum.quantite ?? 0));
    }

    type AggProduit = {
      designation: string;
      reference: string | null;
      categorie: string | null;
      actif: boolean;
      seuilReappro: number | null;
      coutMoyenPondere: Prisma.Decimal;
      stockReseau: number;
      parEntrepot: Map<string, number>;
    };
    const parProduit = new Map<string, AggProduit>();
    for (const q of quants) {
      const row = parProduit.get(q.produitId) ?? {
        designation: q.produit.designation,
        reference: q.produit.reference,
        categorie: q.produit.categorie,
        actif: q.produit.actif,
        seuilReappro: q.produit.seuilReappro,
        coutMoyenPondere: q.produit.coutMoyenPondere,
        stockReseau: q.produit.stock,
        parEntrepot: new Map<string, number>(),
      };
      row.parEntrepot.set(q.entrepotId, q.quantite);
      parProduit.set(q.produitId, row);
    }

    const zero = new Prisma.Decimal(0);
    let unitesTotales = 0;
    let valeurTotale = zero;
    let ruptures = 0;
    let sousSeuil = 0;

    const parEntrepotStats = new Map<
      string,
      {
        unites: number;
        valeur: Prisma.Decimal;
        ruptures: number;
        sousSeuil: number;
      }
    >();
    for (const e of entrepots) {
      parEntrepotStats.set(e.id, {
        unites: 0,
        valeur: zero,
        ruptures: 0,
        sousSeuil: 0,
      });
    }

    const lignes: StockSyntheseDto['lignes'] = [];
    const suggestions: StockSyntheseDto['suggestionsTransfert'] = [];
    const reappros: StockSyntheseDto['suggestionsReappro'] = [];
    const couvertures: number[] = [];

    for (const [produitId, agg] of parProduit) {
      let statutProduit: StatutStockLigne = 'OK';
      let unitesProduit = 0;
      let valeurProduit = zero;
      const cellules: StockSyntheseDto['lignes'][number]['parEntrepot'] = [];

      for (const e of entrepots) {
        if (!agg.parEntrepot.has(e.id)) continue;
        const quantite = agg.parEntrepot.get(e.id) ?? 0;
        const statut = statutQuant(quantite, agg.seuilReappro);
        statutProduit = worstStatut(statutProduit, statut);
        unitesProduit += quantite;
        const valeurCellule = agg.coutMoyenPondere.mul(quantite);
        valeurProduit = valeurProduit.plus(valeurCellule);
        cellules.push({ entrepotId: e.id, quantite, statut });

        const stats = parEntrepotStats.get(e.id);
        if (stats) {
          stats.unites += quantite;
          stats.valeur = stats.valeur.plus(valeurCellule);
          if (agg.actif && statut === 'RUPTURE') stats.ruptures += 1;
          if (agg.actif && statut === 'SOUS_SEUIL') stats.sousSeuil += 1;
        }
        if (agg.actif && statut === 'RUPTURE') ruptures += 1;
        if (agg.actif && statut === 'SOUS_SEUIL') sousSeuil += 1;
      }

      unitesTotales += unitesProduit;
      valeurTotale = valeurTotale.plus(valeurProduit);

      const ventesUnites14j = ventesParProduit.get(produitId) ?? 0;
      const cadenceJour = ventesUnites14j / FENETRE_VENTES_JOURS;
      const couvertureJours =
        cadenceJour > 0
          ? Math.round((unitesProduit / cadenceJour) * 10) / 10
          : null;
      if (agg.actif && couvertureJours !== null)
        couvertures.push(couvertureJours);

      lignes.push({
        produitId,
        designation: agg.designation,
        reference: agg.reference,
        categorie: agg.categorie,
        actif: agg.actif,
        seuilReappro: agg.seuilReappro,
        coutMoyenPondere: money(agg.coutMoyenPondere),
        stockReseau: unitesProduit,
        valeur: money(valeurProduit),
        ventesUnites14j,
        couvertureJours,
        statut: statutProduit,
        parEntrepot: cellules,
      });

      const besoins = cellules
        .map((c) => {
          const entrepot = entrepots.find((e) => e.id === c.entrepotId);
          return {
            ...c,
            code: entrepot?.code ?? '',
            besoin: deficitStock(c.quantite, agg.seuilReappro),
          };
        })
        .filter((c) => c.besoin > 0)
        .sort((a, b) => {
          if (a.statut !== b.statut) {
            return a.statut === 'RUPTURE' ? -1 : 1;
          }
          return b.besoin - a.besoin;
        });
      const sources = cellules
        .map((c) => {
          const entrepot = entrepots.find((e) => e.id === c.entrepotId);
          return {
            ...c,
            code: entrepot?.code ?? '',
            dispo: surplusStock(c.quantite, agg.seuilReappro),
          };
        })
        .filter((c) => c.dispo > 0)
        .sort((a, b) => b.dispo - a.dispo);

      const dest = besoins[0];
      const source = sources.find((s) => s.entrepotId !== dest?.entrepotId);
      let transfere = false;
      if (agg.actif && dest && source) {
        const quantiteSuggeree = Math.min(source.dispo, dest.besoin);
        if (quantiteSuggeree > 0) {
          transfere = true;
          suggestions.push({
            produitId,
            designation: agg.designation,
            entrepotSourceId: source.entrepotId,
            sourceCode: source.code,
            sourceQuantite: source.quantite,
            entrepotDestId: dest.entrepotId,
            destCode: dest.code,
            destQuantite: dest.quantite,
            destStatut: dest.statut,
            quantiteSuggeree,
            motif:
              dest.statut === 'RUPTURE'
                ? `Rupture sur ${dest.code} — ${source.code} a un surplus de ${source.dispo} unité(s).`
                : `Sous le seuil sur ${dest.code} — transférer depuis ${source.code} sans descendre sous le seuil source.`,
          });
        }
      }
      if (agg.actif && dest && !transfere) {
        const deficit = besoins.reduce((n, c) => n + c.besoin, 0);
        reappros.push({
          produitId,
          designation: agg.designation,
          reference: agg.reference,
          deficit,
          motif:
            dest.statut === 'RUPTURE'
              ? `Rupture réseau interne : aucun surplus transférable. Réception fournisseur de ${deficit} unité(s).`
              : `Sous le seuil, sans surplus interne. Réception fournisseur de ${deficit} unité(s).`,
        });
      }
    }

    lignes.sort((a, b) => {
      const rank: Record<StatutStockLigne, number> = {
        RUPTURE: 0,
        SOUS_SEUIL: 1,
        OK: 2,
      };
      if (rank[a.statut] !== rank[b.statut]) {
        return rank[a.statut] - rank[b.statut];
      }
      return a.designation.localeCompare(b.designation, 'fr');
    });

    const sante =
      ruptures > 0 ? 'CRITIQUE' : sousSeuil > 0 ? 'VIGILANCE' : 'OK';

    return {
      genereAt: new Date().toISOString(),
      fenetreVentesJours: FENETRE_VENTES_JOURS,
      sante,
      kpis: {
        skuDistincts: [...parProduit.values()].filter((p) => p.actif).length,
        unitesTotales,
        valeurStock: money(valeurTotale),
        ruptures,
        sousSeuil,
        couvertureJoursMediane: median(couvertures),
      },
      parEntrepot: entrepots.map((e) => {
        const stats = parEntrepotStats.get(e.id) ?? {
          unites: 0,
          valeur: zero,
          ruptures: 0,
          sousSeuil: 0,
        };
        return {
          entrepotId: e.id,
          code: e.code,
          nom: e.nom,
          boutiqueId: e.boutiqueId,
          nomBoutique: e.boutique.nom,
          unites: stats.unites,
          valeur: money(stats.valeur),
          ruptures: stats.ruptures,
          sousSeuil: stats.sousSeuil,
        };
      }),
      lignes,
      suggestionsTransfert: suggestions.slice(0, 20),
      suggestionsReappro: reappros.slice(0, 20),
    };
  }
}
