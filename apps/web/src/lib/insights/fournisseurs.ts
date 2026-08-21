import type { Insight } from './types';

export function insightListeFournisseurs(count: number, jamaisLivres: number): Insight {
  if (count === 0) {
    return {
      title: 'Fournisseurs',
      interpretation:
        'Aucun fournisseur enregistré : impossible de saisir une réception de stock.',
      recommendation:
        'Créer au moins une fiche fournisseur (Responsable SI / Direction) avant d’approvisionner.',
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
