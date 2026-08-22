// Retour/avoir POS (partiel, ligne de vente) — port mobile du helper
// `quantiteRetournee` d'`apps/web/src/routes/PosPage.tsx`. Toute la
// validation métier (dejaRetourne + quantite <= ligne.quantite, calcul du
// remboursement pro-rata) vit côté serveur (`VentesService.creerRetour`) ;
// ce fichier ne fait qu'agréger côté client ce que le serveur a déjà validé
// pour afficher la quantité restante retournable par ligne.

export interface RetourVenteDto {
  id: string;
  venteId: string;
  ligneVenteId: string;
  quantite: number;
  montantRembourse: string;
  sessionCaisseId: string;
  utilisateurId: string;
  dateHeure: string;
}

/** Somme les quantités déjà retournées pour une ligne de vente donnée. */
export function quantiteRetournee(
  retours: RetourVenteDto[],
  ligneVenteId: string,
): number {
  return retours
    .filter((r) => r.ligneVenteId === ligneVenteId)
    .reduce((s, r) => s + r.quantite, 0);
}
