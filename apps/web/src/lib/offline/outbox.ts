// File d'attente hors-ligne (§6.7) — opérations idempotentes
// (clientOperationId). Sync à la reconnexion = append serveur.
// Persistance IndexedDB (Dexie) via @caisse-crm/offline.

import {
  flushOutbox as flushStore,
  getOfflineStore,
  hydrateOffline,
  type OutboxMethod,
  type OutboxOp,
} from '@caisse-crm/offline';

export type { OutboxOp };
/** @deprecated alias — les initiations de transaction restent des OutboxOp. */
export type OutboxTransactionOp = OutboxOp;

let cached: OutboxOp[] = [];
let onMutate: (() => void) | null = null;

export function setOutboxMutateListener(fn: (() => void) | null): void {
  onMutate = fn;
}

function persist(next: OutboxOp[]): void {
  cached = next;
  void getOfflineStore()
    .replaceOutbox(cached)
    .then(() => onMutate?.());
}

export async function hydrateOutbox(): Promise<void> {
  await hydrateOffline();
  cached = await getOfflineStore().listOutbox();
  onMutate?.();
}

function append(partial: Omit<OutboxOp, 'id' | 'createdAt'> & { id?: string }): OutboxOp {
  const op: OutboxOp = {
    id: partial.id ?? crypto.randomUUID(),
    path: partial.path,
    method: partial.method,
    body: partial.body,
    createdAt: new Date().toISOString(),
  };
  persist([...cached, op]);
  return op;
}

export function enqueueTransactionInit(body: {
  caisseId: string;
  type: string;
  montant: number;
}): OutboxOp {
  return append({
    path: '/transactions',
    method: 'POST',
    body: {
      ...body,
      clientOperationId: crypto.randomUUID(),
    },
  });
}

export function enqueueVente(
  sessionId: string,
  body: {
    lignes: Array<{ produitId: string; quantite: number; remise?: number }>;
    modePaiement: string;
    paiements?: Array<{ modePaiement: string; montant: number }>;
    derogation?: {
      motifs: string[];
      login: string;
      password: string;
    };
    holdId?: string;
    clientId?: string;
    clientOperationId: string;
  },
): OutboxOp {
  return append({
    path: `/ventes/sessions/${sessionId}/ventes`,
    method: 'POST',
    body: { ...body },
  });
}

export function enqueueReservation(
  sessionId: string,
  body: Record<string, unknown>,
): OutboxOp {
  return append({
    path: `/ventes/sessions/${sessionId}/reservations`,
    method: 'PUT',
    body,
  });
}

export function enqueueLiberation(
  sessionId: string,
  holdId: string,
): OutboxOp {
  return append({
    path: `/ventes/sessions/${sessionId}/reservations/${holdId}`,
    method: 'DELETE',
    body: {},
  });
}

export function peekOutbox(): OutboxOp[] {
  return cached;
}

export function outboxCount(): number {
  return cached.length;
}

export function outboxVentesCount(sessionId: string): number {
  const suffix = `/ventes/sessions/${sessionId}/ventes`;
  return cached.filter((op) => op.path === suffix).length;
}

export function quantiteReserveeOutbox(
  sessionId: string,
  produitId: string,
): number {
  const suffix = `/ventes/sessions/${sessionId}/ventes`;
  return cached
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
  return cached.some((op) => op.body.clientOperationId === clientOperationId);
}

export async function flushOutbox(
  send: (
    path: string,
    body: unknown,
    method?: OutboxMethod,
  ) => Promise<unknown>,
): Promise<{ flushed: number; remaining: number }> {
  await getOfflineStore().replaceOutbox(cached);
  const result = await flushStore(getOfflineStore(), (op) =>
    send(op.path, op.body, op.method),
  );
  cached = await getOfflineStore().listOutbox();
  return result;
}
