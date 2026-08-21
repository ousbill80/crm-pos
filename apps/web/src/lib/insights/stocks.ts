import type { Insight } from './types';
import type { SanteStock, StatutStockLigne } from '../types';

// Interprétation quantité vs seuil de réapprovisionnement — partagée par
// StocksPage (matrice/vue filtrée par entrepôt) et ProduitsPage (stock réseau).
export function insightStockQuantite(quantite: number, seuil: number | null): Insight {
  if (seuil === null) {
    return {
      title: 'Quantité en stock',
      interpretation:
        quantite > 0
          ? `${quantite} unité(s) en stock. Aucun seuil de réapprovisionnement défini pour ce produit.`
          : 'Aucune unité en stock. Aucun seuil de réapprovisionnement défini pour ce produit.',
      recommendation:
        quantite === 0
          ? 'Définir un seuil de réapprovisionnement pour être alerté automatiquement à l\'avenir.'
          : undefined,
      severity: quantite === 0 ? 'warning' : 'neutral',
    };
  }
  if (quantite <= 0) {
    return {
      title: 'Rupture de stock',
      interpretation: `Stock à 0 unité — rupture, alors que le seuil de réapprovisionnement est fixé à ${seuil}.`,
      recommendation:
        'Déclencher un réapprovisionnement ou un transfert depuis un autre entrepôt en urgence.',
      severity: 'critical',
    };
  }
  if (quantite <= seuil) {
    return {
      title: 'Stock sous le seuil',
      interpretation: `${quantite} unité(s) en stock, à ou en dessous du seuil de réapprovisionnement (${seuil}).`,
      recommendation: 'Planifier un réapprovisionnement avant la rupture.',
      severity: 'warning',
    };
  }
  return {
    title: 'Stock suffisant',
    interpretation: `${quantite} unité(s) en stock, au-dessus du seuil de réapprovisionnement (${seuil}).`,
    severity: 'ok',
  };
}

export function insightSanteStock(
  sante: SanteStock,
  ruptures: number,
  sousSeuil: number,
): Insight {
  if (sante === 'CRITIQUE') {
    return {
      title: 'Santé inventaire',
      interpretation: `${ruptures} emplacement(s) en rupture. Les ventes POS seront refusées sur ces articles tant que le stock n'est pas reconstitué.`,
      recommendation:
        'Traiter d\'abord les suggestions de transfert interne, puis une réception fournisseur si le réseau est à sec.',
      severity: 'critical',
    };
  }
  if (sante === 'VIGILANCE') {
    return {
      title: 'Santé inventaire',
      interpretation: `${sousSeuil} emplacement(s) sous le seuil de réapprovisionnement, aucune rupture.`,
      recommendation: 'Anticiper un transfert ou une réception avant la rupture.',
      severity: 'warning',
    };
  }
  return {
    title: 'Santé inventaire',
    interpretation: 'Aucun emplacement en rupture ni sous le seuil sur le périmètre affiché.',
    severity: 'ok',
  };
}

export function insightValorisationVide(unites: number, sku: number): Insight {
  return {
    title: 'Valorisation au CMP',
    interpretation:
      unites > 0
        ? `${unites} unité(s) sur ${sku} référence(s), mais le coût moyen pondéré est à 0 (aucune réception fournisseur enregistrée). La valorisation reste nulle tant qu’un prix d’achat n’a pas été reçu.`
        : 'Aucun stock à valoriser sur le périmètre affiché.',
    recommendation:
      unites > 0
        ? 'Enregistrer une réception fournisseur pour initialiser le CMP — le stock n’est pas saisi à la main.'
        : undefined,
    severity: unites > 0 ? 'warning' : 'neutral',
  };
}

export function insightValeurInventaire(
  valeurStock: string,
  unites: number,
  sku: number,
): Insight {
  return {
    title: 'Valorisation au CMP',
    interpretation: `${valeurStock} FCFA de stock valorisé au coût moyen pondéré, sur ${unites} unité(s) et ${sku} référence(s). Le CMP est recalculé à chaque réception fournisseur — ce n'est pas un prix de vente.`,
    severity: 'neutral',
  };
}

export function insightCouvertureJours(
  couverture: number | null,
  fenetreJours: number,
  ventesUnites?: number,
): Insight {
  if (couverture === null) {
    return {
      title: 'Couverture de stock',
      interpretation: `Aucune vente sur ${fenetreJours} jours pour cette référence : la couverture ne peut pas être estimée (pas de cadence).`,
      severity: 'neutral',
    };
  }
  const critique = couverture < 7;
  const vigilance = couverture < 14;
  return {
    title: 'Couverture de stock',
    interpretation: `Au rythme des ${ventesUnites ?? '—'} unité(s) vendue(s) sur ${fenetreJours} jours, le stock actuel couvre environ ${couverture} jour(s).`,
    recommendation: critique
      ? 'Couverture inférieure à 7 jours : prioriser un transfert ou une réception.'
      : vigilance
        ? 'Couverture inférieure à 14 jours : planifier le réapprovisionnement.'
        : undefined,
    severity: critique ? 'critical' : vigilance ? 'warning' : 'ok',
  };
}

export function insightSuggestionTransfert(
  designation: string,
  quantite: number,
  source: string,
  dest: string,
  destStatut: StatutStockLigne,
): Insight {
  return {
    title: 'Transfert suggéré',
    interpretation: `${quantite} unité(s) de « ${designation} » de ${source} vers ${dest} (${destStatut === 'RUPTURE' ? 'rupture' : 'sous le seuil'}). Suggestion calculée pour reconstituer le seuil destination sans descendre la source sous le sien.`,
    recommendation:
      'Vérifier la quantité disponible puis exécuter le transfert — rien n\'est déplacé tant que vous ne validez pas.',
    severity: destStatut === 'RUPTURE' ? 'critical' : 'warning',
  };
}
