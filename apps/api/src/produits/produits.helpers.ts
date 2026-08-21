import { Prisma, type Produit } from '@prisma/client';

// Indicateurs catalogue dérivés des champs déjà en base (prix, CMP, stock,
// seuil) — aucune règle financière nouvelle : on expose le calcul que le
// reporting utilise déjà pour valoriser le stock (CMP × quantité).

export type StatutStock = 'RUPTURE' | 'SOUS_SEUIL' | 'OK';

export function statutStockOf(produit: {
  stock: number;
  seuilReappro: number | null;
}): StatutStock {
  if (produit.stock <= 0) {
    return 'RUPTURE';
  }
  if (produit.seuilReappro !== null && produit.stock <= produit.seuilReappro) {
    return 'SOUS_SEUIL';
  }
  return 'OK';
}

export function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export type ProduitEnrichi = Produit & {
  statutStock: StatutStock;
  margeUnitaire: string;
  tauxMarge: string;
  valeurStock: string;
};

export function enrichirProduit(produit: Produit): ProduitEnrichi {
  const prix = new Prisma.Decimal(produit.prixUnitaire);
  const cmp = new Prisma.Decimal(produit.coutMoyenPondere);
  const margeUnitaire = prix.minus(cmp);
  const tauxMarge = prix.greaterThan(0)
    ? margeUnitaire.div(prix).times(100)
    : new Prisma.Decimal(0);
  const valeurStock = cmp.times(produit.stock);

  return {
    ...produit,
    statutStock: statutStockOf(produit),
    margeUnitaire: money(margeUnitaire),
    tauxMarge: tauxMarge.toFixed(1),
    valeurStock: money(valeurStock),
  };
}

export function quantitePourSortirAlerte(produit: {
  stock: number;
  seuilReappro: number | null;
}): number {
  if (produit.seuilReappro === null) {
    return 0;
  }
  if (produit.stock > produit.seuilReappro) {
    return 0;
  }
  return produit.seuilReappro - produit.stock + 1;
}
