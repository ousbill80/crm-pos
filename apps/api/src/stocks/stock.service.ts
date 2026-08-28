import {
  BadRequestException,
  ForbiddenException,
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
    | 'TRANSFERT_IN'
    | 'SCRAP'
    | 'RETOUR_FOURNISSEUR';
  /** Delta signé : +entrée / −sortie (sauf AJUSTEMENT qui pose la quantité cible via ajuster()). */
  delta: number;
  utilisateurId: string;
  reference?: string;
  autoriserNegatif?: boolean;
  lotId?: string;
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

  async getQuantiteReservee(
    produitId: string,
    entrepotId: string,
    exceptHoldId?: string,
    tx?: Tx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const aggs = await client.reservationStock.aggregate({
      where: {
        produitId,
        entrepotId,
        ...(exceptHoldId ? { holdId: { not: exceptHoldId } } : {}),
      },
      _sum: { quantite: true },
    });
    return aggs._sum.quantite ?? 0;
  }

  /** Réservations e-commerce actives (non expirées). */
  async getQuantiteReserveeWeb(
    produitId: string,
    entrepotId: string,
    exceptHoldId?: string,
    tx?: Tx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const now = new Date();
    const aggs = await client.reservationWeb.aggregate({
      where: {
        produitId,
        entrepotId,
        expireAt: { gt: now },
        ...(exceptHoldId ? { holdId: { not: exceptHoldId } } : {}),
      },
      _sum: { quantite: true },
    });
    return aggs._sum.quantite ?? 0;
  }

  async getDisponible(
    produitId: string,
    entrepotId: string,
    exceptHoldId?: string,
    tx?: Tx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const quant = await client.stockQuant.findUnique({
      where: { produitId_entrepotId: { produitId, entrepotId } },
    });
    const physique = quant?.quantite ?? 0;
    const reservePos = await this.getQuantiteReservee(
      produitId,
      entrepotId,
      exceptHoldId,
      tx,
    );
    const reserveWeb = await this.getQuantiteReserveeWeb(
      produitId,
      entrepotId,
      exceptHoldId,
      tx,
    );
    return physique - reservePos - reserveWeb;
  }

  async trouverEntrepotPrincipalBoutique(boutiqueId: string): Promise<string> {
    const entrepot = await this.prisma.entrepot.findFirst({
      where: { boutiqueId, type: 'PRINCIPAL', actif: true, usage: 'STOCK' },
    });
    if (!entrepot) {
      throw new NotFoundException(
        `Aucun entrepôt PRINCIPAL actif pour la boutique ${boutiqueId}.`,
      );
    }
    return entrepot.id;
  }

  async trouverEntrepotCentralStock() {
    const entrepot = await this.prisma.entrepot.findFirst({
      where: { reseau: true, usage: 'STOCK', virtuel: false, actif: true },
    });
    if (!entrepot) {
      throw new NotFoundException(
        'Aucun entrepôt réseau STOCK : semez l’entrepôt central.',
      );
    }
    return entrepot;
  }

  async trouverEmplacementUsage(
    usage: 'STOCK' | 'ENTREE' | 'SORTIE' | 'PERTE' | 'FOURNISSEUR' | 'CLIENT',
    reseau = true,
  ) {
    const entrepot = await this.prisma.entrepot.findFirst({
      where: { usage, reseau, actif: true },
    });
    if (!entrepot) {
      throw new NotFoundException(
        `Aucun emplacement ${usage}${reseau ? ' réseau' : ''} actif.`,
      );
    }
    return entrepot;
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
    if (apres < 0 && !input.autoriserNegatif) {
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

    const lotId = await this.appliquerLotTx(tx, input, produit.strategieSortie);

    const somme = await tx.stockQuant.aggregate({
      where: {
        produitId: input.produitId,
        consignation: false,
        entrepot: { usage: 'STOCK', virtuel: false },
      },
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
        lotId,
      },
    });
  }

  private async appliquerLotTx(
    tx: Tx,
    input: AppliquerMouvementInput,
    strategie: 'FIFO' | 'FEFO',
  ): Promise<string | null> {
    let lotId = input.lotId ?? null;
    if (!lotId && input.delta < 0) {
      const lots = await tx.stockLot.findMany({
        where: {
          produitId: input.produitId,
          entrepotId: input.entrepotId,
          quantite: { gt: 0 },
        },
        include: { lot: true },
        orderBy:
          strategie === 'FEFO'
            ? { lot: { dateExpiration: 'asc' } }
            : { lot: { createdAt: 'asc' } },
      });
      let restant = -input.delta;
      for (const sl of lots) {
        if (restant <= 0) break;
        const pris = Math.min(sl.quantite, restant);
        await tx.stockLot.update({
          where: { id: sl.id },
          data: { quantite: sl.quantite - pris },
        });
        restant -= pris;
        lotId = sl.lotId;
      }
      return lotId;
    }
    if (!lotId) return null;
    const actuel = await tx.stockLot.findUnique({
      where: {
        produitId_entrepotId_lotId: {
          produitId: input.produitId,
          entrepotId: input.entrepotId,
          lotId,
        },
      },
    });
    const apresLot = (actuel?.quantite ?? 0) + input.delta;
    if (apresLot < 0 && !input.autoriserNegatif) {
      throw new BadRequestException('Quantité de lot insuffisante.');
    }
    await tx.stockLot.upsert({
      where: {
        produitId_entrepotId_lotId: {
          produitId: input.produitId,
          entrepotId: input.entrepotId,
          lotId,
        },
      },
      update: { quantite: apresLot },
      create: {
        produitId: input.produitId,
        entrepotId: input.entrepotId,
        lotId,
        quantite: apresLot,
      },
    });
    return lotId;
  }

  async listerQuants(filters: {
    entrepotId?: string;
    produitId?: string;
    entrepotIds?: string[];
  }): Promise<
    (StockQuant & {
      quantiteReservee: number;
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
    const quants = await this.prisma.stockQuant.findMany({
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
    const entrepotIds = [...new Set(quants.map((q) => q.entrepotId))];
    const reserves =
      entrepotIds.length === 0
        ? []
        : await this.prisma.reservationStock.groupBy({
            by: ['produitId', 'entrepotId'],
            where: {
              entrepotId: { in: entrepotIds },
              ...(filters.produitId ? { produitId: filters.produitId } : {}),
            },
            _sum: { quantite: true },
          });
    const reserveMap = new Map(
      reserves.map((r) => [
        `${r.produitId}:${r.entrepotId}`,
        r._sum.quantite ?? 0,
      ]),
    );
    return quants.map((q) => ({
      ...q,
      quantiteReservee: reserveMap.get(`${q.produitId}:${q.entrepotId}`) ?? 0,
    }));
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
        produit: { select: { designation: true, reference: true } },
        entrepot: { select: { code: true, nom: true } },
        utilisateur: { select: { prenom: true, nom: true } },
      },
      orderBy: { dateHeure: 'desc' },
      take: 200,
    });
  }

  async trouverMouvement(id: string, entrepotIds: string[]) {
    const mouvement = await this.prisma.mouvementStock.findUnique({
      where: { id },
      include: {
        produit: {
          select: { id: true, designation: true, reference: true },
        },
        entrepot: {
          select: {
            id: true,
            code: true,
            nom: true,
            boutique: { select: { nom: true } },
          },
        },
        utilisateur: {
          select: { id: true, prenom: true, nom: true, login: true },
        },
      },
    });
    if (!mouvement) {
      throw new NotFoundException(`Mouvement ${id} introuvable.`);
    }
    if (mouvement.entrepotId && !entrepotIds.includes(mouvement.entrepotId)) {
      throw new ForbiddenException('Mouvement hors périmètre.');
    }
    if (!mouvement.entrepotId && entrepotIds.length === 0) {
      throw new ForbiddenException('Mouvement hors périmètre.');
    }
    return mouvement;
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
        stockPrevu: unitesProduit,
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

    const prevuMap = await this.prevuReseauParProduit(
      lignes.map((l) => l.produitId),
    );
    for (const ligne of lignes) {
      const extra = prevuMap.get(ligne.produitId);
      ligne.stockPrevu =
        ligne.stockReseau - (extra?.reserve ?? 0) + (extra?.aRecevoir ?? 0);
    }

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

  private async prevuReseauParProduit(
    produitIds: string[],
  ): Promise<Map<string, { reserve: number; aRecevoir: number }>> {
    const map = new Map<string, { reserve: number; aRecevoir: number }>();
    if (produitIds.length === 0) return map;
    const [reserves, lignesPo] = await Promise.all([
      this.prisma.reservationStock.groupBy({
        by: ['produitId'],
        where: { produitId: { in: produitIds } },
        _sum: { quantite: true },
      }),
      this.prisma.ligneCommandeAchat.findMany({
        where: {
          produitId: { in: produitIds },
          commande: {
            statut: { in: ['CONFIRMEE', 'PARTIELLEMENT_RECEPTIONNEE'] },
          },
        },
        include: {
          receptions: { select: { quantite: true } },
          lignesReceptionAchat: { select: { quantiteRecue: true } },
          cloturesCourtes: { select: { quantiteAnnulee: true } },
        },
      }),
    ]);
    for (const id of produitIds) {
      map.set(id, { reserve: 0, aRecevoir: 0 });
    }
    for (const r of reserves) {
      const row = map.get(r.produitId);
      if (row) row.reserve = r._sum.quantite ?? 0;
    }
    for (const l of lignesPo) {
      const row = map.get(l.produitId);
      if (!row) continue;
      const recu = l.receptions.reduce((s, x) => s + x.quantite, 0);
      const recuP2p = l.lignesReceptionAchat.reduce(
        (s, x) => s + x.quantiteRecue,
        0,
      );
      const cloture = l.cloturesCourtes.reduce(
        (s, x) => s + x.quantiteAnnulee,
        0,
      );
      row.aRecevoir += Math.max(0, l.quantite - recu - recuP2p - cloture);
    }
    return map;
  }
}
