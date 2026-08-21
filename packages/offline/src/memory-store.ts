import type { OfflineStore, OutboxOp } from './types';

export function createMemoryStore(): OfflineStore {
  let outbox: OutboxOp[] = [];
  const holds = new Map<string, unknown[]>();
  const cache = new Map<string, unknown>();

  return {
    async listOutbox() {
      return [...outbox];
    },
    async replaceOutbox(ops) {
      outbox = [...ops];
    },
    async getHolds(sessionId) {
      return [...(holds.get(sessionId) ?? [])];
    },
    async setHolds(sessionId, next) {
      if (next.length === 0) holds.delete(sessionId);
      else holds.set(sessionId, [...next]);
    },
    async getCache(sessionId) {
      return cache.get(sessionId) ?? null;
    },
    async setCache(sessionId, value) {
      if (value == null) cache.delete(sessionId);
      else cache.set(sessionId, value);
    },
  };
}
