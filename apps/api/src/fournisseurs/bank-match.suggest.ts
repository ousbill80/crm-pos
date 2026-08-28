/** Suggestion de lettrage : même devise, même montant (valeur absolue), date la plus proche. */

export function absMoney(value: unknown): string {
  const raw =
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'object' &&
          value !== null &&
          'toNumber' in value &&
          typeof (value as { toNumber: () => number }).toNumber === 'function'
        ? (value as { toNumber: () => number }).toNumber()
        : Number.NaN;
  if (!Number.isFinite(raw)) return '0.00';
  return Math.abs(raw).toFixed(2);
}

export function bankMatchKey(montant: unknown, devise: string): string {
  return `${devise.trim().toUpperCase()}|${absMoney(montant)}`;
}

export function suggestBankMatches<
  L extends {
    id: string;
    montant: unknown;
    devise: string;
    dateOperation: Date | string;
  },
  M extends {
    id: string;
    montant: unknown;
    devise: string;
    dateValeur: Date | string;
  },
>(lignes: L[], mouvements: M[]): Record<string, string> {
  const used = new Set<string>();
  const suggestions: Record<string, string> = {};
  const sorted = [...lignes].sort((a, b) =>
    String(a.dateOperation).localeCompare(String(b.dateOperation)),
  );
  for (const line of sorted) {
    const key = bankMatchKey(line.montant, line.devise);
    const lineMs = new Date(line.dateOperation).getTime();
    const candidates = mouvements.filter(
      (row) =>
        !used.has(row.id) && bankMatchKey(row.montant, row.devise) === key,
    );
    if (candidates.length === 0) continue;
    candidates.sort(
      (a, b) =>
        Math.abs(new Date(a.dateValeur).getTime() - lineMs) -
        Math.abs(new Date(b.dateValeur).getTime() - lineMs),
    );
    const pick = candidates[0];
    used.add(pick.id);
    suggestions[line.id] = pick.id;
  }
  return suggestions;
}
