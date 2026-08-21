// File d'attente hors-ligne (§6.7) — opérations idempotentes
// (clientOperationId). Sync à la reconnexion = append serveur.

const STORAGE_KEY = 'caisse-crm.offline.outbox';

export interface OutboxOp {
  id: string;
  path: string;
  method: 'POST';
  body: Record<string, unknown>;
  createdAt: string;
}

/** @deprecated alias — les initiations de transaction restent des OutboxOp. */
export type OutboxTransactionOp = OutboxOp;

function readQueue(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OutboxOp[];
  } catch {
    return [];
  }
}

function writeQueue(ops: OutboxOp[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
}

export function enqueueTransactionInit(body: {
  caisseId: string;
  type: string;
  montant: number;
}): OutboxOp {
  const op: OutboxOp = {
    id: crypto.randomUUID(),
    path: '/transactions',
    method: 'POST',
    body: {
      ...body,
      clientOperationId: crypto.randomUUID(),
    },
    createdAt: new Date().toISOString(),
  };
  const queue = readQueue();
  queue.push(op);
  writeQueue(queue);
  return op;
}

export function enqueueVente(
  sessionId: string,
  body: {
    lignes: Array<{ produitId: string; quantite: number; remise?: number }>;
    modePaiement: string;
    clientId?: string;
    clientOperationId: string;
  },
): OutboxOp {
  const op: OutboxOp = {
    id: crypto.randomUUID(),
    path: `/ventes/sessions/${sessionId}/ventes`,
    method: 'POST',
    body: { ...body },
    createdAt: new Date().toISOString(),
  };
  const queue = readQueue();
  queue.push(op);
  writeQueue(queue);
  return op;
}

export function peekOutbox(): OutboxOp[] {
  return readQueue();
}

export function outboxCount(): number {
  return readQueue().length;
}

export function outboxVentesCount(sessionId: string): number {
  const suffix = `/ventes/sessions/${sessionId}/ventes`;
  return readQueue().filter((op) => op.path === suffix).length;
}

export function quantiteReserveeOutbox(
  sessionId: string,
  produitId: string,
): number {
  const suffix = `/ventes/sessions/${sessionId}/ventes`;
  return readQueue()
    .filter((op) => op.path === suffix)
    .reduce((total, op) => {
      const lignes = op.body.lignes as
        | Array<{ produitId: string; quantite: number }>
        | undefined;
      if (!lignes) return total;
      return (
        total +
        lignes
          .filter((l) => l.produitId === produitId)
          .reduce((s, l) => s + l.quantite, 0)
      );
    }, 0);
}

export function venteEnAttenteSync(clientOperationId: string): boolean {
  return readQueue().some(
    (op) => op.body.clientOperationId === clientOperationId,
  );
}

export async function flushOutbox(
  post: (path: string, body: unknown) => Promise<unknown>,
): Promise<{ flushed: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: OutboxOp[] = [];
  let flushed = 0;
  for (const op of queue) {
    try {
      await post(op.path, op.body);
      flushed += 1;
    } catch {
      remaining.push(op);
    }
  }
  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}
