import { afterEach, describe, expect, it } from 'vitest';
import {
  createIdbStore,
  createMemoryStore,
  enqueueCloturerSessionOp,
  enqueueOuvrirSessionOp,
  enqueueSortieFondsOp,
  enqueueVenteOp,
  flushOutbox,
  localSessionPlaceholder,
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

  it('conserve une op enqueued pendant l’envoi', async () => {
    const store = createMemoryStore();
    await store.replaceOutbox([
      op({
        id: 'v1',
        method: 'POST',
        path: '/ventes/sessions/s/ventes',
        body: { clientOperationId: 'v1' },
      }),
    ]);

    const result = await flushOutbox(store, async () => {
      const actuel = await store.listOutbox();
      await store.replaceOutbox([
        ...actuel,
        op({
          id: 'v2',
          method: 'POST',
          path: '/ventes/sessions/s/ventes',
          body: { clientOperationId: 'v2' },
        }),
      ]);
    });

    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect((await store.listOutbox()).map((o) => o.id)).toEqual(['v2']);
  });

  it('sérialise les enqueues concurrents sans perdre une opération', async () => {
    const store = createMemoryStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        enqueueVenteOp(store, 'session-1', {
          clientOperationId: `vente-${index}`,
          lignes: [],
        }),
      ),
    );

    const queue = await store.listOutbox();
    expect(queue).toHaveLength(20);
    expect(new Set(queue.map((item) => item.body.clientOperationId)).size).toBe(20);
  });

  it('bloque une erreur métier permanente et ne la rejoue plus', async () => {
    const store = createMemoryStore();
    await store.replaceOutbox([
      op({
        id: 'vente-refusee',
        path: '/ventes/sessions/s/ventes',
      }),
    ]);
    let appels = 0;
    const send = async () => {
      appels += 1;
      throw new Error('Stock insuffisant');
    };

    const first = await flushOutbox(store, send, {
      shouldRetry: () => false,
    });
    expect(first).toEqual({ flushed: 0, remaining: 1 });
    expect((await store.listOutbox())[0]).toMatchObject({
      id: 'vente-refusee',
      lastError: 'Stock insuffisant',
    });
    expect((await store.listOutbox())[0]?.blockedAt).toBeTruthy();

    await flushOutbox(store, send, { shouldRetry: () => false });
    expect(appels).toBe(1);
  });

  it('enqueueSortieFondsOp pose un POST /transactions idempotent', async () => {
    const store = createMemoryStore();
    const queued = await enqueueSortieFondsOp(store, {
      caisseId: 'c1',
      montant: 1500,
      clientOperationId: 'op-sortie-01',
    });
    expect(queued.path).toBe('/transactions');
    expect(queued.method).toBe('POST');
    expect(queued.body).toEqual({
      caisseId: 'c1',
      type: 'SORTIE_FONDS',
      montant: 1500,
      clientOperationId: 'op-sortie-01',
    });
  });

  it('substitue {{localSessionId}} par l’id réel dans le reste du lot (ouverture+vente+clôture hors ligne)', async () => {
    const store = createMemoryStore();
    const { op: ouverture, placeholderSessionId } = await enqueueOuvrirSessionOp(store, {
      caisseId: 'c1',
      fondInitial: 10000,
      temoinLogin: 'chef-boutique',
      clientOperationId: 'local-op-1',
    });
    expect(placeholderSessionId).toBe(localSessionPlaceholder('local-op-1'));
    expect(ouverture.resolvesPlaceholder).toBe(placeholderSessionId);

    await enqueueVenteOp(store, placeholderSessionId, {
      clientOperationId: 'vente-1',
      lignes: [],
    });
    await enqueueCloturerSessionOp(store, placeholderSessionId, {
      fondCompteCloture: 10000,
      temoinLogin: 'chef-boutique',
    });

    const envoyees: Array<{ path: string; body: unknown }> = [];
    const result = await flushOutbox(store, async (item) => {
      envoyees.push({ path: item.path, body: item.body });
      if (item.path === '/ventes/sessions') return { id: 'sess-reelle-42' };
      return { id: 'peu-importe' };
    });

    expect(result).toEqual({ flushed: 3, remaining: 0 });
    expect(envoyees[0]?.path).toBe('/ventes/sessions');
    expect(envoyees[1]?.path).toBe('/ventes/sessions/sess-reelle-42/ventes');
    expect(envoyees[2]?.path).toBe('/ventes/sessions/sess-reelle-42/cloture');
    expect((await store.listOutbox())).toHaveLength(0);
  });

  it('conserve le placeholder tel quel si l’ouverture échoue (réseau toujours indisponible)', async () => {
    const store = createMemoryStore();
    const { placeholderSessionId } = await enqueueOuvrirSessionOp(store, {
      caisseId: 'c1',
      fondInitial: 5000,
      temoinLogin: 'chef-boutique',
      clientOperationId: 'local-op-2',
    });
    await enqueueVenteOp(store, placeholderSessionId, { clientOperationId: 'vente-2' });

    const result = await flushOutbox(store, async (item) => {
      if (item.path === '/ventes/sessions') throw new Error('offline');
      throw new Error('ne devrait pas être appelé avant résolution du placeholder');
    });

    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(2);
    const restant = await store.listOutbox();
    expect(restant[1]?.path).toBe(`/ventes/sessions/${placeholderSessionId}/ventes`);
  });
});
