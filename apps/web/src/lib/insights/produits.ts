import type { Insight, Severity } from './types';
import { insightStockQuantite } from './stocks';
import type { StatutStock } from '../types';

export interface PrioriteCatalogue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  filtre: { statutStock?: StatutStock; actif?: 'true' | 'false' | '' };
}

export function insightMargeUnitaire(
  margeUnitaire: string,
  tauxMarge: string,
  coutMoyenPondere: string,
): Insight {
  const marge = Number(margeUnitaire);
  const taux = Number(tauxMarge);
  const cmp = Number(coutMoyenPondere);
  if (cmp <= 0) {
    return {
      title: 'Marge unitaire',
      interpretation:
        'Aucun coût moyen pondéré : pas encore de réception fournisseur. La marge affichée égale le prix de vente.',
      recommendation: 'Enregistrer une réception pour valoriser le stock au CMP réel.',
      severity: 'neutral',
    };
  }
  if (marge < 0) {
    return {
      title: 'Marge unitaire négative',
      interpretation: `Le prix de vente est inférieur au CMP (${coutMoyenPondere} FCFA) : marge ${margeUnitaire} FCFA.`,
      recommendation: 'Revoir le prix de vente ou le coût d’achat avant la prochaine réception.',
      severity: 'critical',
    };
  }
  if (taux < 15) {
    return {
      title: 'Marge unitaire faible',
      interpretation: `Taux ${tauxMarge} % — sous le seuil de vigilance de 15 % déjà utilisé au tableau de bord.`,
      recommendation: 'Contrôler le prix catalogue par rapport au CMP.',
      severity: 'warning',
    };
  }
  return {
    title: 'Marge unitaire',
    interpretation: `Marge ${margeUnitaire} FCFA par unité (${tauxMarge} % du prix), sur la base du CMP ${coutMoyenPondere} FCFA.`,
    severity: 'ok',
  };
}

export function insightCouverture(joursCouverture: number | null, quantiteVendue: number): Insight {
  if (quantiteVendue <= 0) {
    return {
      title: 'Couverture de stock',
      interpretation:
        'Aucune vente nette sur 30 jours : la couverture en jours ne peut pas être estimée.',
      severity: 'neutral',
    };
  }
  if (joursCouverture === null) {
    return {
      title: 'Couverture de stock',
      interpretation: 'Couverture indéterminée.',
      severity: 'neutral',
    };
  }
  if (joursCouverture < 7) {
    return {
      title: 'Couverture courte',
      interpretation: `Au rythme des 30 derniers jours, le stock réseau couvre environ ${joursCouverture} jour(s).`,
      recommendation: 'Anticiper un réapprovisionnement ou un transfert depuis un autre entrepôt.',
      severity: 'warning',
    };
  }
  return {
    title: 'Couverture de stock',
    interpretation: `Au rythme des 30 derniers jours, le stock réseau couvre environ ${joursCouverture} jour(s).`,
    severity: 'ok',
  };
}

export function insightSuggestionReappro(input: {
  necessaire: boolean;
  quantiteSuggeree: number;
  motif: string;
}): Insight {
  if (!input.necessaire) {
    return {
      title: 'Réapprovisionnement',
      interpretation: input.motif,
      severity: 'ok',
    };
  }
  return {
    title: 'Réapprovisionnement suggéré',
    interpretation: `${input.quantiteSuggeree} unité(s) — ${input.motif}`,
    recommendation:
      'Passer par Fournisseurs (réception) ou Stocks (transfert) : le stock ne se corrige jamais en éditant la fiche produit.',
    severity: 'warning',
  };
}

export function insightStatutProduit(
  stock: number,
  seuilReappro: number | null,
  actif: boolean,
): Insight {
  if (!actif) {
    return {
      title: 'Produit inactif',
      interpretation:
        'Retiré du catalogue POS : plus encaissable, plus d’alerte STOCK_BAS. L’historique des ventes est conservé.',
      recommendation: 'Réactiver la fiche pour le remettre en vente.',
      severity: 'neutral',
    };
  }
  return insightStockQuantite(stock, seuilReappro);
}

export function buildPrioritesCatalogue(synthese: {
  ruptures: number;
  sousSeuil: number;
  margesNegatives: number;
  sansSeuil: number;
}): PrioriteCatalogue[] {
  const priorites: PrioriteCatalogue[] = [];
  if (synthese.ruptures > 0) {
    priorites.push({
      id: 'ruptures',
      severity: 'critical',
      title: `${synthese.ruptures} rupture(s) réseau`,
      detail: 'Stock réseau à 0 — plus rien à vendre tant qu’un réassort ou un transfert n’est pas fait.',
      filtre: { statutStock: 'RUPTURE' },
    });
  }
  if (synthese.sousSeuil > 0) {
    priorites.push({
      id: 'sous-seuil',
      severity: 'warning',
      title: `${synthese.sousSeuil} produit(s) sous le seuil`,
      detail: 'Stock encore positif mais à ou sous le seuil de réapprovisionnement (alerte STOCK_BAS).',
      filtre: { statutStock: 'SOUS_SEUIL' },
    });
  }
  if (synthese.margesNegatives > 0) {
    priorites.push({
      id: 'marges',
      severity: 'critical',
      title: `${synthese.margesNegatives} prix sous le CMP`,
      detail: 'Le prix de vente est inférieur au coût moyen pondéré : marge unitaire négative.',
      filtre: {},
    });
  }
  return priorites;
}
