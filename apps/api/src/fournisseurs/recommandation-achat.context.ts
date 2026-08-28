import { StatutCommandeAchat } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { calculerRecommandationAchat } from './recommandation-achat.calculator';

const STATUTS_EN_TRANSIT: StatutCommandeAchat[] = [
  StatutCommandeAchat.EXPEDIEE,
  StatutCommandeAchat.EN_TRANSIT,
  StatutCommandeAchat.EN_DOUANE,
  StatutCommandeAchat.DEDOUANEE,
];

export type PrismaRecommandation = Pick<
  PrismaService,
  | 'stockQuant'
  | 'reservationStock'
  | 'ligneVente'
  | 'ligneCommandeAchat'
  | 'receptionStock'
>;

export interface HistoriqueFournisseurDelai {
  fournisseurId: string;
  fournisseur: string;
  receptionsObservees: number;
  delaiMoyenJours: number;
}

export interface DonneesRecommandationAchat {
  ventesQuantite: number;
  stockCourant: number;
  stockReserve: number;
  stockEnTransit: number;
  delaiMoyenJours: number | null;
  fournisseurIdPrefere: string | null;
  fournisseurNomPrefere: string | null;
  historiqueFournisseurs: HistoriqueFournisseurDelai[];
}

/** Charge ventes nettes, stocks, transit et délai fournisseur réel (aucune invention). */
export async function chargerDonneesRecommandationAchat(
  prisma: PrismaRecommandation,
  params: {
    produitId: string;
    entrepotId: string;
    boutiqueId: string | null;
    fenetreJours: number;
  },
): Promise<DonneesRecommandationAchat> {
  const depuis = new Date();
  depuis.setUTCDate(depuis.getUTCDate() - params.fenetreJours);

  type LigneVenteNet = {
    quantite: number;
    retours: Array<{ quantite: number }>;
  };
  type LigneTransit = {
    quantite: number;
    receptions: Array<{ quantite: number }>;
  };

  const [quant, reservations, ventes, commandesTransit, receptionsHistoriques] =
    await Promise.all([
      prisma.stockQuant.findUnique({
        where: {
          produitId_entrepotId: {
            produitId: params.produitId,
            entrepotId: params.entrepotId,
          },
        },
        select: { quantite: true },
      }),
      prisma.reservationStock.aggregate({
        where: {
          produitId: params.produitId,
          entrepotId: params.entrepotId,
        },
        _sum: { quantite: true },
      }),
      params.boutiqueId
        ? prisma.ligneVente.findMany({
            where: {
              produitId: params.produitId,
              vente: {
                dateVente: { gte: depuis },
                caisse: { boutiqueId: params.boutiqueId },
              },
            },
            select: {
              quantite: true,
              retours: { select: { quantite: true } },
            },
          })
        : Promise.resolve([] as LigneVenteNet[]),
      (params.boutiqueId
        ? prisma.ligneCommandeAchat.findMany({
            where: {
              produitId: params.produitId,
              commande: {
                boutiqueId: params.boutiqueId,
                statut: { in: STATUTS_EN_TRANSIT },
              },
            },
            select: {
              quantite: true,
              receptions: { select: { quantite: true } },
            },
          })
        : prisma.ligneCommandeAchat.findMany({
            where: {
              produitId: params.produitId,
              commande: {
                statut: { in: STATUTS_EN_TRANSIT },
              },
            },
            select: {
              quantite: true,
              receptions: { select: { quantite: true } },
            },
          })) as Promise<LigneTransit[]>,
      prisma.receptionStock.findMany({
        where: {
          produitId: params.produitId,
          commandeId: { not: null },
        },
        select: {
          dateReception: true,
          fournisseur: { select: { id: true, nom: true } },
          commande: { select: { dateCommande: true } },
        },
        orderBy: { dateReception: 'desc' },
        take: 100,
      }),
    ]);

  const ventesQuantite = ventes.reduce(
    (total, ligne) =>
      total +
      Math.max(
        0,
        ligne.quantite -
          ligne.retours.reduce(
            (retours, retour) => retours + retour.quantite,
            0,
          ),
      ),
    0,
  );
  const stockEnTransit = commandesTransit.reduce(
    (total, ligne) =>
      total +
      Math.max(
        0,
        ligne.quantite -
          ligne.receptions.reduce(
            (recu, reception) => recu + reception.quantite,
            0,
          ),
      ),
    0,
  );

  const delaisParFournisseur = new Map<
    string,
    { fournisseurId: string; fournisseur: string; delais: number[] }
  >();
  for (const reception of receptionsHistoriques) {
    if (!reception.commande) continue;
    const delai = Math.max(
      0,
      Math.ceil(
        (reception.dateReception.getTime() -
          reception.commande.dateCommande.getTime()) /
          86_400_000,
      ),
    );
    const courant = delaisParFournisseur.get(reception.fournisseur.id) ?? {
      fournisseurId: reception.fournisseur.id,
      fournisseur: reception.fournisseur.nom,
      delais: [],
    };
    courant.delais.push(delai);
    delaisParFournisseur.set(reception.fournisseur.id, courant);
  }

  const historiqueFournisseurs: HistoriqueFournisseurDelai[] = [
    ...delaisParFournisseur.values(),
  ].map((historique) => ({
    fournisseurId: historique.fournisseurId,
    fournisseur: historique.fournisseur,
    receptionsObservees: historique.delais.length,
    delaiMoyenJours: Math.ceil(
      historique.delais.reduce((somme, delai) => somme + delai, 0) /
        historique.delais.length,
    ),
  }));

  historiqueFournisseurs.sort(
    (a, b) => b.receptionsObservees - a.receptionsObservees,
  );
  const prefere = historiqueFournisseurs[0] ?? null;

  return {
    ventesQuantite,
    stockCourant: quant?.quantite ?? 0,
    stockReserve: reservations._sum.quantite ?? 0,
    stockEnTransit,
    delaiMoyenJours: prefere?.delaiMoyenJours ?? null,
    fournisseurIdPrefere: prefere?.fournisseurId ?? null,
    fournisseurNomPrefere: prefere?.fournisseur ?? null,
    historiqueFournisseurs,
  };
}

/** Répartit le besoin entre transfert hub et achat fournisseur. */
export function repartirBesoinReappro(
  besoin: number,
  dispoCentral: number,
): {
  quantiteTransfert: number;
  quantiteAchat: number;
  route: 'TRANSFERER' | 'ACHETER' | 'MIXTE';
} {
  const quantiteTransfert = Math.min(besoin, Math.max(0, dispoCentral));
  const quantiteAchat = Math.max(0, besoin - quantiteTransfert);
  return {
    quantiteTransfert,
    quantiteAchat,
    route:
      quantiteTransfert > 0 && quantiteAchat > 0
        ? 'MIXTE'
        : quantiteAchat > 0
          ? 'ACHETER'
          : 'TRANSFERER',
  };
}

/**
 * Quantité à couvrir pour le réappro intelligent.
 * Sans délai fournisseur observé : trou immédiat sous le min uniquement (pas d’achat inventé via délai).
 */
export function calculerBesoinReappro(params: {
  ventesQuantite: number;
  fenetreJours: number;
  stockCourant: number;
  stockReserve: number;
  stockEnTransit: number;
  stockMin: number;
  stockMax: number;
  delaiFournisseurJours: number | null;
}): {
  besoin: number;
  formule: string;
  declencheur: string;
  recommandation: ReturnType<typeof calculerRecommandationAchat> | null;
} {
  if (params.delaiFournisseurJours == null) {
    const stockDisponible = Math.max(
      0,
      params.stockCourant - params.stockReserve,
    );
    const sousMin = stockDisponible + params.stockEnTransit <= params.stockMin;
    const besoin = sousMin
      ? Math.max(0, params.stockMax - (stockDisponible + params.stockEnTransit))
      : 0;
    return {
      besoin,
      formule:
        'sans délai observé : max(0, stockMax - (stockCourant - stockReserve + stockEnTransit)) si projeté ≤ min',
      declencheur: sousMin
        ? 'STOCK_PROJETE_INFERIEUR_OU_EGAL_AU_MIN_SANS_DELAI'
        : 'AUCUN_BESOIN',
      recommandation: null,
    };
  }

  const recommandation = calculerRecommandationAchat({
    ventesQuantite: params.ventesQuantite,
    fenetreJours: params.fenetreJours,
    stockCourant: params.stockCourant,
    stockReserve: params.stockReserve,
    stockEnTransit: params.stockEnTransit,
    stockMin: params.stockMin,
    stockMax: params.stockMax,
    delaiFournisseurJours: params.delaiFournisseurJours,
  });
  return {
    besoin: recommandation.quantiteRecommandee,
    formule: recommandation.formule,
    declencheur: recommandation.declencheur,
    recommandation,
  };
}
