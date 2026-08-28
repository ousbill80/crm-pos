export interface RecommandationAchatInput {
  ventesQuantite: number;
  fenetreJours: number;
  stockCourant: number;
  stockReserve: number;
  stockEnTransit: number;
  stockMin: number;
  stockMax: number;
  delaiFournisseurJours: number;
}

export interface RecommandationAchatResult {
  ventesMoyennesParJour: number;
  demandePendantDelai: number;
  stockDisponible: number;
  stockProjeteALivraison: number;
  quantiteRecommandee: number;
  formule: string;
  declencheur: 'STOCK_PROJETE_INFERIEUR_OU_EGAL_AU_MIN' | 'AUCUN_BESOIN';
}

const FORMULE =
  'max(0, stockMax - max(0, stockCourant - stockReserve + stockEnTransit - ceil(ventesMoyennesParJour × delaiFournisseurJours)))';

export function calculerRecommandationAchat(
  input: RecommandationAchatInput,
): RecommandationAchatResult {
  if (input.fenetreJours <= 0 || input.delaiFournisseurJours < 0) {
    throw new Error('Fenêtre et délai fournisseur invalides.');
  }
  if (
    input.stockMin < 0 ||
    input.stockMax < input.stockMin ||
    input.stockCourant < 0 ||
    input.stockReserve < 0 ||
    input.stockEnTransit < 0 ||
    input.ventesQuantite < 0
  ) {
    throw new Error('Données de stock ou de vente invalides.');
  }

  const ventesMoyennesParJour =
    Math.round((input.ventesQuantite / input.fenetreJours) * 10000) / 10000;
  const demandePendantDelai = Math.ceil(
    ventesMoyennesParJour * input.delaiFournisseurJours,
  );
  const stockDisponible = Math.max(0, input.stockCourant - input.stockReserve);
  const stockProjeteALivraison = Math.max(
    0,
    stockDisponible + input.stockEnTransit - demandePendantDelai,
  );
  const besoin = stockProjeteALivraison <= input.stockMin;

  return {
    ventesMoyennesParJour,
    demandePendantDelai,
    stockDisponible,
    stockProjeteALivraison,
    quantiteRecommandee: besoin
      ? Math.max(0, input.stockMax - stockProjeteALivraison)
      : 0,
    formule: FORMULE,
    declencheur: besoin
      ? 'STOCK_PROJETE_INFERIEUR_OU_EGAL_AU_MIN'
      : 'AUCUN_BESOIN',
  };
}
