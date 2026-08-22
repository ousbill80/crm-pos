import type { Insight } from './types';

export function insightTypeCaisse(type: string): Insight {
  if (type === 'CENTRALE') {
    return {
      title: 'Caisse centrale',
      interpretation:
        'Trésorerie réseau — reçoit les SORTIE_FONDS magasin après validation §6.4.',
      severity: 'info',
    };
  }
  if (type === 'MAGASIN') {
    return {
      title: 'Caisse magasin',
      interpretation:
        'Cash office boutique — reçoit les transferts internes des tiroirs ; initie les versements vers la centrale.',
      severity: 'info',
    };
  }
  return {
    title: 'Tiroir',
    interpretation:
      'Poste POS — encaissement client et session de caisse ; ne peut pas initier de SORTIE_FONDS §6.4.',
    severity: 'info',
  };
}

export function insightSoldeCaisse(type: string): Insight {
  return {
    title: 'Solde',
    interpretation:
      'Solde recalculé depuis le grand livre append-only — jamais depuis un cache.',
    recommendation:
      type === 'TIROIR'
        ? 'Clôturer la session pour transférer les espèces vers la caisse magasin.'
        : type === 'MAGASIN'
          ? 'Initier une SORTIE_FONDS vers la centrale lorsque le cash office est trop chargé.'
          : undefined,
    severity: 'info',
  };
}

export function insightNbTypeCaisse(type: 'CENTRALE' | 'MAGASIN' | 'TIROIR', n: number): Insight {
  if (type === 'CENTRALE') {
    return {
      title: 'Caisse(s) centrale(s)',
      interpretation: `${n} caisse centrale sur le périmètre — point d'arrivée unique des versements validés §6.4.`,
      severity: 'info',
    };
  }
  if (type === 'MAGASIN') {
    return {
      title: 'Caisses magasin',
      interpretation: `${n} cash office(s) magasin — un par boutique, reçoivent les clôtures de tiroirs.`,
      recommendation: 'Cliquer pour filtrer le circuit sur les caisses magasin uniquement.',
      severity: 'info',
    };
  }
  return {
    title: 'Tiroirs POS',
    interpretation: `${n} tiroir(s) de caisse répartis sur les boutiques du périmètre.`,
    recommendation: 'Cliquer pour filtrer le circuit sur les tiroirs uniquement.',
    severity: 'info',
  };
}

export function insightPerimetreCaisses(total: number, inactifs: number): Insight {
  return {
    title: 'Périmètre',
    interpretation:
      inactifs > 0
        ? `${total} caisse(s) au total, dont ${inactifs} inactive(s) (masquée(s) par défaut).`
        : `${total} caisse(s) au total, toutes actives.`,
    severity: inactifs > 0 ? 'neutral' : 'ok',
  };
}

export function insightLedgerEcritures(n: number): Insight {
  return {
    title: 'Écritures',
    interpretation: `${n} écriture(s) VALIDÉE(s) dans le grand livre de cette caisse — jamais modifiable ni supprimable.`,
    severity: 'info',
  };
}

export function insightLedgerCredits(montant: number): Insight {
  return {
    title: 'Crédits',
    interpretation: `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA entrés dans cette caisse (ventes, transferts, versements reçus).`,
    severity: 'info',
  };
}

export function insightLedgerDebits(montant: number): Insight {
  return {
    title: 'Débits',
    interpretation: `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA sortis de cette caisse (transferts, versements initiés).`,
    severity: 'info',
  };
}

export function insightLedgerPipeline(n: number): Insight {
  return {
    title: 'En cours (hors grand livre)',
    interpretation:
      n > 0
        ? `${n} transaction(s) INITIÉE(s) / EN_TRANSIT / RÉCEPTIONNÉE(s) / LITIGE non encore validées — n'apparaissent pas dans le solde.`
        : "Aucune transaction en cours sur cette caisse : tout le circuit est soit validé, soit vide.",
    recommendation: n > 0 ? 'Suivre ces transactions depuis la page Versements jusqu\'à leur validation.' : undefined,
    severity: n > 0 ? 'warning' : 'ok',
  };
}
