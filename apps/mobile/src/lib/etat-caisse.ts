/** Libellés métier des relevés de session (§6.3.4) — jamais X/Z seuls. */

export function libellesEtatCaisse(type: 'X' | 'Z') {
  if (type === 'Z') {
    return {
      type,
      badge: 'Clôture',
      titre: 'Relevé de clôture',
      sousTitre:
        'La session est fermée. Ces totaux sont ceux de la fin de poste.',
      note: 'Ce document archive la clôture. L’écart tiroir est informatif : il ne crée pas un litige à lui seul.',
    };
  }
  return {
    type,
    badge: 'Contrôle',
    titre: 'Relevé de contrôle',
    sousTitre:
      'La caisse est encore ouverte. Aperçu des ventes en cours — ne ferme pas le tiroir.',
    note: 'Vous pouvez le consulter plusieurs fois. Pour arrêter la journée, clôturez le poste.',
  };
}

export const MODE_PAIEMENT_LABEL: Record<string, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  MOBILE_MONEY: 'Mobile money',
};

export function libelleModesPaiement(parts: {
  modePaiement: string;
  montant: string;
}[]): string {
  if (parts.length === 0) return '—';
  if (parts.length === 1) {
    return MODE_PAIEMENT_LABEL[parts[0].modePaiement] ?? parts[0].modePaiement;
  }
  return parts
    .map(
      (p) =>
        `${MODE_PAIEMENT_LABEL[p.modePaiement] ?? p.modePaiement}`,
    )
    .join(' + ');
}
