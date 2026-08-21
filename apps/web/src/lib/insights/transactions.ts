import { StatutTransaction } from '@caisse-crm/shared';
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
