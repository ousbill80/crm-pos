import type { OfflineStore, OutboxOp } from '@caisse-crm/offline';
import * as SQLite from 'expo-sqlite';

const KEY_OUTBOX = 'outbox';
const keyHolds = (sessionId: string) => `holds:${sessionId}`;
const keyCache = (sessionId: string) => `cache:${sessionId}`;

export function createSqliteStore(
  name = 'caisse-crm-offline.db',
): OfflineStore {
  const db = SQLite.openDatabaseSync(name);
  db.execSync(
    'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);',
  );

  function read(k: string): string | null {
    const row = db.getFirstSync<{ v: string }>('SELECT v FROM kv WHERE k = ?', [
      k,
    ]);
    return row?.v ?? null;
  }

  function write(k: string, v: string): void {
    db.runSync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [k, v]);
  }

  function del(k: string): void {
    db.runSync('DELETE FROM kv WHERE k = ?', [k]);
  }

  return {
    async listOutbox() {
      const raw = read(KEY_OUTBOX);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as OutboxOp[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async replaceOutbox(ops) {
      if (ops.length === 0) del(KEY_OUTBOX);
      else write(KEY_OUTBOX, JSON.stringify(ops));
    },
    async getHolds(sessionId) {
      const raw = read(keyHolds(sessionId));
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as unknown[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async setHolds(sessionId, holds) {
      if (holds.length === 0) del(keyHolds(sessionId));
      else write(keyHolds(sessionId), JSON.stringify(holds));
    },
    async getCache(sessionId) {
      const raw = read(keyCache(sessionId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    async setCache(sessionId, cache) {
      if (cache == null) del(keyCache(sessionId));
      else write(keyCache(sessionId), JSON.stringify(cache));
    },
  };
}
