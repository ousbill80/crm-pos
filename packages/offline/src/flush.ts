import type { OfflineStore, OutboxOp } from './types';
import { withOutboxLock } from './outbox-lock';

export interface FlushOutboxOptions {
  /** Retourne false pour une erreur métier permanente qui exige une action humaine. */
  shouldRetry?: (error: unknown, op: OutboxOp) => boolean;
  onPermanentFailure?: (error: unknown, op: OutboxOp) => void | Promise<void>;
}

function messageErreur(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return 'Opération refusée définitivement par le serveur.';
}

function extraireIdReel(reponse: unknown): string | null {
  if (reponse && typeof reponse === 'object' && 'id' in reponse) {
    const id = (reponse as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function substituerChaine(valeur: string, placeholder: string, reel: string): string {
  return valeur.split(placeholder).join(reel);
}

function substituerProfond(valeur: unknown, placeholder: string, reel: string): unknown {
  if (typeof valeur === 'string') return substituerChaine(valeur, placeholder, reel);
  if (Array.isArray(valeur)) {
    return valeur.map((v) => substituerProfond(v, placeholder, reel));
  }
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(
      Object.entries(valeur as Record<string, unknown>).map(([k, v]) => [
        k,
        substituerProfond(v, placeholder, reel),
      ]),
    );
  }
  return valeur;
}

/**
 * Substitue `placeholder` (ex. `{{localSessionId:x}}`) par `reel` dans le
 * `path`/`body` de toutes les ops — appliqué au reste du lot dès qu'une op
 * `resolvesPlaceholder` réussit, pour qu'une session ouverte hors ligne soit
 * référencée par son id réel dans les ventes/clôture qui suivent (§6.7).
 */
function substituerDansLot(ops: OutboxOp[], placeholder: string, reel: string): OutboxOp[] {
  return ops.map((op) => ({
    ...op,
    path: substituerChaine(op.path, placeholder, reel),
    body: substituerProfond(op.body, placeholder, reel) as Record<string, unknown>,
  }));
}

// Échec réseau = l'op reste en file. Succès = append serveur déjà fait,
// on retire seulement de la file locale (pas d'update d'une vente créée).
// Les ops arrivées pendant l'envoi sont conservées (file automatique).
export async function flushOutbox(
  store: OfflineStore,
  send: (op: OutboxOp) => Promise<unknown>,
  options: FlushOutboxOptions = {},
): Promise<{ flushed: number; remaining: number }> {
  let queue = await store.listOutbox();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const vus = new Set(queue.map((op) => op.id));
  const remaining: OutboxOp[] = [];
  let flushed = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const op = queue[i]!;
    if (op.blockedAt) {
      remaining.push(op);
      continue;
    }
    try {
      const reponse = await send(op);
      flushed += 1;
      if (op.resolvesPlaceholder) {
        const reel = extraireIdReel(reponse);
        if (reel) {
          const placeholder = op.resolvesPlaceholder;
          queue = queue.map((autre, j) =>
            j <= i ? autre : substituerDansLot([autre], placeholder, reel)[0]!,
          );
        }
      }
    } catch (error) {
      const retry = options.shouldRetry?.(error, op) ?? true;
      if (!retry) await options.onPermanentFailure?.(error, op);
      remaining.push(
        retry
          ? op
          : {
              ...op,
              blockedAt: new Date().toISOString(),
              lastError: messageErreur(error),
            },
      );
    }
  }
  const next = await withOutboxLock(async () => {
    const latest = await store.listOutbox();
    const arrivees = latest.filter((op) => !vus.has(op.id));
    const updated = [...remaining, ...arrivees];
    await store.replaceOutbox(updated);
    return updated;
  });
  return { flushed, remaining: next.length };
}
