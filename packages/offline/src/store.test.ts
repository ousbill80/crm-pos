import { afterEach, describe, expect, it } from 'vitest';
import {
  createIdbStore,
  createMemoryStore,
  flushOutbox,
  LS_HOLDS_PREFIX,
  LS_MIGRATED,
  LS_OUTBOX,
  migrateLocalStorage,
  resetOfflineForTests,
} from './index';
import type { OutboxOp } from './types';

function op(partial: Partial<OutboxOp> & Pick<OutboxOp, 'id' | 'path'>): OutboxOp {
  return {
    method: 'POST',
    body: { clientOperationId: partial.id },
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

afterEach(() => {
  resetOfflineForTests();
  localStorage.clear();
});

describe('migrateLocalStorage', () => {
  it('copie outbox et holds localStorage vers le store puis pose le drapeau', async () => {
    const store = createMemoryStore();
    localStorage.setItem(
      LS_OUTBOX,
      JSON.stringify([
        op({ id: 'op-1', path: '/ventes/sessions/s1/ventes' }),
      ]),
    );
    localStorage.setItem(
      `${LS_HOLDS_PREFIX}s1`,
      JSON.stringify([{ id: 'h1', numero: 1, panier: [] }]),
    );

    const moved = await migrateLocalStorage(store);
    expect(moved).toBe(true);
    expect(localStorage.getItem(LS_MIGRATED)).toBe('1');
    expect(localStorage.getItem(LS_OUTBOX)).toBeNull();
    expect(localStorage.getItem(`${LS_HOLDS_PREFIX}s1`)).toBeNull();

    const queue = await store.listOutbox();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe('op-1');
    const holds = await store.getHolds('s1');
    expect(holds).toHaveLength(1);
  });

  it('est idempotente une fois migrée', async () => {
    const store = createMemoryStore();
    localStorage.setItem(LS_MIGRATED, '1');
    localStorage.setItem(LS_OUTBOX, JSON.stringify([op({ id: 'x', path: '/x' })]));
    expect(await migrateLocalStorage(store)).toBe(false);
    expect(await store.listOutbox()).toEqual([]);
  });
});

describe('IndexedDB store (fake-indexeddb)', () => {
  it('persiste holds et les reprend', async () => {
    const store = createIdbStore();
    await store.setHolds('sess', [{ id: 'h1', numero: 2, panier: [{ produitId: 'p', quantite: 1 }] }]);
    const again = createIdbStore();
    const holds = await again.getHolds('sess');
    expect(holds).toEqual([
      { id: 'h1', numero: 2, panier: [{ produitId: 'p', quantite: 1 }] },
    ]);
  });
});

describe('flushOutbox — append-only', () => {
  it('retire l’op si l’append serveur réussit ; la conserve si le réseau échoue', async () => {
    const store = createMemoryStore();
    await store.replaceOutbox([
      op({
        id: 'v1',
        method: 'POST',
        path: '/ventes/sessions/s/ventes',
        body: { clientOperationId: 'v1', lignes: [] },
      }),
      op({
        id: 'r1',
        method: 'PUT',
        path: '/ventes/sessions/s/reservations',
        body: { holdId: 'h1' },
      }),
    ]);

    const sent: string[] = [];
    const result = await flushOutbox(store, async (item) => {
      if (item.method === 'PUT') throw new Error('network');
      sent.push(`${item.method} ${item.path}`);
    });

    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(sent).toEqual(['POST /ventes/sessions/s/ventes']);
    expect((await store.listOutbox())[0]?.method).toBe('PUT');
  });
});
