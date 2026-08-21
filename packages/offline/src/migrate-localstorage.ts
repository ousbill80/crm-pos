import type { OfflineStore, OutboxOp } from './types';

export const LS_OUTBOX = 'caisse-crm.offline.outbox';
export const LS_HOLDS_PREFIX = 'caisse-crm.pos.holds.';
export const LS_CACHE_PREFIX = 'caisse-crm.pos.cache.';
export const LS_MIGRATED = 'caisse-crm.offline.idb-migrated';

type KvStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

function storage(): KvStorage | null {
  try {
    const ls = (globalThis as { localStorage?: KvStorage }).localStorage;
    if (!ls) return null;
    return ls;
  } catch {
    return null;
  }
}

export async function migrateLocalStorage(store: OfflineStore): Promise<boolean> {
  const ls = storage();
  if (!ls) return false;
  if (ls.getItem(LS_MIGRATED) === '1') return false;

  const rawOutbox = ls.getItem(LS_OUTBOX);
  if (rawOutbox) {
    try {
      const parsed = JSON.parse(rawOutbox) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existing = await store.listOutbox();
        const byId = new Map(existing.map((op) => [op.id, op]));
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const op = item as OutboxOp;
          if (typeof op.id !== 'string' || typeof op.path !== 'string') continue;
          byId.set(op.id, {
            id: op.id,
            path: op.path,
            method: op.method === 'PUT' || op.method === 'DELETE' ? op.method : 'POST',
            body: op.body && typeof op.body === 'object' ? op.body : {},
            createdAt:
              typeof op.createdAt === 'string'
                ? op.createdAt
                : new Date().toISOString(),
          });
        }
        await store.replaceOutbox(
          [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        );
      }
    } catch {
      // JSON corrompu — on n'écrase pas l'IDB
    }
    ls.removeItem(LS_OUTBOX);
  }

  for (let i = ls.length - 1; i >= 0; i -= 1) {
    const key = ls.key(i);
    if (!key) continue;
    if (key.startsWith(LS_HOLDS_PREFIX)) {
      const sessionId = key.slice(LS_HOLDS_PREFIX.length);
      try {
        const parsed = JSON.parse(ls.getItem(key) ?? '[]') as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          await store.setHolds(sessionId, parsed);
        }
      } catch {
        /* ignore */
      }
      ls.removeItem(key);
    } else if (key.startsWith(LS_CACHE_PREFIX)) {
      const sessionId = key.slice(LS_CACHE_PREFIX.length);
      try {
        const parsed = JSON.parse(ls.getItem(key) ?? 'null') as unknown;
        if (parsed) await store.setCache(sessionId, parsed);
      } catch {
        /* ignore */
      }
      ls.removeItem(key);
    }
  }

  ls.setItem(LS_MIGRATED, '1');
  return true;
}
