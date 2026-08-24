/** Erreur réseau / serveur → file hors-ligne. 4xx métier → message, pas d’enqueue. */
export function estErreurHorsLigne(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    typeof (err as { status?: unknown }).status === 'number'
  ) {
    const status = (err as { status: number }).status;
    return status >= 500 || status === 0;
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes('network') ||
      m.includes('failed to fetch') ||
      m.includes('network request failed')
    );
  }
  return false;
}
