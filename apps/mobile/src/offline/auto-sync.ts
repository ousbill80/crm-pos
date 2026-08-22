// Sync automatique hors-ligne mobile (§6.7) — SQLite + flush à la
// reconnexion (NetInfo), activation app, poll. Pas de WatermelonDB ;
// pas de CRM hors ligne.
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  flushOutbox,
  getOfflineStore,
  hydrateOffline,
  outboxPendingCount,
} from '@caisse-crm/offline';
import { apiFetch } from '../api';

const DELAI_MIN_MS = 3_000;
const DELAI_MAX_MS = 60_000;
const POLL_ACTIF_MS = 15_000;

let demarre = false;
let flushing = false;
let delai = DELAI_MIN_MS;
let relance: ReturnType<typeof setTimeout> | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;
let netUnsub: (() => void) | null = null;
let onFlushed: (() => void) | null = null;

function arreterRelance(): void {
  if (relance === null) return;
  clearTimeout(relance);
  relance = null;
}

function planifierRelance(ms: number): void {
  arreterRelance();
  relance = setTimeout(() => {
    relance = null;
    void tenterFlushMobile();
  }, ms);
}

async function envoyer(
  path: string,
  body: unknown,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
): Promise<unknown> {
  return apiFetch(path, {
    method,
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
  });
}

export async function tenterFlushMobile(): Promise<{
  flushed: number;
  remaining: number;
} | null> {
  if (flushing) return null;
  flushing = true;
  try {
    const etat = await NetInfo.fetch();
    if (etat.isConnected === false) {
      return null;
    }
    await hydrateOffline();
    const pending = await outboxPendingCount(getOfflineStore());
    if (pending === 0) {
      delai = DELAI_MIN_MS;
      arreterRelance();
      return { flushed: 0, remaining: 0 };
    }
    const result = await flushOutbox(getOfflineStore(), (op) =>
      envoyer(op.path, op.body, op.method),
    );
    if (result.flushed > 0) onFlushed?.();
    if (result.remaining === 0) {
      delai = DELAI_MIN_MS;
      return result;
    }
    if (result.flushed > 0) {
      delai = DELAI_MIN_MS;
      planifierRelance(DELAI_MIN_MS);
      return result;
    }
    planifierRelance(delai);
    delai = Math.min(delai * 2, DELAI_MAX_MS);
    return result;
  } catch {
    planifierRelance(delai);
    delai = Math.min(delai * 2, DELAI_MAX_MS);
    return null;
  } finally {
    flushing = false;
  }
}

function surAppState(next: AppStateStatus): void {
  if (next === 'active') {
    delai = DELAI_MIN_MS;
    void tenterFlushMobile();
  }
}

/** Démarre une fois au boot (App.tsx). Idempotent. */
export function demarrerAutoSyncMobile(apresEnvoi?: () => void): () => void {
  onFlushed = apresEnvoi ?? null;
  if (demarre) {
    void tenterFlushMobile();
    return () => undefined;
  }
  demarre = true;
  appSub = AppState.addEventListener('change', surAppState);
  netUnsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      delai = DELAI_MIN_MS;
      void tenterFlushMobile();
    }
  });
  poll = setInterval(() => {
    if (AppState.currentState === 'active') void tenterFlushMobile();
  }, POLL_ACTIF_MS);
  void tenterFlushMobile();
  return () => {
    demarre = false;
    onFlushed = null;
    appSub?.remove();
    appSub = null;
    netUnsub?.();
    netUnsub = null;
    if (poll) clearInterval(poll);
    poll = null;
    arreterRelance();
  };
}
