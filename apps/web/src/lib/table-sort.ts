export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Clic sur un en-tête : même colonne → inverse le sens, sinon tri croissant. */
export function toggleSort<K extends string>(
  current: SortState<K> | null,
  key: K,
): SortState<K> {
  if (current?.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: 'asc' };
}

/** Comparateur générique nombres/chaînes, valeurs nulles toujours en dernier. */
export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fr');
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K> | null,
  getValue: (row: T, key: K) => string | number | null | undefined,
): T[] {
  if (!sort) return rows;
  const factor = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) => factor * compareValues(getValue(a, sort.key), getValue(b, sort.key)),
  );
}
