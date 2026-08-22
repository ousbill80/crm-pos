/** Libellés métier des relevés de session (§6.3.4) — jamais X/Z seuls. */

export function typeEtatDepuisStatut(ouverte: boolean): 'X' | 'Z' {
  return ouverte ? 'X' : 'Z';
}

export function libellesEtatCaisse(type: 'X' | 'Z') {
  if (type === 'Z') {
    return {
      type,
      badge: 'Clôture',
      court: 'Clôture',
      titre: 'Relevé de clôture',
      sousTitre: 'La session est fermée. Ces totaux sont ceux de la fin de poste.',
      note: 'Ce document archive la clôture. L’écart tiroir est informatif : il ne crée pas un litige à lui seul.',
      bouton: 'Relevé de clôture',
      boutonCourt: 'Clôture',
    };
  }
  return {
    type,
    badge: 'Contrôle',
    court: 'Contrôle',
    titre: 'Relevé de contrôle',
    sousTitre:
      'La caisse est encore ouverte. Ceci est un aperçu des ventes en cours : ça ne ferme pas le tiroir.',
    note: 'Vous pouvez l’imprimer plusieurs fois. Pour arrêter la journée, il faut clôturer (relevé de clôture).',
    bouton: 'Relevé de contrôle',
    boutonCourt: 'Contrôle',
  };
}
