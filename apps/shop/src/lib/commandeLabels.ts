/** Libellés FR + timeline de suivi commande web (shop). */

export const STATUT_LABELS: Record<string, string> = {
  PANIER: 'Panier',
  EN_ATTENTE_PAIEMENT: 'En attente de paiement',
  PAYEE: 'Payée',
  PREPARATION: 'En préparation',
  PRETE: 'Prête au retrait',
  EXPEDIEE: 'Expédiée',
  LIVREE: 'Livrée',
  REMISE: 'Remise en boutique',
  ANNULEE: 'Annulée',
  REMBOURSEE: 'Remboursée',
  LITIGE: 'Litige',
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  RETRAIT_BOUTIQUE: 'Retrait en boutique',
  LIVRAISON: 'Livraison',
};

export const REGLEMENT_LABELS: Record<string, string> = {
  PREPAYE_PSP: 'Paiement en ligne',
  PAIEMENT_RETRAIT: 'Paiement au retrait',
  PAIEMENT_LIVRAISON: 'Paiement à la livraison',
};

export function labelStatut(statut: string): string {
  return STATUT_LABELS[statut] ?? statut.replaceAll('_', ' ');
}

export function labelFulfillment(mode: string): string {
  return FULFILLMENT_LABELS[mode] ?? mode;
}

export function labelReglement(mode: string): string {
  return REGLEMENT_LABELS[mode] ?? mode;
}

export type TimelineStep = {
  id: string;
  label: string;
  /** done | current | upcoming | blocked */
  state: 'done' | 'current' | 'upcoming' | 'blocked';
};

const TERMINAL_KO = new Set(['ANNULEE', 'REMBOURSEE', 'LITIGE']);

function pipeline(
  modeFulfillment: string,
  modeReglement: string,
): Array<{ id: string; label: string; statuts: string[] }> {
  const isPsp = modeReglement === 'PREPAYE_PSP';
  const isRetrait = modeFulfillment === 'RETRAIT_BOUTIQUE';

  const steps: Array<{ id: string; label: string; statuts: string[] }> = [
    {
      id: 'recue',
      label: 'Commande reçue',
      statuts: [
        'EN_ATTENTE_PAIEMENT',
        'PAYEE',
        'PREPARATION',
        'PRETE',
        'EXPEDIEE',
        'LIVREE',
        'REMISE',
      ],
    },
  ];

  if (isPsp) {
    steps.push({
      id: 'paiement',
      label: 'Paiement confirmé',
      statuts: ['PAYEE', 'PREPARATION', 'PRETE', 'EXPEDIEE', 'LIVREE', 'REMISE'],
    });
  }

  steps.push({
    id: 'prep',
    label: 'En préparation',
    statuts: ['PREPARATION', 'PRETE', 'EXPEDIEE', 'LIVREE', 'REMISE'],
  });

  if (isRetrait) {
    steps.push({
      id: 'prete',
      label: 'Prête au retrait',
      statuts: ['PRETE', 'REMISE', ...(isPsp ? [] : ['PAYEE'])],
    });
    steps.push({
      id: 'finale',
      label: isPsp ? 'Remise en boutique' : 'Remise & paiement',
      statuts: ['REMISE', ...(isPsp ? [] : ['PAYEE'])],
    });
  } else {
    steps.push({
      id: 'exp',
      label: 'Expédiée',
      statuts: ['EXPEDIEE', 'LIVREE', ...(isPsp ? [] : ['PAYEE'])],
    });
    steps.push({
      id: 'finale',
      label: isPsp ? 'Livrée' : 'Livrée & paiement',
      statuts: ['LIVREE', ...(isPsp ? [] : ['PAYEE'])],
    });
  }

  return steps;
}

/** Construit la timeline visuelle selon statut + modes. */
export function buildTimeline(
  statut: string,
  modeFulfillment: string,
  modeReglement: string,
): TimelineStep[] {
  const steps = pipeline(modeFulfillment, modeReglement);

  if (TERMINAL_KO.has(statut)) {
    return steps.map((s, i) => ({
      id: s.id,
      label: s.label,
      state: i === 0 ? 'done' : 'blocked',
    }));
  }

  let currentIndex = -1;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].statuts.includes(statut)) {
      currentIndex = i;
      break;
    }
  }

  // Commande reçue toujours atteinte si on a un suivi
  if (currentIndex < 0) currentIndex = 0;

  // Si PSP et encore EN_ATTENTE_PAIEMENT : étape 0 done, 1 current
  if (statut === 'EN_ATTENTE_PAIEMENT') {
    currentIndex = 0;
  }

  const isFinalDone =
    (modeFulfillment === 'RETRAIT_BOUTIQUE' &&
      (statut === 'REMISE' ||
        (modeReglement !== 'PREPAYE_PSP' && statut === 'PAYEE'))) ||
    (modeFulfillment === 'LIVRAISON' &&
      (statut === 'LIVREE' ||
        (modeReglement !== 'PREPAYE_PSP' && statut === 'PAYEE')));

  return steps.map((s, i) => {
    let state: TimelineStep['state'] = 'upcoming';
    if (isFinalDone && i <= currentIndex) {
      state = 'done';
    } else if (i < currentIndex) {
      state = 'done';
    } else if (i === currentIndex) {
      state = isFinalDone ? 'done' : 'current';
    }
    return { id: s.id, label: s.label, state };
  });
}

export function messageAideStatut(
  statut: string,
  modeFulfillment: string,
  modeReglement: string,
): string {
  if (statut === 'EN_ATTENTE_PAIEMENT') {
    return 'Finalisez le paiement en ligne. La commande passera automatiquement en préparation dès confirmation du prestataire.';
  }
  if (statut === 'PREPARATION') {
    if (modeReglement === 'PAIEMENT_LIVRAISON') {
      return 'Commande enregistrée. Vous réglerez au livreur (espèces ou mobile money). Nous préparons le colis.';
    }
    if (modeReglement === 'PAIEMENT_RETRAIT') {
      return 'Commande enregistrée. Vous paierez au retrait en boutique. Notre équipe prépare votre commande.';
    }
    return modeFulfillment === 'RETRAIT_BOUTIQUE'
      ? 'Notre équipe prépare votre commande. Vous serez notifié dès qu’elle sera prête au retrait.'
      : 'Notre équipe prépare votre colis. Vous serez notifié dès l’expédition.';
  }
  if (statut === 'PRETE') {
    return modeReglement === 'PAIEMENT_RETRAIT'
      ? 'Votre commande est prête. Présentez-vous en boutique avec votre référence — paiement au retrait.'
      : 'Votre commande est prête. Présentez-vous en boutique avec votre référence.';
  }
  if (statut === 'EXPEDIEE') {
    return modeReglement === 'PAIEMENT_LIVRAISON'
      ? 'Votre colis est en route. Préparez le règlement à remettre au livreur.'
      : 'Votre colis est en route. Gardez cet e-mail / ce lien pour le suivi.';
  }
  if (statut === 'LIVREE' || statut === 'REMISE') {
    return modeReglement === 'PREPAYE_PSP'
      ? 'Commande terminée — merci pour votre confiance.'
      : 'Commande remise. Le règlement a été (ou sera) encaissé selon le mode choisi.';
  }
  if (statut === 'PAYEE') {
    return 'Paiement confirmé. Merci !';
  }
  if (statut === 'ANNULEE') {
    return 'Cette commande a été annulée.';
  }
  if (statut === 'REMBOURSEE') {
    return 'Cette commande a été remboursée.';
  }
  if (statut === 'LITIGE') {
    return 'Un litige est ouvert. Notre service client vous contactera.';
  }
  return 'Nous vous tiendrons informé de chaque étape par e-mail.';
}

export type ProchainGeste = {
  titre: string;
  detail: string;
  variant: 'payer' | 'retirer' | 'livraison' | 'attente' | 'ok' | 'ko';
};

export function prochainGeste(
  statut: string,
  modeFulfillment: string,
  modeReglement: string,
): ProchainGeste {
  if (statut === 'ANNULEE' || statut === 'REMBOURSEE' || statut === 'LITIGE') {
    return {
      titre: labelStatut(statut),
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: 'ko',
    };
  }
  if (statut === 'EN_ATTENTE_PAIEMENT' && modeReglement === 'PREPAYE_PSP') {
    return {
      titre: 'Paiement en ligne à finaliser',
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: 'payer',
    };
  }
  if (modeReglement === 'PAIEMENT_LIVRAISON' && statut !== 'LIVREE' && statut !== 'PAYEE') {
    return {
      titre: 'Paiement à la livraison',
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: statut === 'EXPEDIEE' ? 'livraison' : 'attente',
    };
  }
  if (modeReglement === 'PAIEMENT_RETRAIT' && statut !== 'REMISE' && statut !== 'PAYEE') {
    return {
      titre: 'Paiement au retrait',
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: statut === 'PRETE' ? 'retirer' : 'attente',
    };
  }
  if (statut === 'PRETE') {
    return {
      titre: 'À récupérer en boutique',
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: 'retirer',
    };
  }
  if (statut === 'EXPEDIEE') {
    return {
      titre: 'Colis en route',
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: 'livraison',
    };
  }
  if (statut === 'LIVREE' || statut === 'REMISE' || statut === 'PAYEE') {
    return {
      titre: 'Commande terminée',
      detail: messageAideStatut(statut, modeFulfillment, modeReglement),
      variant: 'ok',
    };
  }
  return {
    titre: labelStatut(statut),
    detail: messageAideStatut(statut, modeFulfillment, modeReglement),
    variant: 'attente',
  };
}

export function formatDateFr(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
