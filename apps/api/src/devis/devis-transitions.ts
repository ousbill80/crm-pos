/**
 * Machine à états Devis B2B (hors CDC) — pure, testable sans dépendances Nest.
 *
 * BROUILLON → ENVOYE → ACCEPTE | REFUSE
 * BROUILLON | ENVOYE → ANNULE
 * ACCEPTE → TRANSFORME
 */
export type StatutDevis =
  'BROUILLON' | 'ENVOYE' | 'ACCEPTE' | 'REFUSE' | 'ANNULE' | 'TRANSFORME';

const TRANSITIONS: Record<StatutDevis, readonly StatutDevis[]> = {
  BROUILLON: ['ENVOYE', 'ANNULE'],
  ENVOYE: ['ACCEPTE', 'REFUSE', 'ANNULE'],
  ACCEPTE: ['TRANSFORME'],
  REFUSE: [],
  ANNULE: [],
  TRANSFORME: [],
};

export function transitionsDevisAutorisees(
  from: StatutDevis,
): readonly StatutDevis[] {
  return TRANSITIONS[from] ?? [];
}

export function transitionDevisAutorisee(
  from: StatutDevis,
  to: StatutDevis,
): boolean {
  return transitionsDevisAutorisees(from).includes(to);
}
