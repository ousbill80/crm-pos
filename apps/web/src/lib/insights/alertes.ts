import type { Insight, Severity } from './types';

// Recommandation par type d'alerte automatique (§6.7) — le message brut de
// l'alerte vient déjà de l'API, ce tooltip n'ajoute que l'interprétation et
// l'action à mener.
export function insightAlerte(type: string, severite: string): Insight {
  const sev: Severity = severite === 'CRITICAL' ? 'critical' : 'warning';
  switch (type) {
    case 'ECART_CAISSE':
      return {
        title: 'Écart de caisse',
        interpretation:
          "Un écart a été détecté entre le montant annoncé et le montant reçu lors du rapprochement d'une transaction (§6.4).",
        recommendation:
          'Consulter la transaction en litige associée et transmettre au Contrôle interne pour arbitrage.',
        severity: sev,
      };
    case 'VERSEMENT_EN_RETARD':
      return {
        title: 'Versement en retard',
        interpretation:
          "Un bordereau de versement de boutique n'a pas été transmis dans le délai de 24 h prévu par le contrôle interne (§6.7).",
        recommendation: 'Relancer le responsable de la boutique concernée pour accélérer le versement.',
        severity: sev,
      };
    case 'ACCES_REFUSE':
      return {
        title: 'Accès refusé',
        interpretation:
          "Une tentative d'accès à une action ou une donnée hors du périmètre habilité de l'utilisateur a été bloquée et journalisée (§6.7).",
        recommendation:
          "Vérifier s'il s'agit d'une erreur de manipulation ou d'une tentative d'accès à investiguer.",
        severity: sev,
      };
    case 'STOCK_BAS':
      return {
        title: 'Stock bas',
        interpretation:
          "Le stock vendable d'un article est à zéro ou sous le seuil de réapprovisionnement paramétré.",
        recommendation: 'Ouvrir la fiche produit, puis lancer un réappro ou un transfert interne.',
        severity: sev,
      };
    default:
      return {
        title: type,
        interpretation: 'Alerte automatique.',
        severity: sev,
      };
  }
}
