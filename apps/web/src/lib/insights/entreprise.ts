import type { Insight } from './types';

// Insights configuration structurelle — ancrés sur la checklist UI existante
// (zones, magasins actifs, PRINCIPAL, caisse magasin) et la séparation
// des tâches (§1) : auxiliaire n'encaisse / n'initie que, ne valide jamais.

export function insightCompletenessSetup(score: number, alertCount: number): Insight {
  if (score >= 100 && alertCount === 0) {
    return {
      title: 'Complétude setup',
      interpretation: 'Checklist de mise en service à 100 % — structure prête pour l’exploitation.',
      severity: 'ok',
    };
  }
  if (score >= 100) {
    return {
      title: 'Complétude setup',
      interpretation: `Checklist à ${score} %, mais ${alertCount} alerte(s) de santé restent visibles.`,
      recommendation: 'Traiter les alertes listées à droite (caisse manquante, PRINCIPAL, fiche société…).',
      severity: 'warning',
    };
  }
  if (score >= 50) {
    return {
      title: 'Complétude setup',
      interpretation: `${score} % des critères de mise en service sont satisfaits · ${alertCount} alerte(s).`,
      recommendation: 'Suivre la checklist : chaque magasin actif doit avoir un entrepôt PRINCIPAL et une caisse magasin.',
      severity: 'warning',
    };
  }
  return {
    title: 'Complétude setup',
    interpretation: `${score} % seulement — la structure n’est pas encore opérationnelle (${alertCount} alerte(s)).`,
    recommendation: 'Commencer par zones → magasins → entrepôts PRINCIPAL → caisses auxiliaires.',
    severity: 'critical',
  };
}

export function insightZonesCount(n: number): Insight {
  if (n === 0) {
    return {
      title: 'Zones',
      interpretation: 'Aucune zone : impossible de rattacher un magasin (§6.5 ZONE → BOUTIQUE).',
      recommendation: 'Créer au moins une zone avant d’ajouter des magasins.',
      severity: 'critical',
    };
  }
  return {
    title: 'Zones',
    interpretation: `${n} zone(s) définie(s). Les magasins et le périmètre superviseur s’y rattachent.`,
    severity: 'info',
  };
}

export function insightMagasinsActifs(actifs: number, inactifs: number): Insight {
  if (actifs === 0) {
    return {
      title: 'Magasins actifs',
      interpretation:
        inactifs > 0
          ? `Aucun magasin actif (${inactifs} inactif(s)). Aucune vente POS ni versement boutique possible.`
          : 'Aucun magasin enregistré.',
      recommendation: 'Activer ou créer au moins un magasin pour démarrer l’exploitation.',
      severity: 'critical',
    };
  }
  return {
    title: 'Magasins actifs',
    interpretation: `${actifs} magasin(s) actif(s)${inactifs > 0 ? ` · ${inactifs} inactif(s)` : ''}.`,
    severity: 'ok',
  };
}

export function insightEntrepotsCount(n: number, principalMissing: number): Insight {
  if (n === 0) {
    return {
      title: 'Entrepôts',
      interpretation: 'Aucun entrepôt : le stock et les réceptions ne peuvent pas être localisés.',
      recommendation: 'Chaque magasin actif doit disposer d’un entrepôt PRINCIPAL.',
      severity: 'critical',
    };
  }
  if (principalMissing > 0) {
    return {
      title: 'Entrepôts',
      interpretation: `${n} entrepôt(s) · ${principalMissing} magasin(s) actif(s) sans PRINCIPAL.`,
      recommendation: 'Compléter les PRINCIPAL manquants avant d’ouvrir le POS sur ces boutiques.',
      severity: 'warning',
    };
  }
  return {
    title: 'Entrepôts',
    interpretation: `${n} entrepôt(s) — chaque magasin actif a un PRINCIPAL.`,
    severity: 'ok',
  };
}

export function insightCaissesCount(aux: number, centrale: number): Insight {
  if (aux === 0 && centrale === 0) {
    return {
      title: 'Caisses',
      interpretation: 'Aucune caisse provisionnée.',
      recommendation: 'Provisionner la caisse centrale et une auxiliaire par magasin actif.',
      severity: 'critical',
    };
  }
  if (aux === 0) {
    return {
      title: 'Caisses',
      interpretation: `${centrale} centrale(s), aucune auxiliaire — les boutiques ne peuvent pas encaisser.`,
      recommendation: 'Créer une caisse MAGASIN par magasin actif.',
      severity: 'warning',
    };
  }
  return {
    title: 'Caisses',
    interpretation: `${aux} auxiliaire(s) · ${centrale} centrale(s). L’auxiliaire initie les versements ; seule la centrale réceptionne / valide.`,
    severity: 'info',
  };
}

export function insightSanteMagasin(
  hasAuxiliaire: boolean,
  hasPrincipal: boolean,
): Insight {
  if (hasAuxiliaire && hasPrincipal) {
    return {
      title: 'Santé magasin',
      interpretation: 'Caisse auxiliaire et entrepôt PRINCIPAL présents — magasin prêt pour le POS et le stock.',
      severity: 'ok',
    };
  }
  const manques: string[] = [];
  if (!hasAuxiliaire) manques.push('caisse magasin');
  if (!hasPrincipal) manques.push('entrepôt PRINCIPAL');
  return {
    title: 'Santé magasin',
    interpretation: `Configuration incomplète : manque ${manques.join(' et ')}.`,
    recommendation: 'Compléter depuis les onglets Caisses et Entrepôts avant d’ouvrir une session POS.',
    severity: 'warning',
  };
}

export function insightSanteColonne(): Insight {
  return {
    title: 'Colonne Santé',
    interpretation:
      'Chaque magasin actif doit avoir une caisse magasin (encaissement / initiation) et un entrepôt PRINCIPAL (stock POS).',
    severity: 'info',
  };
}

export function insightTypeEntrepot(type: 'PRINCIPAL' | 'SECONDAIRE'): Insight {
  if (type === 'PRINCIPAL') {
    return {
      title: 'Entrepôt PRINCIPAL',
      interpretation:
        'Entrepôt de référence du magasin — utilisé par le POS pour le stock vendable et cible par défaut des réceptions.',
      severity: 'info',
    };
  }
  return {
    title: 'Entrepôt SECONDAIRE',
    interpretation:
      'Stock annexe (réserve, transit). Ne remplace pas le PRINCIPAL obligatoire de chaque magasin actif.',
    severity: 'neutral',
  };
}

export function insightTypeCaisseConfig(type: string): Insight {
  if (type === 'CENTRALE') {
    return {
      title: 'Caisse centrale',
      interpretation:
        'Trésorerie réseau — reçoit les SORTIE_FONDS magasin après validation §6.4.',
      severity: 'info',
    };
  }
  if (type === 'TIROIR') {
    return {
      title: 'Tiroir',
      interpretation:
        'Poste POS configuré par le DAF — session et encaissement uniquement.',
      severity: 'info',
    };
  }
  return {
    title: 'Caisse magasin',
    interpretation:
      'Cash office boutique — reçoit les transferts des tiroirs et initie les versements vers la centrale.',
    severity: 'info',
  };
}

export function insightSocieteFiche(hasEmail: boolean, hasTelephone: boolean): Insight {
  if (hasEmail && hasTelephone) {
    return {
      title: 'Fiche société',
      interpretation: 'Coordonnées complètes (email et téléphone renseignés).',
      severity: 'ok',
    };
  }
  const manques: string[] = [];
  if (!hasEmail) manques.push('email');
  if (!hasTelephone) manques.push('téléphone');
  return {
    title: 'Fiche société',
    interpretation: `Coordonnées incomplètes : ${manques.join(' et ')} manquant(s).`,
    recommendation: 'Compléter la fiche dans l’onglet Société.',
    severity: 'warning',
  };
}
