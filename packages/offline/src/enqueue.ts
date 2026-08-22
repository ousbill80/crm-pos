import type { OfflineStore, OutboxMethod, OutboxOp } from './types';

function newOpId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    if (typeof uuid === 'string') return uuid;
  } catch {
    /* fallback below */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Append une opération idempotente à la file (§6.7 — hors métier CRM). */
export async function enqueueOp(
  store: OfflineStore,
  partial: {
    id?: string;
    path: string;
    method: OutboxMethod;
    body: Record<string, unknown>;
  },
): Promise<OutboxOp> {
  const op: OutboxOp = {
    id: partial.id ?? newOpId(),
    path: partial.path,
    method: partial.method,
    body: partial.body,
    createdAt: new Date().toISOString(),
  };
  const queue = await store.listOutbox();
  await store.replaceOutbox([...queue, op]);
  return op;
}

export async function enqueueVenteOp(
  store: OfflineStore,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<OutboxOp> {
  return enqueueOp(store, {
    path: `/ventes/sessions/${sessionId}/ventes`,
    method: 'POST',
    body,
  });
}

/** Initiation SORTIE_FONDS magasin → centrale (POST idempotent, §6.7). */
export async function enqueueSortieFondsOp(
  store: OfflineStore,
  body: {
    caisseId: string;
    montant: number;
    clientOperationId?: string;
  },
): Promise<OutboxOp> {
  const clientOperationId = body.clientOperationId ?? newOpId();
  return enqueueOp(store, {
    path: '/transactions',
    method: 'POST',
    body: {
      caisseId: body.caisseId,
      type: 'SORTIE_FONDS',
      montant: body.montant,
      clientOperationId,
    },
  });
}

/** Upsert idempotent d'un ticket mis en attente (§6.7 hors-ligne POS). */
export async function enqueueReservationOp(
  store: OfflineStore,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<OutboxOp> {
  return enqueueOp(store, {
    path: `/ventes/sessions/${sessionId}/reservations`,
    method: 'PUT',
    body,
  });
}

/** Libération d'un ticket mis en attente (§6.7 hors-ligne POS). */
export async function enqueueLiberationOp(
  store: OfflineStore,
  sessionId: string,
  holdId: string,
): Promise<OutboxOp> {
  return enqueueOp(store, {
    path: `/ventes/sessions/${sessionId}/reservations/${holdId}`,
    method: 'DELETE',
    body: {},
  });
}

export async function outboxPendingCount(store: OfflineStore): Promise<number> {
  return (await store.listOutbox()).length;
}
