// File d'attente hors-ligne (§6.7) — opérations d'initiation de transaction
// idempotentes (clientOperationId). Sync à la reconnexion = append serveur.

const STORAGE_KEY = 'caisse-crm.offline.outbox';

export interface OutboxTransactionOp {
  id: string;
  path: '/transactions';
  method: 'POST';
  body: {
    caisseId: string;
    type: string;
    montant: number;
    clientOperationId: string;
  };
  createdAt: string;
}

function readQueue(): OutboxTransactionOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OutboxTransactionOp[];
  } catch {
    return [];
  }
}

function writeQueue(ops: OutboxTransactionOp[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
}

export function enqueueTransactionInit(body: {
  caisseId: string;
  type: string;
  montant: number;
}): OutboxTransactionOp {
  const op: OutboxTransactionOp = {
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

export function peekOutbox(): OutboxTransactionOp[] {
  return readQueue();
}

export function outboxCount(): number {
  return readQueue().length;
}

export async function flushOutbox(
  post: (path: string, body: unknown) => Promise<unknown>,
): Promise<{ flushed: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: OutboxTransactionOp[] = [];
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
