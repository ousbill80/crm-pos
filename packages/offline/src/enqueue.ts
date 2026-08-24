import type { OfflineStore, OutboxMethod, OutboxOp } from './types';
import { withOutboxLock } from './outbox-lock';

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
    resolvesPlaceholder?: string;
  },
): Promise<OutboxOp> {
  const op: OutboxOp = {
    id: partial.id ?? newOpId(),
    path: partial.path,
    method: partial.method,
    body: partial.body,
    createdAt: new Date().toISOString(),
    ...(partial.resolvesPlaceholder ? { resolvesPlaceholder: partial.resolvesPlaceholder } : {}),
  };
  await withOutboxLock(async () => {
    const queue = await store.listOutbox();
    await store.replaceOutbox([...queue, op]);
  });
  return op;
}

/** Jeton stable substitué par l'id réel de session une fois l'ouverture synchronisée. */
export function localSessionPlaceholder(clientOperationId: string): string {
  return `{{localSessionId:${clientOperationId}}}`;
}

/**
 * Ouverture de session caisse hors ligne (§6.7). Ne contient jamais le mot
 * de passe témoin en clair — celui-ci est stashé séparément (côté mobile,
 * `expo-secure-store`) et rehydraté dans le corps de la requête au moment de
 * l'envoi seulement. Renvoie l'op ET le placeholder à utiliser comme
 * `sessionId` par les ops suivantes du même lot (vente, clôture) tant que
 * l'id réel n'est pas connu.
 */
export async function enqueueOuvrirSessionOp(
  store: OfflineStore,
  body: {
    caisseId: string;
    fondInitial: number;
    temoinLogin: string;
    clientOperationId?: string;
  },
): Promise<{ op: OutboxOp; placeholderSessionId: string }> {
  const clientOperationId = body.clientOperationId ?? newOpId();
  const placeholderSessionId = localSessionPlaceholder(clientOperationId);
  const op = await enqueueOp(store, {
    id: clientOperationId,
    path: '/ventes/sessions',
    method: 'POST',
    body: {
      caisseId: body.caisseId,
      fondInitial: body.fondInitial,
      temoinLogin: body.temoinLogin,
      clientOperationId,
    },
    resolvesPlaceholder: placeholderSessionId,
  });
  return { op, placeholderSessionId };
}

/**
 * Clôture de session caisse hors ligne (§6.7). `sessionId` peut être un id
 * réel ou le placeholder renvoyé par `enqueueOuvrirSessionOp` (session
 * ouverte et clôturée dans le même lot hors ligne) — la substitution est
 * appliquée par `flushOutbox` avant l'envoi. Mot de passe témoin jamais dans
 * le corps stocké, même règle que l'ouverture.
 */
export async function enqueueCloturerSessionOp(
  store: OfflineStore,
  sessionId: string,
  body: {
    fondCompteCloture: number;
    temoinLogin: string;
  },
): Promise<OutboxOp> {
  return enqueueOp(store, {
    path: `/ventes/sessions/${sessionId}/cloture`,
    method: 'POST',
    body: {
      fondCompteCloture: body.fondCompteCloture,
      temoinLogin: body.temoinLogin,
    },
  });
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

/** Retour/avoir POS idempotent, rejoué à la reconnexion. */
export async function enqueueRetourOp(
  store: OfflineStore,
  sessionId: string,
  body: {
    ligneVenteId: string;
    quantite: number;
    clientOperationId?: string;
  },
): Promise<OutboxOp> {
  const clientOperationId = body.clientOperationId ?? newOpId();
  return enqueueOp(store, {
    id: clientOperationId,
    path: `/ventes/sessions/${sessionId}/retours`,
    method: 'POST',
    body: {
      ligneVenteId: body.ligneVenteId,
      quantite: body.quantite,
      clientOperationId,
    },
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
