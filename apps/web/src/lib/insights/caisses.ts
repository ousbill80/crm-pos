import type { Insight } from './types';

// Type de caisse — rappelle la séparation des tâches non négociable (CLAUDE.md
// §1) : une caisse auxiliaire ne peut jamais valider/réceptionner.
export function insightTypeCaisse(type: string): Insight {
  const centrale = type === 'CENTRALE';
  return {
    title: centrale ? 'Caisse centrale' : 'Caisse auxiliaire',
    interpretation: centrale
      ? 'Caisse consolidée réseau — reçoit les versements des boutiques après réception et validation par le Caissier Central.'
      : "Caisse de boutique — peut uniquement encaisser des ventes et initier un versement ou une sortie de fonds ; ne peut jamais valider ni réceptionner une transaction.",
    severity: 'info',
  };
}

export function insightSoldeCaisse(type: string): Insight {
  const centrale = type === 'CENTRALE';
  return {
    title: 'Solde',
    interpretation:
      'Solde recalculé à la demande depuis le grand livre append-only des transactions — jamais lu depuis un solde en cache.',
    recommendation: centrale
      ? undefined
      : 'Un solde qui reste élevé en caisse auxiliaire signale des ventes non encore versées — initier un bordereau de versement.',
    severity: 'info',
  };
}
