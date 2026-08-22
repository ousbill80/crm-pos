import type { Insight } from './types';

export function insightListeFournisseurs(count: number, jamaisLivres: number): Insight {
  if (count === 0) {
    return {
      title: 'Fournisseurs',
      interpretation:
        'Aucun fournisseur enregistré : impossible de saisir une réception de stock.',
      recommendation:
        'Créer au moins une fiche fournisseur (DAF / SI / Direction) avant d’approvisionner.',
      severity: 'warning',
    };
  }
  if (jamaisLivres > 0) {
    return {
      title: 'Fournisseurs',
      interpretation: `${count} fiche(s), dont ${jamaisLivres} sans aucune réception.`,
      recommendation: 'Compléter la fiche ou enregistrer la première livraison pour suivre le CMP.',
      severity: 'info',
    };
  }
  return {
    title: 'Fournisseurs',
    interpretation: `${count} fournisseur(s). Chaque réception met à jour le stock et le coût moyen pondéré (CMP).`,
    severity: 'ok',
  };
}

export function insightApprovisionnement(): Insight {
  return {
    title: 'Approvisionnement',
    interpretation:
      'Historique des réceptions de ce fournisseur : quantités, prix d’achat et écart au CMP catalogue.',
    recommendation: 'Ouvrir la fiche pour comparer les prix d’achat successifs avant la prochaine commande.',
    severity: 'neutral',
  };
}

export function insightReceptionStock(): Insight {
  return {
    title: 'Réception de stock',
    interpretation:
      'Entrée de stock chez le fournisseur : quantité, prix d’achat et entrepôt alimentent le grand livre et le CMP. La référence BL est facultative (pas un bon de commande).',
    recommendation:
      'Cibler de préférence l’entrepôt PRINCIPAL du magasin qui vendra ces articles.',
    severity: 'info',
  };
}

export function insightPrixAchatVsCmp(
  prixAchat: number | null,
  cmp: number | null,
  designation?: string,
): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const produit = designation ? ` (${designation})` : '';

  if (prixAchat === null || prixAchat <= 0) {
    return {
      title: 'Prix d’achat',
      interpretation:
        'Saisir le prix d’achat unitaire réel : il entre dans le calcul du coût moyen pondéré après validation.',
      severity: 'info',
    };
  }

  if (cmp === null || cmp <= 0) {
    return {
      title: 'Prix d’achat',
      interpretation: `${fmt(prixAchat)} FCFA${produit}. Aucun CMP existant — cette réception initialisera le coût moyen.`,
      severity: 'neutral',
    };
  }

  const ecart = prixAchat - cmp;
  const pct = Math.round((ecart / cmp) * 100);
  if (Math.abs(ecart) < 0.5) {
    return {
      title: 'Prix d’achat aligné au CMP',
      interpretation: `${fmt(prixAchat)} FCFA ≈ CMP actuel ${fmt(cmp)} FCFA${produit}.`,
      severity: 'ok',
    };
  }
  if (ecart > 0) {
    return {
      title: 'Prix d’achat au-dessus du CMP',
      interpretation: `${fmt(prixAchat)} FCFA vs CMP ${fmt(cmp)} FCFA (${pct > 0 ? '+' : ''}${pct} %)${produit}. Le CMP montera après réception.`,
      severity: 'warning',
    };
  }
  return {
    title: 'Prix d’achat sous le CMP',
    interpretation: `${fmt(prixAchat)} FCFA vs CMP ${fmt(cmp)} FCFA (${pct} %)${produit}. Le CMP baissera après réception.`,
    severity: 'info',
  };
}

export function insightHaussesPrix(count: number): Insight {
  if (count === 0) {
    return {
      title: 'Prix d’achat',
      interpretation: 'Aucune hausse de prix entre deux réceptions successives du même article.',
      severity: 'ok',
    };
  }
  return {
    title: 'Hausses de prix d’achat',
    interpretation: `${count} article(s) plus chers que la livraison précédente chez le même fournisseur.`,
    recommendation: 'Comparer avec le CMP catalogue avant de valider la prochaine réception.',
    severity: 'warning',
  };
}

export function insightMontantAchats(montant30j: number, receptions30j: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  return {
    title: 'Achats 30 jours',
    interpretation: `${fmt(montant30j)} FCFA sur ${receptions30j} réception(s) — valeur d’entrée stock, pas une facture fournisseur.`,
    severity: receptions30j === 0 ? 'info' : 'ok',
  };
}

export function insightAFacturer(count: number, montant: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (count === 0) {
    return {
      title: 'À facturer',
      interpretation: 'Aucune réception en attente de facture fournisseur.',
      severity: 'ok',
    };
  }
  return {
    title: 'À facturer',
    interpretation: `${count} réception(s) non facturée(s) · ${fmt(montant)} FCFA.`,
    recommendation:
      'Créer un brouillon de facture, puis le comptabiliser avant paiement DAF / Caissier Central.',
    severity: 'warning',
  };
}

export function insightEncoursFournisseur(encours: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (encours <= 0) {
    return {
      title: 'À payer',
      interpretation: 'Aucun reste dû sur les factures comptabilisées.',
      severity: 'ok',
    };
  }
  return {
    title: 'À payer',
    interpretation: `${fmt(encours)} FCFA restant(s) à régler (grand livre Achats, hors caisse boutique).`,
    recommendation: 'Ouvrir les factures partiellement payées ou comptabilisées pour enregistrer un paiement.',
    severity: 'warning',
  };
}

export function insightFacturesEnRetard(count: number, montant: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (count === 0) {
    return {
      title: 'Échéances',
      interpretation: 'Aucune facture échue avec reste à payer.',
      severity: 'ok',
    };
  }
  return {
    title: 'Factures en retard',
    interpretation: `${count} facture(s) échue(s) · ${fmt(montant)} FCFA encore dus.`,
    recommendation: 'Prioriser le règlement DAF / Caissier Central sur ces échéances.',
    severity: 'critical',
  };
}

export function insightFacturesPayees(payees: number, total: number): Insight {
  if (total === 0) {
    return {
      title: 'Payées',
      interpretation: 'Aucune facture enregistrée sur le périmètre.',
      severity: 'info',
    };
  }
  return {
    title: 'Factures payées',
    interpretation: `${payees} / ${total} facture(s) soldée(s).`,
    severity: payees === total ? 'ok' : 'info',
  };
}

export function insightCommandesBrouillon(count: number): Insight {
  if (count === 0) {
    return {
      title: 'Brouillons',
      interpretation: 'Aucun bon de commande en brouillon.',
      severity: 'ok',
    };
  }
  return {
    title: 'Brouillons',
    interpretation: `${count} bon(s) non confirmé(s) — pas encore d’engagement fournisseur.`,
    recommendation: 'Confirmer (DAF / SI / Direction / responsable boutique) avant toute réception.',
    severity: 'info',
  };
}

export function insightCommandesOuvertes(count: number, unitesRestantes: number): Insight {
  if (count === 0) {
    return {
      title: 'Ouvertes',
      interpretation: 'Aucune commande confirmée en attente de première réception.',
      severity: 'ok',
    };
  }
  return {
    title: 'Commandes ouvertes',
    interpretation: `${count} commande(s) confirmée(s) · ${unitesRestantes} unité(s) encore à recevoir.`,
    recommendation: 'Réception centrale (DAF / SI / Direction) plafonnée à la quantité commandée.',
    severity: 'warning',
  };
}

export function insightCommandesPartielles(count: number): Insight {
  if (count === 0) {
    return {
      title: 'Partielles',
      interpretation: 'Aucune réception partielle en cours.',
      severity: 'ok',
    };
  }
  return {
    title: 'Réceptions partielles',
    interpretation: `${count} commande(s) partiellement réceptionnée(s).`,
    recommendation: 'Terminer les lignes restantes avant clôture.',
    severity: 'warning',
  };
}

export function insightCommandesReceptionnees(count: number): Insight {
  if (count === 0) {
    return {
      title: 'Réceptionnées',
      interpretation: 'Aucune commande intégralement reçue en attente de clôture.',
      severity: 'ok',
    };
  }
  return {
    title: 'Réceptionnées',
    interpretation: `${count} commande(s) reçue(s) à 100 % — à clôturer.`,
    recommendation: 'Clôturer le bon une fois les factures engagées.',
    severity: 'info',
  };
}

export function insightFicheFournisseurCircuit(): Insight {
  return {
    title: 'Fiche fournisseur',
    interpretation:
      'Réceptions et commandes (DAF / SI / Direction) → factures → paiements (DAF / Caissier Central). Le cumul d’achats couvre tout le réseau, pas une seule boutique.',
    severity: 'neutral',
  };
}

export function insightCumulAchatsFournisseur(montant: number, produitsDistincts: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (montant <= 0) {
    return {
      title: 'Cumul achats',
      interpretation: 'Aucun achat enregistré pour ce fournisseur.',
      severity: 'info',
    };
  }
  return {
    title: 'Cumul achats',
    interpretation: `${fmt(montant)} FCFA sur ${produitsDistincts} article(s) distinct(s) — toutes réceptions confondues, valeur d’entrée stock.`,
    severity: 'ok',
  };
}

export function insightPaiementsFournisseur(count: number, totalPaye: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (count === 0) {
    return {
      title: 'Paiements',
      interpretation: 'Aucun paiement enregistré à ce fournisseur.',
      severity: 'info',
    };
  }
  return {
    title: 'Paiements',
    interpretation: `${count} règlement(s) · ${fmt(totalPaye)} FCFA versé(s) — grand livre Achats (DAF / Caissier Central).`,
    severity: 'ok',
  };
}

export function insightDernierPaiementFournisseur(
  dateIso: string | null,
  montant: number | null,
): Insight {
  if (!dateIso || montant === null) {
    return {
      title: 'Dernier paiement',
      interpretation: 'Aucun règlement effectué pour l’instant.',
      severity: 'info',
    };
  }
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  return {
    title: 'Dernier paiement',
    interpretation: `${fmt(montant)} FCFA réglé le plus récemment sur ce fournisseur.`,
    severity: 'neutral',
  };
}

export function insightCircuitCommandeAchat(): Insight {
  return {
    title: 'Bon de commande',
    interpretation:
      'Brouillon → confirmée (DAF / SI / Direction / responsable boutique) → réceptionnée partiellement ou totalement (DAF / SI / Direction) → clôturée. Une commande groupe alimente le hub ENTREE puis se répartit vers les boutiques.',
    severity: 'neutral',
  };
}

export function insightMontantCommande(montant: number, nbLignes: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  return {
    title: 'Montant commandé',
    interpretation: `${fmt(montant)} FCFA sur ${nbLignes} ligne(s) — engagement fournisseur, distinct du montant facturé.`,
    severity: 'neutral',
  };
}

export function insightReceptionCommande(
  quantiteRecue: number,
  quantite: number,
  pct: number,
): Insight {
  if (quantite === 0) {
    return {
      title: 'Réception',
      interpretation: 'Commande sans quantité — rien à réceptionner.',
      severity: 'info',
    };
  }
  if (pct === 0) {
    return {
      title: 'Réception',
      interpretation: `0 / ${quantite} unité(s) reçue(s). Aucune réception enregistrée pour l’instant.`,
      severity: 'info',
    };
  }
  if (pct >= 100) {
    return {
      title: 'Réception',
      interpretation: `${quantiteRecue} / ${quantite} unité(s) reçue(s) — commande intégralement livrée.`,
      recommendation: 'Clôturer le bon une fois les factures engagées.',
      severity: 'ok',
    };
  }
  return {
    title: 'Réception',
    interpretation: `${quantiteRecue} / ${quantite} unité(s) reçue(s) (${pct} %) — livraison partielle.`,
    recommendation: 'Le solde reste à réceptionner avant clôture.',
    severity: 'warning',
  };
}

export function insightFacturesLieesCommande(count: number, nonFacturees: number): Insight {
  if (count === 0) {
    return {
      title: 'Factures liées',
      interpretation: 'Aucune facture rattachée à cette commande pour l’instant.',
      severity: nonFacturees > 0 ? 'info' : 'ok',
    };
  }
  if (nonFacturees > 0) {
    return {
      title: 'Factures liées',
      interpretation: `${count} facture(s) rattachée(s) · ${nonFacturees} réception(s) encore hors facture.`,
      recommendation: 'Facturer les réceptions restantes (SI / Direction / DAF).',
      severity: 'warning',
    };
  }
  return {
    title: 'Factures liées',
    interpretation: `${count} facture(s) rattachée(s) — toutes les réceptions sont facturées.`,
    severity: 'ok',
  };
}
