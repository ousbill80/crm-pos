import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import {
  flushOutbox,
  hydrateOutbox,
  outboxCount,
  setOutboxMutateListener,
} from './outbox';

// File hors-ligne §6.7 : envoi automatique (reconnexion, nouvel enqueue,
// onglet revisible). Pas de bouton « synchroniser ».

const DELAI_MIN_MS = 2_000;
const DELAI_MAX_MS = 60_000;

type SendFn = (
  path: string,
  body: unknown,
  method?: 'POST' | 'PUT' | 'DELETE',
) => Promise<unknown>;

let send: SendFn | null = null;
let onFlushed: (() => void) | null = null;
let flushing = false;
let relance: ReturnType<typeof setTimeout> | null = null;
let delai = DELAI_MIN_MS;
const abonnes = new Set<() => void>();

function notifier(): void {
  for (const fn of abonnes) fn();
}

function arreterRelance(): void {
  if (relance === null) return;
  clearTimeout(relance);
  relance = null;
}

function planifierRelance(ms: number): void {
  arreterRelance();
  relance = setTimeout(() => {
    relance = null;
    void tenterFlush();
  }, ms);
}

export async function tenterFlush(): Promise<void> {
  if (!send || flushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (outboxCount() === 0) {
    delai = DELAI_MIN_MS;
    arreterRelance();
    notifier();
    return;
  }

  flushing = true;
  try {
    const result = await flushOutbox(send);
    notifier();
    if (result.flushed > 0) onFlushed?.();
    if (result.remaining === 0) {
      delai = DELAI_MIN_MS;
      return;
    }
    if (result.flushed > 0) {
      delai = DELAI_MIN_MS;
      planifierRelance(DELAI_MIN_MS);
      return;
    }
    planifierRelance(delai);
    delai = Math.min(delai * 2, DELAI_MAX_MS);
  } finally {
    flushing = false;
  }
}

function surReconnexion(): void {
  delai = DELAI_MIN_MS;
  void tenterFlush();
}

function surVisibilite(): void {
  if (document.visibilityState === 'visible') void tenterFlush();
}

export function sAbonnerSync(fn: () => void): () => void {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}

export function demarrerAutoSync(
  envoyer: SendFn,
  apresEnvoi: () => void,
): () => void {
  send = envoyer;
  onFlushed = apresEnvoi;
  setOutboxMutateListener(() => {
    notifier();
    void tenterFlush();
  });
  window.addEventListener('online', surReconnexion);
  document.addEventListener('visibilitychange', surVisibilite);
  void tenterFlush();
  return () => {
    send = null;
    onFlushed = null;
    setOutboxMutateListener(null);
    window.removeEventListener('online', surReconnexion);
    document.removeEventListener('visibilitychange', surVisibilite);
    arreterRelance();
  };
}

export function useOfflineAutoSync(actif: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!actif) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void hydrateOutbox().then(() => {
      if (cancelled) return;
      stop = demarrerAutoSync(
        (path, body, method = 'POST') =>
          apiFetch(path, {
            method,
            ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
          }),
        () => {
          void queryClient.invalidateQueries({ queryKey: ['ventes-session'] });
          void queryClient.invalidateQueries({ queryKey: ['produits'] });
          void queryClient.invalidateQueries({ queryKey: ['stocks'] });
          void queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
      );
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [actif, queryClient]);
}
