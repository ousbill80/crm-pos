import { NiveauFidelite } from '@caisse-crm/shared';
import type { ClientDto } from '../types';
import type { Insight } from './types';

// Insights POS ancrés sur des règles déjà en vigueur (plafond remise 20 %
// serveur, caisse magasin, vente anonyme §6.6, litige = Caissier Central).
// Aucun seuil monétaire inventé.

export function insightRemisePos(remise: number, brut: number): Insight {
  const plafond = brut * 0.2;
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (brut <= 0) {
    return {
      title: 'Remise',
      interpretation: "Aucune ligne au panier : la remise n'a pas d'effet.",
      severity: 'neutral',
    };
  }
  if (remise <= 0) {
    return {
      title: 'Remise',
      interpretation: `Plafond serveur : 20 % du montant brut, soit ${fmt(plafond)} FCFA. Au-delà, il faut une dérogation du Responsable boutique.`,
      severity: 'info',
    };
  }
  if (remise > plafond) {
    return {
      title: 'Remise au-dessus du plafond',
      interpretation: `${fmt(remise)} FCFA dépasse le plafond de 20 % (${fmt(plafond)} FCFA). Sans dérogation, l'API refuse l'encaissement.`,
      recommendation:
        'Réduire la remise, ou faire saisir login et mot de passe du Responsable boutique (pas le caissier) pour une dérogation journalisée.',
      severity: 'critical',
    };
  }
  const ratio = remise / brut;
  const proche = ratio >= 0.16;
  return {
    title: 'Remise',
    interpretation: `${fmt(remise)} FCFA, soit ${Math.round(ratio * 100)} % du brut (plafond 20 % = ${fmt(plafond)} FCFA).`,
    recommendation: proche
      ? 'Vous approchez du plafond de 20 % appliqué après répartition sur les lignes.'
      : undefined,
    severity: proche ? 'warning' : 'info',
  };
}

export function insightSessionPos(input: {
  nombreVentes: number;
  chiffreAffaires: number;
  dureeMinutes: number;
}): Insight {
  const ca = Math.round(input.chiffreAffaires).toLocaleString('fr-FR');
  return {
    title: 'Session de caisse',
    interpretation: `${input.nombreVentes} vente(s) pour ${ca} FCFA, ouverte depuis ${input.dureeMinutes} min. La clôture génère un bordereau d'espèces au statut Initiée.`,
    recommendation:
      'Clôturer en fin de service. La boutique initie le versement ; elle ne peut ni réceptionner ni valider (§1, §6.4).',
    severity: 'info',
  };
}

export function insightCaisseAuxiliairePos(): Insight {
  return {
    title: 'Tiroir de caisse',
    interpretation:
      'Le POS s’ouvre sur un tiroir (poste de caisse) de la boutique. Les ventes y sont encaissées ; à la clôture, le magasin initie le versement. Le tiroir ne peut jamais valider, réceptionner ni solder une transaction (§1, §6.4).',
    severity: 'info',
  };
}

export function insightClientPos(client: ClientDto | null): Insight {
  if (!client) {
    return {
      title: 'Vente anonyme',
      interpretation:
        "Aucun client rattaché — la vente anonyme reste toujours possible (§6.6). L'historique d'achats et la fidélité ne seront pas mis à jour.",
      recommendation:
        'Rattacher la fiche si le client est identifié, pour consolider son historique réseau.',
      severity: 'neutral',
    };
  }
  const points = client.fidelite?.pointsCumules ?? 0;
  const niveau = client.fidelite?.niveau ?? NiveauFidelite.BRONZE;
  return {
    title: `${client.prenom} ${client.nom}`,
    interpretation: `Segment ${client.segment}, palier ${niveau}, ${points} point(s). Fiche unique réseau — l'achat sera visible depuis n'importe quelle boutique.`,
    severity: 'info',
  };
}

export function insightMonnaiePos(recu: number, total: number): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (recu <= 0) {
    return {
      title: 'Espèces',
      interpretation: `Total à encaisser : ${fmt(total)} FCFA. Saisir le montant reçu pour calculer la monnaie.`,
      severity: 'info',
    };
  }
  const rendu = recu - total;
  if (rendu < 0) {
    return {
      title: 'Montant insuffisant',
      interpretation: `Reçu ${fmt(recu)} FCFA pour un total de ${fmt(total)} FCFA.`,
      recommendation: 'Le reçu doit être au moins égal au total avant validation.',
      severity: 'warning',
    };
  }
  return {
    title: 'Monnaie à rendre',
    interpretation: `Reçu ${fmt(recu)} FCFA — monnaie ${fmt(rendu)} FCFA. Calcul d'interface uniquement : l'API n'enregistre que le mode ESPECES et le total.`,
    severity: 'ok',
  };
}

export function insightEcartCloture(
  fondTheorique: number,
  fondCompte: number | null,
): Insight {
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
  if (fondCompte === null) {
    return {
      title: 'Fond théorique',
      interpretation: `Fond initial + ventes espèces − retours espèces = ${fmt(fondTheorique)} FCFA. Aide au comptage, calculée côté caisse.`,
      recommendation:
        "Un écart au comptage n'ouvre pas un litige ici. Le litige naît au rapprochement par le Caissier Central (§6.4).",
      severity: 'info',
    };
  }
  const ecart = fondCompte - fondTheorique;
  if (Math.abs(ecart) < 0.5) {
    return {
      title: 'Comptage aligné',
      interpretation: `Fond compté égal au fond théorique (${fmt(fondTheorique)} FCFA).`,
      severity: 'ok',
    };
  }
  return {
    title: 'Écart de comptage',
    interpretation: `Fond compté ${fmt(fondCompte)} FCFA vs théorique ${fmt(fondTheorique)} FCFA (écart ${ecart > 0 ? '+' : ''}${fmt(ecart)} FCFA).`,
    recommendation:
      "Cet écart est informatif. Un litige n'est déclenché que par le Caissier Central lors du rapprochement (§6.4) — la boutique ne valide jamais.",
    severity: 'warning',
  };
}

export function insightTemoinOuverture(): Insight {
  return {
    title: 'Confirmateur d’ouverture',
    interpretation:
      'Double contrôle terrain (§5.1) : un coéquipier ou le responsable magasin présent valide l’ouverture (ou la clôture) avec son mot de passe. Il doit être de la même boutique et distinct du caissier au poste.',
    severity: 'info',
  };
}

export function insightCommandeEnAttente(count: number): Insight {
  return {
    title: 'File d’attente caisse',
    interpretation:
      'Comme en grande surface : le ticket est parqué (nom + motif). Le stock boutique est réservé côté serveur pour que l’autre caisse ne vende pas le dernier exemplaire. Ce n’est pas un encaissement : aucun ticket, aucun mouvement de grand livre tant que le client ne paie pas.',
    recommendation:
      count > 0
        ? `${count} ticket(s) en file — reprendre ou abandonner avant la clôture.`
        : 'F3 parque. La file (barre du haut) rappelle le plus ancien en premier.',
    severity: count > 0 ? 'info' : 'neutral',
  };
}

export function insightPaiementMixte(reste: number, nbModes: number): Insight {
  if (nbModes <= 1) {
    return {
      title: 'Règlement',
      interpretation:
        'Un seul mode : le total alimente ce mode. Un second mode (carte + espèces) répartit le ticket ; seule la part espèces entre dans le tiroir et le bordereau de clôture.',
      severity: 'neutral',
    };
  }
  if (Math.abs(reste) >= 0.5) {
    return {
      title: 'Paiement mixte incomplet',
      interpretation: `La somme des règlements doit égaler le total du ticket (reste ${Math.round(reste).toLocaleString('fr-FR')} FCFA).`,
      recommendation: 'Saisir les montants ou « Reste » sur le dernier mode.',
      severity: 'warning',
    };
  }
  return {
    title: 'Paiement mixte',
    interpretation:
      'Un ticket, plusieurs modes. Le stock n’est décrémenté qu’une fois. Le Z et le bordereau ne prennent que la part espèces.',
    severity: 'info',
  };
}

export function insightHorsLignePos(pending: number, online: boolean): Insight {
  if (!online) {
    return {
      title: 'Caisse hors ligne',
      interpretation:
        'Les encaissements sont mis en file locale et seront synchronisés à la reconnexion (append serveur, sans modifier une vente déjà enregistrée).',
      recommendation:
        pending > 0
          ? `${pending} ticket(s) en attente — ne pas clôturer la session tant que la file n'est pas vide.`
          : 'Vous pouvez encaisser ; la clôture reste bloquée tant qu’une vente n’est pas synchronisée.',
      severity: 'warning',
    };
  }
  if (pending > 0) {
    return {
      title: 'Synchronisation en cours',
      interpretation: `${pending} encaissement(s) encore en file d'attente. La synchro reprend dès que le réseau répond.`,
      recommendation: 'Ne pas clôturer la session tant que la file n’est pas vide — le bordereau espèces doit inclure toutes les ventes.',
      severity: 'warning',
    };
  }
  return {
    title: 'Caisse en ligne',
    interpretation: 'Les encaissements partent directement au serveur. File hors-ligne vide.',
    severity: 'ok',
  };
}
