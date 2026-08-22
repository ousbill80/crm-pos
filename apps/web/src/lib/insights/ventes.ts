import type { Insight } from './types';
import { STATUT_DEVIS, type StatutDevis } from '../devis-ui';

export function insightCaPeriode(total: string, nombreBoutiques: number): Insight {
  return {
    title: "Chiffre d'affaires (reporting)",
    interpretation:
      nombreBoutiques > 0
        ? `${total} FCFA de ventes cumulées sur ${nombreBoutiques} boutique(s), calculées par le module reporting (peut inclure des sessions hors de la liste ci-dessous selon la période).`
        : 'Aucune boutique dans le périmètre pour la période sélectionnée.',
    recommendation: 'Comparer au CA des sessions listées pour vérifier la cohérence sur la période affichée.',
    severity: 'info',
  };
}

export function insightCaSessionsListees(total: string, nombreSessions: number): Insight {
  return {
    title: 'CA des sessions listées',
    interpretation: `${total} FCFA cumulés sur les ${nombreSessions} session(s) actuellement affichées (selon le filtre statut/magasin).`,
    severity: 'info',
  };
}

export function insightTicketsListes(nombre: number, nombreSessions: number): Insight {
  return {
    title: 'Tickets listés',
    interpretation:
      nombreSessions > 0
        ? `${nombre} ticket(s) de vente enregistrés sur les sessions affichées, soit ${(nombre / nombreSessions).toFixed(1)} ticket(s) par session en moyenne.`
        : 'Aucune session affichée.',
    severity: 'info',
  };
}

export function insightSessionsOuvertes(total: number, ouvertes: number): Insight {
  const part = total > 0 ? (ouvertes / total) * 100 : 0;
  return {
    title: 'Sessions / ouvertes',
    interpretation:
      ouvertes > 0
        ? `${ouvertes} session(s) sur ${total} encore ouvertes (${part.toFixed(0)} %) — tiroir non clôturé, versement pas encore initié.`
        : `Aucune session ouverte sur les ${total} affichée(s) : toutes ont été clôturées.`,
    recommendation: ouvertes > 0 ? 'Cliquer pour filtrer les sessions ouvertes et vérifier les tiroirs en attente de clôture.' : undefined,
    severity: ouvertes > 0 ? 'warning' : 'ok',
  };
}

export function insightRepartitionModePaiement(mode: string, montant: string, totalTousModesConfondus: number): Insight {
  const part = totalTousModesConfondus > 0 ? (Number(montant) / totalTousModesConfondus) * 100 : 0;
  return {
    title: `Mode ${mode}`,
    interpretation: `${montant} FCFA encaissés en ${mode}, soit ${part.toFixed(0)} % du chiffre d'affaires de la période.`,
    severity: 'info',
  };
}

export function insightNombreTickets(nombre: number): Insight {
  return {
    title: 'Tickets',
    interpretation: `${nombre} ticket(s) de vente correspondant au filtre courant (session sélectionnée ou 8 dernières sessions).`,
    severity: 'info',
  };
}

export function insightTicketsAvecRemise(nombre: number, total: number): Insight {
  const part = total > 0 ? (nombre / total) * 100 : 0;
  return {
    title: 'Tickets avec remise',
    interpretation:
      nombre > 0
        ? `${nombre} ticket(s) sur ${total} comportent au moins une remise (${part.toFixed(0)} %).`
        : 'Aucun ticket avec remise sur ce périmètre.',
    recommendation: nombre > 0 ? 'Filtrer sur "Avec remise seulement" pour contrôler les rabais accordés en boutique.' : undefined,
    severity: nombre > 0 ? 'info' : 'ok',
  };
}

export function insightMontantRemises(montant: number): Insight {
  return {
    title: 'Remises cumulées',
    interpretation:
      montant > 0
        ? `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA de remises accordées sur les tickets affichés.`
        : 'Aucune remise accordée sur les tickets affichés.',
    severity: 'neutral',
  };
}

export function insightCa30Jours(total: string, joursAvecCa: number): Insight {
  return {
    title: 'CA 30 jours (série)',
    interpretation:
      joursAvecCa > 0
        ? `${total} FCFA de ventes cumulées sur les 30 derniers jours, réparties sur ${joursAvecCa} jour(s) avec activité.`
        : 'Aucune vente enregistrée sur les 30 derniers jours.',
    recommendation: 'Exporter le détail CSV pour une analyse jour par jour ou un rapprochement comptable.',
    severity: joursAvecCa > 0 ? 'info' : 'neutral',
  };
}

export function insightJoursAvecCa(joursAvecCa: number, joursTotal: number): Insight {
  const part = joursTotal > 0 ? (joursAvecCa / joursTotal) * 100 : 0;
  return {
    title: 'Jours avec CA',
    interpretation: `${joursAvecCa} jour(s) sur ${joursTotal} avec au moins une vente (${part.toFixed(0)} % de couverture).`,
    recommendation:
      part < 70
        ? 'Une couverture faible peut signaler des jours de fermeture ou une saisie POS incomplète — à vérifier avec les boutiques.'
        : undefined,
    severity: part < 70 ? 'warning' : 'ok',
  };
}

export function insightPanierMoyen(caTotal: number, nombreTickets: number): Insight {
  const panier = nombreTickets > 0 ? caTotal / nombreTickets : 0;
  return {
    title: 'Panier moyen',
    interpretation:
      nombreTickets > 0
        ? `${panier.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA en moyenne par ticket sur la période affichée (${nombreTickets} ticket(s)).`
        : 'Aucun ticket sur la période pour calculer un panier moyen.',
    severity: 'info',
  };
}

export function insightDevisBrouillons(nombre: number): Insight {
  return {
    title: 'Brouillons',
    interpretation:
      nombre > 0
        ? `${nombre} devis en brouillon, pas encore envoyés au client.`
        : 'Aucun devis en brouillon.',
    recommendation: nombre > 0 ? "Finaliser et envoyer ces devis pour qu'ils avancent dans le pipeline." : undefined,
    severity: nombre > 0 ? 'info' : 'neutral',
  };
}

export function insightDevisEnvoyes(nombre: number): Insight {
  return {
    title: 'Envoyés',
    interpretation:
      nombre > 0
        ? `${nombre} devis envoyés, en attente de réponse du client (accepté ou refusé).`
        : 'Aucun devis en attente de réponse.',
    recommendation: nombre > 0 ? 'Relancer les clients dont le devis est envoyé depuis plusieurs jours.' : undefined,
    severity: nombre > 0 ? 'warning' : 'ok',
  };
}

export function insightDevisAcceptes(nombre: number): Insight {
  return {
    title: 'Acceptés',
    interpretation:
      nombre > 0
        ? `${nombre} devis acceptés par le client, prêts à être transformés en vente.`
        : 'Aucun devis accepté en attente de transformation.',
    recommendation: nombre > 0 ? 'Transformer ces devis en vente pour encaisser (lien vente optionnel).' : undefined,
    severity: 'info',
  };
}

export function insightDevisPipeline(montant: number, total: number): Insight {
  return {
    title: 'Pipeline (brouillon + envoyé)',
    interpretation:
      montant > 0
        ? `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA HT en cours de négociation sur ${total} devis au total (brouillons + envoyés, hors acceptés/refusés/annulés/transformés).`
        : `Aucun montant en pipeline sur les ${total} devis existants.`,
    severity: montant > 0 ? 'info' : 'neutral',
  };
}

export function insightDevisStatutDetail(
  statut: StatutDevis,
  transitions: StatutDevis[],
): Insight {
  const suite =
    transitions.length > 0
      ? `Étape(s) suivante(s) possible(s) : ${transitions.map((t) => STATUT_DEVIS[t]).join(', ')}.`
      : 'Aucune transition possible : ce devis est dans un état final.';
  switch (statut) {
    case 'BROUILLON':
      return {
        title: 'Devis en brouillon',
        interpretation: `Ce devis est en préparation : ses lignes et notes restent modifiables. Il ne compte dans aucun chiffre d'affaires tant qu'il n'est pas transformé en vente. ${suite}`,
        recommendation: 'Envoyer le devis au client dès que les lignes et le montant sont validés.',
        severity: 'neutral',
      };
    case 'ENVOYE':
      return {
        title: 'Devis envoyé',
        interpretation: `Le devis a été transmis au client et n'est plus modifiable. En attente d'une réponse (accepté ou refusé). ${suite}`,
        recommendation: 'Relancer le client si la réponse tarde.',
        severity: 'warning',
      };
    case 'ACCEPTE':
      return {
        title: 'Devis accepté',
        interpretation: `Le client a accepté ce devis. ${suite}`,
        recommendation: 'Transformer en vente pour encaisser (le lien vers une vente existante reste optionnel, pas d\'ouverture automatique du POS).',
        severity: 'ok',
      };
    case 'REFUSE':
      return {
        title: 'Devis refusé',
        interpretation: `Le client a refusé ce devis. ${suite}`,
        severity: 'warning',
      };
    case 'ANNULE':
      return {
        title: 'Devis annulé',
        interpretation: `Ce devis a été annulé avant conclusion. ${suite}`,
        severity: 'neutral',
      };
    case 'TRANSFORME':
    default:
      return {
        title: 'Devis transformé',
        interpretation: `Ce devis a été transformé et est désormais clos, non modifiable. ${suite}`,
        severity: 'ok',
      };
  }
}

export function insightDevisMontantDetail(
  montantTotal: string,
  nombreLignes: number,
  montantRemises: number,
): Insight {
  const total = Number(montantTotal);
  return {
    title: 'Montant HT (hors TVA)',
    interpretation:
      montantRemises > 0
        ? `${total.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA sur ${nombreLignes} ligne(s), après ${montantRemises.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA de remises cumulées. Montant hors TVA (devis B2B).`
        : `${total.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA sur ${nombreLignes} ligne(s), sans remise. Montant hors TVA (devis B2B).`,
    severity: 'neutral',
  };
}
