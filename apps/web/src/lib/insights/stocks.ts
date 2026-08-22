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

export function insightBonStatut(
  statut: 'BROUILLON' | 'PRET' | 'FAIT' | 'ANNULE',
  type: string,
): Insight {
  if (statut === 'BROUILLON') {
    return {
      title: 'Bon en brouillon',
      interpretation: `Ce bon de ${type.toLowerCase()} est en préparation : le stock vendable n'a subi aucune écriture.`,
      recommendation: 'Passer « En prêt » une fois les quantités vérifiées, avant la validation finale.',
      severity: 'neutral',
    };
  }
  if (statut === 'PRET') {
    return {
      title: 'Bon prêt',
      interpretation: 'Le bon est prêt à être validé. La validation (Fait) posera les écritures de stock — action non journalière, séparée de la préparation.',
      recommendation: 'Faire valider par un habilité distinct du préparateur si possible (contrôle croisé).',
      severity: 'warning',
    };
  }
  if (statut === 'FAIT') {
    return {
      title: 'Bon validé',
      interpretation: 'Les écritures de stock ont été posées (mouvements TRANSFERT/RÉCEPTION/REBUT selon le type). Ce bon est clos et non modifiable.',
      severity: 'ok',
    };
  }
  return {
    title: 'Bon annulé',
    interpretation: 'Ce bon a été annulé avant validation : aucune écriture de stock n\'a été posée.',
    severity: 'neutral',
  };
}

export function insightEmplacementUsage(
  usage: string,
  virtuel: boolean,
  reseau: boolean,
): Insight {
  if (virtuel) {
    return {
      title: 'Emplacement virtuel',
      interpretation: `Emplacement virtuel de type « ${usage.toLowerCase()} » — sert à tracer une consignation (fournisseur/client), n'entre pas dans le stock vendable.`,
      severity: 'neutral',
    };
  }
  if (usage === 'STOCK') {
    return {
      title: 'Stock vendable',
      interpretation: `Emplacement de vente${reseau ? ' réseau (hub central)' : ' boutique'} — les quantités ici sont proposées à la vente en caisse.`,
      severity: 'ok',
    };
  }
  return {
    title: 'Emplacement logistique',
    interpretation: `Usage « ${usage.toLowerCase()} » — zone de transit, pas de stock vendable direct.`,
    severity: 'neutral',
  };
}

export function insightReapproRegle(
  stock: number,
  min: number,
  max: number,
  besoin: number,
): Insight {
  if (stock < min) {
    return {
      title: 'Sous le seuil minimum',
      interpretation: `Stock actuel ${stock} < min ${min}. Il manque ${besoin} unité(s) pour atteindre le max (${max}).`,
      recommendation: 'Lancer le réappro : transfert depuis le hub, ou commande d\'achat si le hub est aussi à sec.',
      severity: 'critical',
    };
  }
  return {
    title: 'Dans la fourchette',
    interpretation: `Stock actuel ${stock}, entre le min (${min}) et le max (${max}). Aucune action nécessaire.`,
    severity: 'ok',
  };
}

export function insightInventaireAvancement(
  comptees: number,
  total: number,
  ecarts: number,
): Insight {
  if (total === 0) {
    return {
      title: 'Session vide',
      interpretation: 'Aucune ligne figée dans cette session (entrepôt sans produit actif au moment de l\'ouverture).',
      severity: 'neutral',
    };
  }
  const complet = comptees >= total;
  return {
    title: 'Avancement du comptage',
    interpretation: `${comptees}/${total} ligne(s) comptée(s)${
      ecarts > 0 ? `, dont ${ecarts} avec un écart entre théorique et réel` : ''
    }.`,
    recommendation: !complet
      ? 'Terminer le comptage de toutes les lignes avant de pouvoir faire valider par un tiers.'
      : ecarts > 0
        ? 'Faire valider par un utilisateur distinct de l\'initiateur : les écarts seront appliqués en écritures d\'ajustement.'
        : undefined,
    severity: !complet ? 'neutral' : ecarts > 0 ? 'warning' : 'ok',
  };
}

export function insightInventaireEcartsKpi(ecarts: number, unitesEcart: number): Insight {
  if (ecarts === 0) {
    return {
      title: 'Écarts de comptage',
      interpretation: 'Aucune ligne comptée ne diverge du théorique figé à l’ouverture, pour l’instant.',
      severity: 'ok',
    };
  }
  return {
    title: 'Écarts de comptage',
    interpretation: `${ecarts} ligne(s) comptée(s) diffèrent du théorique, pour ${unitesEcart} unité(s) d’écart cumulées (surplus et manquants confondus).`,
    recommendation:
      'Recompter les lignes en écart en cas de doute — à la validation, l’écart sera posé tel quel en écriture d’ajustement, non modifiable ensuite.',
    severity: 'warning',
  };
}

export function insightInventaireValeurEcarts(valeurEcarts: number, ecarts: number): Insight {
  if (ecarts === 0) {
    return {
      title: 'Écart valorisé (CMP)',
      interpretation: 'Aucun écart à valoriser : le comptage confirme le théorique sur les lignes déjà saisies.',
      severity: 'ok',
    };
  }
  return {
    title: 'Écart valorisé (CMP)',
    interpretation: `${valeurEcarts.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA d’écart indicatif, au coût moyen pondéré actuel des produits concernés. Ce montant n’est pas encore écrit en stock : il ne le sera qu’à la validation par un tiers, en écriture d’ajustement.`,
    severity: 'neutral',
  };
}

export function insightInventaireRestant(restant: number, total: number): Insight {
  if (total === 0) {
    return {
      title: 'Lignes restantes',
      interpretation: 'Session sans ligne à compter (entrepôt sans produit actif à l’ouverture).',
      severity: 'neutral',
    };
  }
  if (restant === 0) {
    return {
      title: 'Lignes restantes',
      interpretation: 'Toutes les lignes ont été comptées : la session peut être soumise à validation par un tiers.',
      severity: 'ok',
    };
  }
  return {
    title: 'Lignes restantes',
    interpretation: `${restant} ligne(s) sur ${total} n’ont pas encore de quantité comptée. La validation par un tiers est bloquée tant que le comptage n’est pas complet.`,
    recommendation:
      'Terminer la saisie de toutes les lignes, ou reporter le théorique restant si le comptage s’arrête là.',
    severity: 'warning',
  };
}

// Traçabilité d'un mouvement de stock unitaire — chaque ligne du journal des
// stocks est une écriture immuable (grand livre append-only, CLAUDE.md).
export function insightMouvementTracabilite(
  type: 'RECEPTION' | 'VENTE' | 'RETOUR' | 'AJUSTEMENT' | 'TRANSFERT_OUT' | 'TRANSFERT_IN' | 'SCRAP',
  quantite: number,
  stockApres: number,
): Insight {
  if (type === 'AJUSTEMENT') {
    return {
      title: 'Écriture d’ajustement',
      interpretation: `Correction posée après validation d’un inventaire ou d’un contrôle SI, pour ${
        quantite > 0 ? `+${quantite}` : quantite
      } unité(s), amenant le stock à ${stockApres}. Écriture figée, non modifiable a posteriori.`,
      recommendation: 'Toute nouvelle correction se fait par une écriture compensatoire, jamais par édition de celle-ci.',
      severity: 'warning',
    };
  }
  if (type === 'SCRAP') {
    return {
      title: 'Rebut',
      interpretation: `${Math.abs(quantite)} unité(s) sorties du stock pour mise au rebut, amenant le stock à ${stockApres}. Écriture figée du journal des mouvements.`,
      severity: 'critical',
    };
  }
  return {
    title: 'Mouvement tracé',
    interpretation: `Ce mouvement fait partie du journal immuable des stocks : il ne peut être ni modifié ni supprimé, seulement compensé par un mouvement inverse tracé. Stock résultant : ${stockApres} unité(s).`,
    severity: 'neutral',
  };
}

export function insightInventaireLigneEcart(
  quantiteTheorique: number,
  quantiteComptee: number | null,
  cmp: number,
): Insight {
  if (quantiteComptee === null) {
    return {
      title: 'Ligne non comptée',
      interpretation: `Théorique figé à ${quantiteTheorique} unité(s) à l’ouverture de la session. Aucune quantité comptée saisie pour l’instant.`,
      severity: 'neutral',
    };
  }
  const ecart = quantiteComptee - quantiteTheorique;
  if (ecart === 0) {
    return {
      title: 'Comptage conforme',
      interpretation: `Quantité comptée (${quantiteComptee}) identique au théorique figé (${quantiteTheorique}). Aucune écriture d’ajustement ne sera posée sur cette ligne.`,
      severity: 'ok',
    };
  }
  const valeur = Math.round(Math.abs(ecart) * cmp);
  return {
    title: ecart > 0 ? 'Surplus au comptage' : 'Manquant au comptage',
    interpretation: `Compté ${quantiteComptee} contre ${quantiteTheorique} théorique, soit ${
      ecart > 0 ? `+${ecart}` : ecart
    } unité(s) (≈ ${valeur.toLocaleString('fr-FR')} FCFA au CMP actuel).`,
    recommendation:
      'Recompter si un doute existe : à la validation, cet écart sera posé en écriture d’ajustement, non modifiable ensuite.',
    severity: ecart < 0 ? 'critical' : 'warning',
  };
}
