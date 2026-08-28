/**
 * Machine à états Facture client B2B (hors CDC, documentée).
 *
 * BROUILLON → EMISE | ANNULEE
 * EMISE et ANNULEE sont terminales côté document.
 * L’encaissement n’est pas une transition de statut : il s’ajoute sur EMISE.
 * Un ticket POS / commande web n’est pas une facture — source GL distincte.
 */
export type StatutFactureClient = 'BROUILLON' | 'EMISE' | 'ANNULEE';

const TRANSITIONS: Record<StatutFactureClient, readonly StatutFactureClient[]> =
  {
    BROUILLON: ['EMISE', 'ANNULEE'],
    EMISE: [],
    ANNULEE: [],
  };

export function transitionsFactureClientAutorisees(
  from: StatutFactureClient,
): readonly StatutFactureClient[] {
  return TRANSITIONS[from] ?? [];
}

export function transitionFactureClientAutorisee(
  from: StatutFactureClient,
  to: StatutFactureClient,
): boolean {
  return transitionsFactureClientAutorisees(from).includes(to);
}
