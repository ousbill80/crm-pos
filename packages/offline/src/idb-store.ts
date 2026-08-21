import Dexie, { type Table } from 'dexie';
import type { OfflineStore, OutboxOp } from './types';

interface HoldRow {
  sessionId: string;
  holds: unknown[];
}

interface CacheRow {
  sessionId: string;
  cache: unknown;
}

class CaisseOfflineDb extends Dexie {
  outbox!: Table<OutboxOp, string>;
  holds!: Table<HoldRow, string>;
  cache!: Table<CacheRow, string>;

  constructor() {
    super('caisse-crm-offline');
    this.version(1).stores({
      outbox: 'id',
      holds: 'sessionId',
      cache: 'sessionId',
    });
  }
}

export function createIdbStore(): OfflineStore {
  const db = new CaisseOfflineDb();
  return {
    async listOutbox() {
      const rows = await db.outbox.toArray();
      return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async replaceOutbox(ops) {
      await db.transaction('rw', db.outbox, async () => {
        await db.outbox.clear();
        if (ops.length > 0) await db.outbox.bulkAdd(ops);
      });
    },
    async getHolds(sessionId) {
      const row = await db.holds.get(sessionId);
      return row?.holds ?? [];
    },
    async setHolds(sessionId, holds) {
      if (holds.length === 0) {
        await db.holds.delete(sessionId);
        return;
      }
      await db.holds.put({ sessionId, holds });
    },
    async getCache(sessionId) {
      const row = await db.cache.get(sessionId);
      return row?.cache ?? null;
    },
    async setCache(sessionId, cache) {
      if (cache == null) {
        await db.cache.delete(sessionId);
        return;
      }
      await db.cache.put({ sessionId, cache });
    },
  };
}
