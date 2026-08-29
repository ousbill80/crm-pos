import { ETAPES_CIRCUIT_FONDS, indexEtapeCircuitFonds } from '../lib/pos-journee-fermee';

/** Circuit visuel magasin → trésorerie principale (§6.4). */
export function CircuitFondsStepper({
  statutSortie,
  compact = false,
}: {
  statutSortie: string | null;
  compact?: boolean;
}) {
  const courant = indexEtapeCircuitFonds(statutSortie);
  const litige = statutSortie === 'LITIGE';

  return (
    <ol
      className={`circuit-fonds${compact ? ' is-compact' : ''}`}
      aria-label="Circuit vers la trésorerie principale"
      data-testid="circuit-fonds"
    >
      {ETAPES_CIRCUIT_FONDS.map((etape, i) => {
        const etat =
          litige && i === 0
            ? 'litige'
            : courant > i
              ? 'fait'
              : courant === i
                ? 'courant'
                : 'todo';
        return (
          <li key={etape.id} className={`circuit-fonds-step is-${etat}`}>
            <span className="circuit-fonds-num" aria-hidden>
              {etat === 'fait' ? '✓' : i + 1}
            </span>
            <span className="circuit-fonds-label">{etape.label}</span>
            <span className="circuit-fonds-qui">{etape.qui}</span>
          </li>
        );
      })}
    </ol>
  );
}
