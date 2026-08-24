export type OutboxMethod = 'POST' | 'PUT' | 'DELETE';

export interface OutboxOp {
  id: string;
  path: string;
  method: OutboxMethod;
  body: Record<string, unknown>;
  createdAt: string;
  /**
   * Jeton placeholder (ex. `{{localSessionId:<id>}}`) que cette op, une fois
   * envoyée avec succès, résout vers l'id réel renvoyé par le serveur
   * (`reponse.id`) — substitué dans `path`/`body` de toutes les ops
   * suivantes du même lot avant leur propre envoi (§6.7, session caisse
   * ouverte hors ligne puis vendue/clôturée dans le même lot).
   */
  resolvesPlaceholder?: string;
  /**
   * Une erreur métier permanente (4xx) ne doit jamais être rejouée en boucle.
   * L'op reste visible pour traitement humain, mais le flush l'ignore.
   */
  blockedAt?: string;
  lastError?: string;
}

export interface OfflineStore {
  listOutbox(): Promise<OutboxOp[]>;
  replaceOutbox(ops: OutboxOp[]): Promise<void>;
  getHolds(sessionId: string): Promise<unknown[]>;
  setHolds(sessionId: string, holds: unknown[]): Promise<void>;
  getCache(sessionId: string): Promise<unknown | null>;
  setCache(sessionId: string, cache: unknown | null): Promise<void>;
}
