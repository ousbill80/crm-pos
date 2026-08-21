export type OutboxMethod = 'POST' | 'PUT' | 'DELETE';

export interface OutboxOp {
  id: string;
  path: string;
  method: OutboxMethod;
  body: Record<string, unknown>;
  createdAt: string;
}

export interface OfflineStore {
  listOutbox(): Promise<OutboxOp[]>;
  replaceOutbox(ops: OutboxOp[]): Promise<void>;
  getHolds(sessionId: string): Promise<unknown[]>;
  setHolds(sessionId: string, holds: unknown[]): Promise<void>;
  getCache(sessionId: string): Promise<unknown | null>;
  setCache(sessionId: string, cache: unknown | null): Promise<void>;
}
