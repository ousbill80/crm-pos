import { StatutTransaction } from '@caisse-crm/shared';
import type { TransactionDto } from '../types';
import type { Insight } from './types';

// Un texte par statut de la machine à états §6.4 — fidèle au circuit
// INITIÉE → EN_TRANSIT → RÉCEPTIONNÉE → VALIDÉE | LITIGE et aux rôles habilités.
export function insightStatutTransaction(statut: string): Insight {
  switch (statut) {
    case StatutTransaction.INITIEE:
      return {
        title: 'Initiée',
        interpretation:
          "Le bordereau a été créé par la caissière ou le responsable de boutique — première étape du circuit (§6.4).",
        recommendation:
          'Le responsable de boutique fait passer la transaction en transit dès le départ des fonds.',
        severity: 'neutral',
      };
    case StatutTransaction.EN_TRANSIT:
      return {
        title: 'En transit',
        interpretation: "Les fonds sont en cours d'acheminement vers la caisse centrale.",
        recommendation: 'Le Caissier Central doit réceptionner la transaction à son arrivée.',
        severity: 'warning',
      };
    case StatutTransaction.RECEPTIONNEE:
      return {
        title: 'Réceptionnée',
        interpretation:
          'Le Caissier Central a réceptionné les fonds ; le rapprochement (montant reçu vs montant annoncé) reste à effectuer.',
        recommendation:
          "Rapprocher le montant reçu pour valider la transaction, ou déclarer un litige en cas d'écart.",
        severity: 'info',
      };
    case StatutTransaction.VALIDEE:
      return {
        title: 'Validée',
        interpretation:
          'Rapprochement effectué sans écart par le Caissier Central — la transaction est soldée.',
        severity: 'ok',
      };
    case StatutTransaction.LITIGE:
      return {
        title: 'Litige',
        interpretation:
          "Un écart a été détecté au rapprochement : la transaction reste bloquée jusqu'à régularisation (§6.4).",
        recommendation:
          'Le Contrôle interne ou le DAF régularise via LITIGE → VALIDÉE (montant retenu + motif).',
        severity: 'critical',
      };
    default:
      return {
        title: statut,
        interpretation: 'Statut de transaction.',
        severity: 'neutral',
      };
  }
}

export function insightPerimetreTransactions(total: number): Insight {
  return {
    title: 'Périmètre',
    interpretation: `${total} transaction(s) sur le périmètre et les filtres courants (type, caisse, dates, magasin).`,
    severity: 'info',
  };
}

export function insightEnCoursCircuit(nombre: number, total: number): Insight {
  const part = total > 0 ? (nombre / total) * 100 : 0;
  return {
    title: 'En cours §6.4',
    interpretation:
      nombre > 0
        ? `${nombre} transaction(s) encore dans le circuit (initiée, en transit ou réceptionnée), soit ${part.toFixed(0)} % du périmètre — ni validées ni en litige.`
        : 'Aucune transaction en cours : tout est soit validé, soit en litige.',
    recommendation: nombre > 0 ? 'Cliquer pour isoler ces transactions et relancer les étapes bloquées.' : undefined,
    severity: nombre > 0 ? 'warning' : 'ok',
  };
}

export function insightLitigesTransactions(nombre: number): Insight {
  return {
    title: 'Litiges',
    interpretation:
      nombre > 0
        ? `${nombre} transaction(s) en litige — bloquées jusqu'à régularisation par le Contrôle interne ou le DAF (§6.4).`
        : 'Aucune transaction en litige sur ce périmètre.',
    recommendation: nombre > 0 ? 'Ouvrir la file des litiges pour arbitrer chaque écart.' : undefined,
    severity: nombre > 0 ? 'critical' : 'ok',
  };
}

export function insightMontantEnTransit(montant: number): Insight {
  return {
    title: 'En transit',
    interpretation:
      montant > 0
        ? `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA actuellement en acheminement vers la caisse centrale, pas encore réceptionnés.`
        : 'Aucun montant en transit actuellement.',
    severity: montant > 0 ? 'warning' : 'ok',
  };
}

// Deux familles de litiges distinctes sur cette page : écart de clôture
// tiroir → magasin (transfert interne, hors §6.4) et écart de rapprochement
// magasin → centrale (§6.4 strict). La régularisation et les rôles habilités
// diffèrent selon la famille.
export function insightLitigeCategorie(
  kind: 'interne' | 'centrale',
  nombre: number,
  montant: number,
): Insight {
  const montantFmt = montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  if (kind === 'interne') {
    return {
      title: 'Litiges internes',
      interpretation:
        nombre > 0
          ? `${nombre} écart(s) constaté(s) à la clôture d'un tiroir vers sa caisse magasin (transfert interne), pour ${montantFmt} FCFA au total.`
          : "Aucun écart de clôture tiroir → magasin en attente sur ce périmètre.",
      recommendation:
        nombre > 0
          ? 'Régularisation par le Responsable de boutique ou le DAF, depuis la fiche transaction.'
          : undefined,
      severity: nombre > 0 ? 'warning' : 'ok',
    };
  }
  return {
    title: 'Litiges centrale §6.4',
    interpretation:
      nombre > 0
        ? `${nombre} écart(s) détecté(s) au rapprochement d'un versement magasin → centrale, pour ${montantFmt} FCFA au total.`
        : 'Aucun écart de rapprochement magasin → centrale en attente sur ce périmètre.',
    recommendation:
      nombre > 0
        ? 'Régularisation par le Contrôle interne ou le DAF, depuis la fiche transaction.'
        : undefined,
    severity: nombre > 0 ? 'critical' : 'ok',
  };
}

// Explique l'écart d'un litige donné (montant + ancienneté + qui régularise).
// `interne` distingue le transfert tiroir → magasin (l'écart, c'est le
// montant du transfert lui-même) du litige §6.4 (l'écart vient du
// rapprochement bordereau déclaré / montant reçu).
export function insightEcartLitige(t: TransactionDto, interne: boolean): Insight {
  const ecart = interne
    ? Number(t.montant)
    : Number(t.bordereau?.reception?.ecart ?? t.montant);
  const dateReference = interne
    ? t.dateHeure
    : (t.bordereau?.reception?.dateReception ?? t.dateHeure);
  const jours = Math.floor((Date.now() - new Date(dateReference).getTime()) / 86_400_000);
  const anciennete = jours > 0 ? `ouvert depuis ${jours} jour(s)` : "ouvert aujourd'hui";
  const ecartFmt = Math.abs(ecart).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  return {
    title: interne ? 'Écart interne' : 'Écart §6.4',
    interpretation: interne
      ? `Écart de ${ecartFmt} FCFA constaté à la clôture du tiroir vers la caisse magasin, ${anciennete}.`
      : `Écart de ${ecartFmt} FCFA entre le montant déclaré au bordereau et le montant reçu au rapprochement, ${anciennete}.`,
    recommendation: interne
      ? "Le Responsable de boutique ou le DAF régularise (montant retenu + motif) depuis la fiche transaction."
      : "Le Contrôle interne ou le DAF régularise (montant retenu + motif) depuis la fiche transaction, après vérification du bordereau.",
    severity: interne ? 'warning' : 'critical',
  };
}

// Rappelle que le RBAC de régularisation est vérifié côté serveur sur
// chaque endpoint sensible, pas seulement affiché/masqué dans l'UI (§4, §6.2).
export function insightDroitLitige(peutInterne: boolean, peutCentrale: boolean): Insight {
  if (!peutInterne && !peutCentrale) {
    return {
      title: 'Lecture seule',
      interpretation:
        "Votre rôle ne permet pas de régulariser un litige sur ce périmètre — vérifié côté serveur sur chaque endpoint, pas seulement masqué dans l'interface (§4, §6.2).",
      severity: 'neutral',
    };
  }
  const perimetres = [
    peutInterne ? 'internes (tiroir → magasin)' : null,
    peutCentrale ? 'centrale (§6.4)' : null,
  ]
    .filter(Boolean)
    .join(' et ');
  return {
    title: 'Droit de régularisation',
    interpretation: `Votre rôle peut régulariser les litiges ${perimetres}. Vérifié côté serveur sur chaque endpoint sensible, pas seulement affiché/masqué côté UI (§4, §6.2).`,
    severity: 'info',
  };
}
