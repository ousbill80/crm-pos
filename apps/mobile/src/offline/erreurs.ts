import { ApiError } from '../api';

/** Erreur réseau / serveur → file hors-ligne. 4xx métier → message, pas d’enqueue. */
export function estErreurHorsLigne(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 0;
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
