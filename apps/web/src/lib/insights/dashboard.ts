import type { Insight, Severity } from './types';

// Interprétations dynamiques pour le tableau de bord (§6.3.4).
// Les seuils utilisés (marge < 15 %, retard > 0, litige > 0) sont ceux déjà
// établis par l'UI elle-même (classes kpi-warning/kpi-danger, badges Marge
// négative/faible) — aucun seuil n'est inventé ici, on ne fait que l'expliquer.

export interface PrioriteAction {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export function buildPrioritesDashboard(input: {
  versementsEnRetard24h: number;
  nombreLitiges: number;
  montantEcartsAbsolus: string;
  rentabilite: Array<{
    boutiqueId: string;
    nomBoutique: string;
    margeBrute: string;
    tauxMarge: string;
  }>;
}): PrioriteAction[] {
  const priorites: PrioriteAction[] = [];

  if (input.nombreLitiges > 0) {
    priorites.push({
      id: 'litiges',
      severity: 'critical',
      title: `${input.nombreLitiges} litige(s) de caisse`,
      detail: `${input.montantEcartsAbsolus} FCFA d'écart — bloqués jusqu'à régularisation (§6.4).`,
      href: '/litiges',
      cta: 'Voir les litiges',
    });
  }

  if (input.versementsEnRetard24h > 0) {
    priorites.push({
      id: 'retards',
      severity: 'warning',
      title: `${input.versementsEnRetard24h} versement(s) en retard`,
      detail: 'Bordereaux non transmis dans le délai de 24 h (§6.7).',
      href: '/alertes?type=VERSEMENT_EN_RETARD',
      cta: 'Ouvrir les alertes',
    });
  }

  for (const r of input.rentabilite) {
    const negative = Number(r.margeBrute) < 0;
    const faible = !negative && Number(r.tauxMarge) < 15;
    if (negative) {
      priorites.push({
        id: `marge-neg-${r.boutiqueId}`,
        severity: 'critical',
        title: `Marge négative — ${r.nomBoutique}`,
        detail: `Marge ${r.margeBrute} FCFA : le coût des ventes dépasse le CA net.`,
        href: '/stocks',
        cta: 'Contrôler les stocks',
      });
    } else if (faible) {
      priorites.push({
        id: `marge-faible-${r.boutiqueId}`,
        severity: 'warning',
        title: `Marge faible — ${r.nomBoutique}`,
        detail: `Taux ${r.tauxMarge} % sous le seuil de vigilance de 15 %.`,
        href: '/produits',
        cta: 'Revoir le catalogue',
      });
    }
  }

  return priorites;
}

export function synthetiserSante(priorites: PrioriteAction[]): {
  severity: Severity;
  label: string;
  detail: string;
} {
  if (priorites.some((p) => p.severity === 'critical')) {
    return {
      severity: 'critical',
      label: 'Attention requise',
      detail: 'Des litiges ou marges négatives demandent une action immédiate.',
    };
  }
  if (priorites.some((p) => p.severity === 'warning')) {
    return {
      severity: 'warning',
      label: 'Vigilance',
      detail: 'Des retards ou marges faibles méritent un suivi.',
    };
  }
  return {
    severity: 'ok',
    label: 'Situation saine',
    detail: 'Aucun signal critique sur le périmètre et la période.',
  };
}

export function insightChiffreAffaires(total: string, nombreBoutiques: number): Insight {
  return {
    title: "Chiffre d'affaires",
    interpretation:
      nombreBoutiques > 0
        ? `${total} FCFA de ventes cumulées sur ${nombreBoutiques} boutique(s) pour la période sélectionnée.`
        : 'Aucune boutique dans le périmètre pour la période sélectionnée.',
    recommendation:
      nombreBoutiques > 0
        ? 'Comparer avec la période précédente pour détecter une tendance avant de décider une action commerciale.'
        : undefined,
    severity: nombreBoutiques > 0 ? 'info' : 'neutral',
  };
}

export function insightTresorerie(totalSoldesAuxiliaires: string, nombreCaisses: number): Insight {
  return {
    title: 'Trésorerie auxiliaire',
    interpretation: `${totalSoldesAuxiliaires} FCFA cumulés sur ${nombreCaisses} caisse(s), recalculés depuis le grand livre append-only (jamais depuis un solde en cache).`,
    recommendation:
      'Rapprocher ce total des bordereaux de versement en cours pour vérifier qu\'aucun montant ne reste bloqué en boutique.',
    severity: 'info',
  };
}

export function insightVersementsEnRetard(enRetard24h: number): Insight {
  const enRetard = enRetard24h > 0;
  return {
    title: 'Versements en retard',
    interpretation: enRetard
      ? `${enRetard24h} versement(s) de boutique n'ont pas été transmis dans le délai de 24 h (§6.7).`
      : 'Aucun versement en retard : tous les bordereaux ont été transmis dans le délai de 24 h.',
    recommendation: enRetard
      ? 'Relancer les responsables de boutique concernés et vérifier la page Alertes pour le détail par boutique.'
      : undefined,
    severity: enRetard ? 'warning' : 'ok',
  };
}

export function insightLitiges(nombreLitiges: number, montantEcartsAbsolus: string): Insight {
  const enLitige = nombreLitiges > 0;
  return {
    title: 'Litiges / écarts',
    interpretation: enLitige
      ? `${nombreLitiges} transaction(s) en litige pour ${montantEcartsAbsolus} FCFA d'écart cumulé, bloquées jusqu'à régularisation par le Contrôle interne (§6.4).`
      : 'Aucun écart de caisse en litige sur le périmètre.',
    recommendation: enLitige
      ? 'Transmettre le dossier au Contrôle interne pour arbitrage — une transaction en litige reste bloquée tant qu\'elle n\'est pas régularisée.'
      : undefined,
    severity: enLitige ? 'critical' : 'ok',
  };
}

export function insightClientsCrm(nombreClients: number): Insight {
  return {
    title: 'Clients CRM',
    interpretation: `${nombreClients} fiche(s) client consolidée(s) au niveau réseau, visibles depuis n'importe quelle boutique.`,
    recommendation:
      nombreClients > 0
        ? 'Consulter la répartition par segment pour cibler les campagnes de fidélisation.'
        : undefined,
    severity: 'info',
  };
}

export function insightCaNetBoutique(chiffreAffairesNet: string): Insight {
  return {
    title: 'CA net de la boutique',
    interpretation: `${chiffreAffairesNet} FCFA de ventes nettes (remises et retours déduits) sur la période.`,
    severity: 'info',
  };
}

export function insightCoutDesVentes(coutDesVentes: string): Insight {
  return {
    title: 'Coût des ventes',
    interpretation: `${coutDesVentes} FCFA de coût d'achat (CMP à la vente) des articles vendus sur la période.`,
    severity: 'info',
  };
}

export function insightMargeBrute(margeBrute: string, tauxMarge: string): Insight {
  const taux = Number(tauxMarge);
  const negative = Number(margeBrute) < 0;
  const faible = !negative && taux < 15;
  return {
    title: 'Marge brute',
    interpretation: negative
      ? `Marge négative de ${margeBrute} FCFA : le coût des ventes dépasse le chiffre d'affaires net sur cette boutique.`
      : faible
        ? `Marge de ${margeBrute} FCFA, soit un taux de ${tauxMarge} % — en dessous du seuil de vigilance de 15 % retenu par ce tableau de bord.`
        : `Marge de ${margeBrute} FCFA, soit un taux de ${tauxMarge} %, au-dessus du seuil de vigilance de 15 %.`,
    recommendation: negative
      ? 'Vérifier les prix de vente et les remises appliquées sur cette boutique — une marge négative signale une perte sur les ventes.'
      : faible
        ? 'Surveiller cette boutique : une marge sous 15 % laisse peu de couverture pour les charges fixes.'
        : undefined,
    severity: negative ? 'critical' : faible ? 'warning' : 'ok',
  };
}

export function insightValeurStock(valeurStock: string, chiffreAffairesNet: string): Insight {
  const valeur = Number(valeurStock);
  const ca = Number(chiffreAffairesNet);
  const rotation = valeur > 0 ? ca / valeur : null;
  return {
    title: 'Valeur du stock',
    interpretation:
      rotation !== null
        ? `${valeurStock} FCFA de stock valorisé au CMP. Ratio CA net / valeur de stock sur la période : ${rotation.toFixed(2)} — indicateur approximatif de rotation, à comparer entre boutiques plutôt qu'à un seuil absolu.`
        : `${valeurStock} FCFA de stock valorisé au CMP.`,
    severity: 'neutral',
  };
}

export function insightSoldeCaisse(type: string, solde: string): Insight {
  const centrale = type === 'CENTRALE';
  return {
    title: centrale ? 'Caisse centrale' : 'Caisse auxiliaire (boutique)',
    interpretation: centrale
      ? `${solde} FCFA consolidés au niveau réseau, recalculés depuis le grand livre append-only.`
      : `${solde} FCFA en attente de versement dans cette caisse de boutique.`,
    recommendation: centrale
      ? undefined
      : "Une caisse auxiliaire ne peut qu'encaisser des ventes et initier un versement — penser à verser régulièrement pour limiter le montant immobilisé en boutique.",
    severity: 'info',
  };
}

export function insightSegmentClient(segment: string, nombre: number, totalClients: number): Insight {
  const part = totalClients > 0 ? (nombre / totalClients) * 100 : 0;
  const libelles: Record<string, string> = {
    NOUVEAU: 'clients récemment acquis, pas encore d\'historique d\'achats significatif',
    REGULIER: 'clients avec un historique d\'achats régulier',
    VIP: 'clients à forte valeur, prioritaires pour la fidélisation',
  };
  return {
    title: `Segment ${segment}`,
    interpretation: `${nombre} client(s) (${part.toFixed(0)} % du fichier), ${libelles[segment] ?? 'segment personnalisé'}.`,
    recommendation:
      segment === 'VIP'
        ? 'Cibler ce segment en priorité pour les campagnes CRM et le programme de fidélité.'
        : undefined,
    severity: 'info',
  };
}

export function insightCashConseille(cashConseille: string): Insight {
  return {
    title: 'Cash consolidé',
    interpretation: `${cashConseille} FCFA = soldes auxiliaires + caisse centrale, recalculés depuis le grand livre (visibilité groupe type Agicap).`,
    severity: 'info',
  };
}

export function insightProjectionLiquidite(
  horizon: 'J+7' | 'J+30',
  montant: string,
  moyenneCa: string,
): Insight {
  return {
    title: `Projection ${horizon}`,
    interpretation: `${montant} FCFA — projection indicative = cash consolidé + moyenne CA journalier (${moyenneCa} FCFA) × horizon. Ce n'est pas un solde comptable futur.`,
    recommendation: 'Comparer avec les versements en cours et les litiges avant toute décision de financement.',
    severity: 'info',
  };
}

export function insightAgeingVersements(bucket: string, nombre: number): Insight {
  const labels: Record<string, string> = {
    '0_24h': 'moins de 24 h',
    '24_48h': '24 à 48 h',
    '48_72h': '48 à 72 h',
    plus_72h: 'plus de 72 h',
  };
  const critique = bucket === 'plus_72h' || bucket === '48_72h';
  return {
    title: `Ageing ${labels[bucket] ?? bucket}`,
    interpretation: `${nombre} versement(s) encore dans le circuit (initié / transit / réceptionné) depuis ${labels[bucket] ?? bucket}.`,
    recommendation: critique
      ? 'Prioriser la réception / le rapprochement — risque de retard §6.7.'
      : undefined,
    severity: critique ? 'warning' : 'info',
  };
}

