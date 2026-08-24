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
  type OutboxOp,
} from '@caisse-crm/offline';
import { apiFetch, ApiError } from '../api';
import { purgerSecretOp, rehydraterSecretOp } from './op-secrets';

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

const CLOTURE_SUFFIX = /\/cloture$/;

function erreurSynchronisationRetentable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return (
    error.status === 0 ||
    error.status === 401 ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}

/**
 * Rehydrate les champs sensibles (mot de passe témoin) stashés hors du
 * corps stocké en file avant l'envoi (§6.7 — jamais journalisés en clair
 * dans l'outbox), puis les purge dès l'envoi réussi. Échec réseau : le
 * secret reste stashé pour le prochain essai.
 *
 * Cas particulier clôture : une réponse perdue (coupure juste après un 200
 * serveur) ferait rejouer indéfiniment un POST .../cloture qui échoue avec
 * « déjà fermée » (400, jamais retenté par la logique réseau générique de
 * `flushOutbox` puisque ce n'est pas une erreur réseau). On confirme alors
 * l'état réel via GET avant de considérer l'op résolue — jamais un avalage
 * aveugle de l'erreur.
 */
async function envoyerOp(op: OutboxOp): Promise<unknown> {
  const body = await rehydraterSecretOp(op.id, op.body);
  try {
    const reponse = await envoyer(op.path, body, op.method);
    await purgerSecretOp(op.id);
    return reponse;
  } catch (err) {
    if (
      op.method === 'POST' &&
      CLOTURE_SUFFIX.test(op.path) &&
      err instanceof ApiError &&
      err.status === 400 &&
      err.message.includes('déjà fermée')
    ) {
      try {
        const etat = await apiFetch<{ statut: string }>(
          op.path.replace(CLOTURE_SUFFIX, ''),
        );
        if (etat.statut !== 'OUVERTE') {
          await purgerSecretOp(op.id);
          return { confirmee: true };
        }
      } catch {
        /* confirmation impossible : on retombe sur l'échec d'origine */
      }
    }
    throw err;
  }
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
    const result = await flushOutbox(getOfflineStore(), envoyerOp, {
      shouldRetry: erreurSynchronisationRetentable,
      onPermanentFailure: async (_error, op) => {
        await purgerSecretOp(op.id);
      },
    });
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
