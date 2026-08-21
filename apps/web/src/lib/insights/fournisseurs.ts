import type { Insight } from './types';

// Insights fournisseurs / réceptions — ancrés sur l’UI réelle (liste,
// réception stock, prix d’achat vs CMP catalogue). Pas de seuil inventé.

export function insightListeFournisseurs(count: number): Insight {
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
  return {
    title: 'Fournisseurs',
    interpretation: `${count} fournisseur(s). Chaque réception met à jour le stock et le coût moyen pondéré (CMP) du produit.`,
    severity: 'info',
  };
}

export function insightReceptionStock(): Insight {
  return {
    title: 'Réception de stock',
    interpretation:
      'Enregistre une entrée de stock chez le fournisseur : quantité et prix d’achat alimentent le CMP et la quantité disponible à la vente.',
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

export function insightApprovisionnement(): Insight {
  return {
    title: 'Approvisionnement',
    interpretation:
      'Depuis cette colonne : enregistrer une réception (entrée stock + CMP) ou consulter l’historique des réceptions du fournisseur.',
    severity: 'info',
  };
}
