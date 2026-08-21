import type { Insight } from './types';

/** Insights croisés pôle central DAF — marge × stock × cash. */

export function insightMargeGlobale(tauxMarge: string, caNet: string): Insight {
  const taux = Number(tauxMarge);
  const ca = Number(caNet);
  if (ca <= 0) {
    return {
      title: 'Résultat réseau',
      interpretation: 'Aucun CA net sur la période — pas de marge à interpréter.',
      severity: 'neutral',
    };
  }
  if (taux < 0) {
    return {
      title: 'Marge réseau',
      interpretation: `Marge négative (${tauxMarge} %) : le CMV dépasse le CA net.`,
      recommendation: 'Contrôler prix de vente, remises et coûts d’achat CMP.',
      severity: 'critical',
    };
  }
  if (taux < 15) {
    return {
      title: 'Marge réseau',
      interpretation: `Taux de marge ${tauxMarge} % sous le seuil de vigilance (15 %).`,
      recommendation: 'Identifier les boutiques à marge faible dans le compte de résultat.',
      severity: 'warning',
    };
  }
  return {
    title: 'Marge réseau',
    interpretation: `Taux de marge brute ${tauxMarge} % sur CA net ${Number(caNet).toLocaleString('fr-FR')} FCFA.`,
    severity: 'ok',
  };
}

export function insightMargeSurStock(
  margeSurStock: string | null,
  valeurStock: string,
): Insight {
  if (margeSurStock === null) {
    return {
      title: 'Marge / stock',
      interpretation: 'Valorisation stock nulle — ratio non calculable.',
      severity: 'neutral',
    };
  }
  const ratio = Number(margeSurStock);
  if (ratio < 0.1 && Number(valeurStock) > 0) {
    return {
      title: 'Marge / stock',
      interpretation: `Marge générée = ${ratio.toFixed(2)}× la valeur stock — faible rendement du stock immobilisé.`,
      recommendation: 'Prioriser les SKU à rotation lente et les ruptures simultanées.',
      severity: 'warning',
    };
  }
  return {
    title: 'Marge / stock',
    interpretation: `Marge / valeur stock = ${ratio.toFixed(2)} (période sélectionnée).`,
    severity: 'ok',
  };
}

export function insightRotationStock(rotation: string | null): Insight {
  if (rotation === null) {
    return {
      title: 'Rotation stock',
      interpretation: 'CMV / valeur stock non calculable (stock à zéro).',
      severity: 'neutral',
    };
  }
  const r = Number(rotation);
  if (r < 0.2) {
    return {
      title: 'Rotation stock',
      interpretation: `Indicateur CMV/stock = ${r.toFixed(2)} — stock peu consommé sur la période.`,
      recommendation: 'Croiser avec couverture et suggestions de transfert réseau.',
      severity: 'warning',
    };
  }
  return {
    title: 'Rotation stock',
    interpretation: `Indicateur CMV/stock = ${r.toFixed(2)} sur la période.`,
    severity: 'ok',
  };
}

export function insightSanteStock(
  sante: string,
  ruptures: number,
  sousSeuil: number,
): Insight {
  if (sante === 'CRITIQUE' || ruptures > 0) {
    return {
      title: 'Santé stocks',
      interpretation: `${ruptures} rupture(s) · ${sousSeuil} sous seuil — santé ${sante}.`,
      recommendation: 'Ouvrir l’analyse stocks et lancer réappro / bons de livraison.',
      severity: 'critical',
    };
  }
  if (sante === 'VIGILANCE' || sousSeuil > 0) {
    return {
      title: 'Santé stocks',
      interpretation: `${sousSeuil} SKU sous seuil — santé ${sante}.`,
      severity: 'warning',
    };
  }
  return {
    title: 'Santé stocks',
    interpretation: `Réseau OK — ${ruptures} rupture(s), ${sousSeuil} sous seuil.`,
    severity: 'ok',
  };
}

export function insightCashBoutiquesVsCentrale(
  soldeMagasins: string,
  soldeTiroirs: string,
  soldeCentrale: string,
): Insight {
  const boutiques = Number(soldeMagasins) + Number(soldeTiroirs);
  const centrale = Number(soldeCentrale);
  if (centrale === 0 && boutiques === 0) {
    return {
      title: 'Répartition cash',
      interpretation: 'Soldes nuls sur magasins, tiroirs et centrale.',
      severity: 'neutral',
    };
  }
  if (centrale > 0 && boutiques > centrale * 2) {
    return {
      title: 'Cash bloqué boutiques',
      interpretation: `${boutiques.toLocaleString('fr-FR')} FCFA en boutiques vs ${centrale.toLocaleString('fr-FR')} en centrale.`,
      recommendation: 'Accélérer les SORTIE_FONDS magasin → centrale (§6.4).',
      severity: 'warning',
    };
  }
  return {
    title: 'Répartition cash',
    interpretation: `Boutiques ${boutiques.toLocaleString('fr-FR')} · Centrale ${centrale.toLocaleString('fr-FR')} FCFA.`,
    severity: 'ok',
  };
}

export function insightAlertesDaf(
  alertes: Array<{ severite: string }>,
): Insight {
  const critical = alertes.filter((a) => a.severite === 'critical').length;
  const warning = alertes.filter((a) => a.severite === 'warning').length;
  if (critical > 0) {
    return {
      title: 'Alertes croisées',
      interpretation: `${critical} alerte(s) critique(s) · ${warning} vigilance.`,
      recommendation: 'Traiter litiges et ruptures en priorité.',
      severity: 'critical',
    };
  }
  if (warning > 0 || alertes.length > 0) {
    return {
      title: 'Alertes croisées',
      interpretation: `${alertes.length} signal(aux) à suivre (versements, stock, cash).`,
      severity: 'warning',
    };
  }
  return {
    title: 'Alertes croisées',
    interpretation: 'Aucune alerte croisée marge × stock × trésorerie.',
    severity: 'ok',
  };
}
