import { NiveauFidelite } from '@caisse-crm/shared';
import type { Insight } from './types';

// Interprétations ancrées sur le tableau de bord client existant (§6.6) —
// jamais de seuil monétaire inventé, uniquement les notions déjà définies
// (paliers de fidélité) ou des faits directement dérivés des données.
export function insightTotalDepense(totalDepense: string, nombreAchats: number): Insight {
  return {
    title: 'Total dépensé',
    interpretation:
      nombreAchats > 0
        ? `${totalDepense} FCFA cumulés sur ${nombreAchats} achat(s), tous points de vente confondus (fiche client consolidée réseau).`
        : "Aucun achat enregistré pour ce client pour l'instant.",
    severity: 'info',
  };
}

export function insightNombreAchats(nombreAchats: number): Insight {
  return {
    title: "Nombre d'achats",
    interpretation: `${nombreAchats} achat(s) enregistré(s) pour ce client sur l'ensemble du réseau.`,
    recommendation:
      nombreAchats === 0
        ? 'Rattacher les prochaines ventes de ce client à sa fiche pour construire son historique.'
        : undefined,
    severity: nombreAchats === 0 ? 'neutral' : 'info',
  };
}

export function insightDernierAchat(dateDernierAchat: string | null): Insight {
  if (!dateDernierAchat) {
    return {
      title: 'Dernier achat',
      interpretation: "Ce client n'a encore aucun achat rattaché à sa fiche.",
      severity: 'neutral',
    };
  }
  const jours = Math.floor((Date.now() - new Date(dateDernierAchat).getTime()) / 86_400_000);
  return {
    title: 'Dernier achat',
    interpretation: `Il y a ${jours} jour(s), le ${new Date(dateDernierAchat).toLocaleDateString()}.`,
    severity: 'info',
  };
}

export function insightFidelite(niveau: string, pointsCumules: number): Insight {
  const libelles: Record<string, string> = {
    [NiveauFidelite.BRONZE]: "palier d'entrée du programme de fidélité",
    [NiveauFidelite.ARGENT]: 'palier intermédiaire',
    [NiveauFidelite.OR]: 'palier le plus élevé — client fidèle à forte valeur',
  };
  return {
    title: 'Fidélité',
    interpretation: `Palier ${niveau} avec ${pointsCumules} point(s) cumulés — ${libelles[niveau] ?? 'palier personnalisé'}.`,
    recommendation:
      niveau === NiveauFidelite.OR
        ? 'Prioriser ce client dans les campagnes CRM ciblées sur le palier OR.'
        : undefined,
    severity: 'info',
  };
}
