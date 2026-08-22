import {
  labelPerimetre,
  labelValidation,
  profilOf,
  type RoleLibelle,
} from '@caisse-crm/shared';
import type { Insight } from './types';

// Explications par catégorie d'action pour le journal d'audit (§6.7) : chaque
// entrée est horodatée et non modifiable — aucun UPDATE/DELETE n'est autorisé,
// même par un administrateur, ce qui est rappelé dans chaque cas.
export function insightAuditAction(action: string): Insight {
  const libelle = action.replace(/_/g, ' ');
  if (action.includes('REFUSE') || action.includes('VERROUILLE')) {
    return {
      title: 'Sécurité — accès refusé',
      interpretation: `« ${libelle} » trace une tentative d'accès non autorisée ou un compte verrouillé après échecs répétés. Entrée figée, non modifiable (§6.7).`,
      recommendation: "Vérifier avec le titulaire du compte avant toute réinitialisation de mot de passe.",
      severity: 'critical',
    };
  }
  if (action.includes('ECHEC') || action.includes('DESACTIVE') || action.includes('ANNULE')) {
    return {
      title: 'Échec ou désactivation',
      interpretation: `« ${libelle} » correspond à un échec ou une désactivation. Entrée figée, non modifiable (§6.7).`,
      severity: 'warning',
    };
  }
  if (action.includes('DEROGATION') || action.includes('REINITIALISE')) {
    return {
      title: 'Action sensible',
      interpretation: `« ${libelle} » est une opération sensible (dérogation ou réinitialisation) journalisée pour traçabilité. Entrée figée, non modifiable (§6.7).`,
      severity: 'warning',
    };
  }
  if (action.startsWith('TRANSACTION_')) {
    return {
      title: 'Circuit transactionnel §6.4',
      interpretation: `« ${libelle} » correspond à une étape du circuit des transactions de caisse (Initiée → En transit → Réceptionnée → Validée). Entrée figée, non modifiable (§6.7).`,
      severity: 'neutral',
    };
  }
  return {
    title: 'Journal d\'audit',
    interpretation: `« ${libelle} » est une entrée append-only du journal : elle ne peut être ni modifiée ni supprimée une fois écrite (§6.7).`,
    severity: 'ok',
  };
}

// Rappel général sur la nature append-only du journal, à afficher une fois
// par page (près du titre de la liste), plutôt que répété sur chaque ligne.
export function insightJournalImmuable(total: number): Insight {
  return {
    title: 'Journal append-only',
    interpretation: `${total} entrée(s) horodatée(s) sur ce filtre. Aucune entrée du journal d'audit ne peut être modifiée ou supprimée, même par un administrateur (§6.7) — les corrections se font par une nouvelle entrée, jamais par édition rétroactive.`,
    severity: 'info',
  };
}

// Périmètre de données et niveau de validation du circuit transactionnel
// §6.4 pour un rôle donné — reprend la matrice RBAC de CLAUDE.md §3/§4.
export function insightPerimetreRole(role: RoleLibelle): Insight {
  const p = profilOf(role);
  const validation = labelValidation(p.validationCircuit);
  const peutValider = p.validationCircuit === 'centrale' || p.validationCircuit === 'niveau2';
  return {
    title: p.libelle,
    interpretation: `Périmètre de données : ${labelPerimetre(p.perimetre)}. Réception/validation du circuit transactionnel §6.4 : ${validation}.`,
    recommendation: p.interdit,
    severity: peutValider ? 'ok' : p.validationCircuit === 'seuils' ? 'warning' : 'neutral',
  };
}

// Rapprochement 3 voies (§5.2, ligne 259-261) : compare ventes / bordereaux
// émis / réceptions validées et signale tout écart entre les trois totaux.
export function insightRapprochementCoherence(
  signale: boolean,
  ecartVentesBordereaux: string,
  ecartBordereauxReceptions: string,
): Insight {
  if (!signale) {
    return {
      title: 'Rapprochement cohérent',
      interpretation:
        'Ventes enregistrées, bordereaux émis et réceptions validées concordent sur ce périmètre — aucun écart détecté.',
      severity: 'ok',
    };
  }
  return {
    title: 'Écart détecté (§5.2)',
    interpretation: `Écart ventes ↔ bordereaux : ${ecartVentesBordereaux} FCFA. Écart bordereaux ↔ réceptions : ${ecartBordereauxReceptions} FCFA.`,
    recommendation:
      'Investiguer les transactions du périmètre concerné (versements non transmis, litiges en cours) avant clôture de période.',
    severity: 'critical',
  };
}

// Combien de profils ont accès (total ou partiel) à une application du shell
// — aide à repérer les modules largement ouverts vs très restreints.
export function insightAccesApplication(
  libelleApp: string,
  ouiCount: number,
  partielCount: number,
  totalProfils: number,
): Insight {
  const accesTotal = ouiCount + partielCount;
  return {
    title: libelleApp,
    interpretation:
      accesTotal === 0
        ? `Aucun des ${totalProfils} profils du catalogue n'a accès à « ${libelleApp} ».`
        : `${ouiCount} profil(s) avec accès complet, ${partielCount} avec accès partiel (menus limités), sur ${totalProfils} profils au catalogue.`,
    severity: accesTotal === totalProfils ? 'neutral' : accesTotal === 0 ? 'warning' : 'info',
  };
}
