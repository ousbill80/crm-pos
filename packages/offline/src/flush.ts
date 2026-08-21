import type { OfflineStore, OutboxOp } from './types';

// Échec réseau = l'op reste en file. Succès = append serveur déjà fait,
// on retire seulement de la file locale (pas d'update d'une vente créée).
// Les ops arrivées pendant l'envoi sont conservées (file automatique).
export async function flushOutbox(
  store: OfflineStore,
  send: (op: OutboxOp) => Promise<unknown>,
): Promise<{ flushed: number; remaining: number }> {
  const queue = await store.listOutbox();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const vus = new Set(queue.map((op) => op.id));
  const remaining: OutboxOp[] = [];
  let flushed = 0;
  for (const op of queue) {
    try {
      await send(op);
      flushed += 1;
    } catch {
      remaining.push(op);
    }
  }
  const latest = await store.listOutbox();
  const arrivees = latest.filter((op) => !vus.has(op.id));
  const next = [...remaining, ...arrivees];
  await store.replaceOutbox(next);
  return { flushed, remaining: next.length };
}
