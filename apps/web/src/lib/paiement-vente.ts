import { ModePaiement } from '@caisse-crm/shared';
import type { PaiementVenteDto, RetourVenteDto, VenteDto } from './types';

const LIBELLE: Record<ModePaiement, string> = {
  [ModePaiement.ESPECES]: 'Espèces',
  [ModePaiement.CARTE]: 'Carte',
  [ModePaiement.MOBILE_MONEY]: 'Mobile money',
};

export function paiementsEffectifs(vente: {
  modePaiement: ModePaiement | string;
  montantTotal: string;
  paiements?: PaiementVenteDto[];
}): { modePaiement: ModePaiement; montant: number }[] {
  if (vente.paiements && vente.paiements.length > 0) {
    return vente.paiements.map((p) => ({
      modePaiement: p.modePaiement,
      montant: Number(p.montant),
    }));
  }
  return [
    {
      modePaiement: vente.modePaiement as ModePaiement,
      montant: Number(vente.montantTotal),
    },
  ];
}

export function libellePaiements(vente: {
  modePaiement: ModePaiement | string;
  montantTotal: string;
  paiements?: PaiementVenteDto[];
}): string {
  const parts = paiementsEffectifs(vente);
  if (parts.length === 1) {
    return LIBELLE[parts[0]!.modePaiement] ?? parts[0]!.modePaiement;
  }
  return parts
    .map(
      (p) =>
        `${LIBELLE[p.modePaiement] ?? p.modePaiement} ${Math.round(p.montant).toLocaleString('fr-FR')}`,
    )
    .join(' + ');
}

export function partEspeces(vente: {
  modePaiement: ModePaiement | string;
  montantTotal: string;
  paiements?: PaiementVenteDto[];
}): number {
  return (
    paiementsEffectifs(vente).find((p) => p.modePaiement === ModePaiement.ESPECES)
      ?.montant ?? 0
  );
}

/** Même règle que VentesService.calculerReleve : le retour diminue d’abord les espèces. */
export function debitEspecesRetours(
  ventes: Array<{
    id: string;
    modePaiement: ModePaiement | string;
    montantTotal: string;
    paiements?: PaiementVenteDto[];
  }>,
  retours: RetourVenteDto[],
): number {
  let total = 0;
  for (const vente of ventes) {
    const especes = partEspeces(vente);
    const rembourse = retours
      .filter((r) => r.venteId === vente.id)
      .reduce((s, r) => s + Number(r.montantRembourse), 0);
    total += Math.min(especes, rembourse);
  }
  return total;
}

export function csvModesPaiement(vente: {
  modePaiement: ModePaiement | string;
  paiements?: { modePaiement: string; montant: unknown }[];
}): string {
  if (vente.paiements && vente.paiements.length > 0) {
    return vente.paiements
      .map((p) => `${p.modePaiement} ${String(p.montant)}`)
      .join(' + ');
  }
  return String(vente.modePaiement);
}

export type { VenteDto };
