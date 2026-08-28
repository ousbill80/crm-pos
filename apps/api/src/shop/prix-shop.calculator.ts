import {
  ModeAffichagePrixShop,
  type ModeAffichagePrixShop as ModeAffichagePrixShopType,
} from '@caisse-crm/shared';

export interface ParametresPrixShop {
  modeAffichagePrix: ModeAffichagePrixShopType;
  tauxTvaDefaut: number;
  fallbackPrixMagasin: boolean;
}

export interface ProduitPrixShopInput {
  prixWeb: number | null;
  prixUnitaire: number;
  visibleWeb: boolean;
  tauxTva: number | null;
  designation: string;
}

export interface PrixShopResolu {
  visible: boolean;
  prixUnitaireHt: number;
  tauxTva: number;
  prixUnitaireTtc: number;
  prixAffiche: number;
  modeAffichage: ModeAffichagePrixShopType;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculerTtc(ht: number, tauxTva: number): number {
  return round2(ht * (1 + tauxTva / 100));
}

export function resoudrePrixProduitShop(
  produit: ProduitPrixShopInput,
  params: ParametresPrixShop,
): PrixShopResolu | null {
  if (!produit.visibleWeb) {
    return null;
  }

  const baseHt =
    produit.prixWeb ??
    (params.fallbackPrixMagasin ? produit.prixUnitaire : null);

  if (baseHt == null || baseHt <= 0) {
    return null;
  }

  const tauxTva = produit.tauxTva ?? params.tauxTvaDefaut;
  const prixUnitaireHt = round2(baseHt);
  const prixUnitaireTtc = calculerTtc(prixUnitaireHt, tauxTva);
  const prixAffiche =
    params.modeAffichagePrix === ModeAffichagePrixShop.TTC
      ? prixUnitaireTtc
      : prixUnitaireHt;

  return {
    visible: true,
    prixUnitaireHt,
    tauxTva,
    prixUnitaireTtc,
    prixAffiche,
    modeAffichage: params.modeAffichagePrix,
  };
}

export function calculerLigneCommandeWeb(
  quantite: number,
  prix: PrixShopResolu,
): {
  prixUnitaireHt: number;
  tauxTva: number;
  montantTvaLigne: number;
  prixUnitaireTtc: number;
  montantLigneTtc: number;
} {
  const montantHt = round2(prix.prixUnitaireHt * quantite);
  const montantTtc = round2(prix.prixUnitaireTtc * quantite);
  const montantTvaLigne = round2(montantTtc - montantHt);

  return {
    prixUnitaireHt: prix.prixUnitaireHt,
    tauxTva: prix.tauxTva,
    montantTvaLigne,
    prixUnitaireTtc: prix.prixUnitaireTtc,
    montantLigneTtc: montantTtc,
  };
}
