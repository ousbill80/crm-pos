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
