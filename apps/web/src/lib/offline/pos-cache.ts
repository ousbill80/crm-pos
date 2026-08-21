import { getOfflineStore, hydrateOffline } from '@caisse-crm/offline';
import type { ClientDto, ProduitDto } from '../types';

const prefix = 'caisse-crm.pos.cache.';
const cacheMem = new Map<string, PosCache>();

export interface PosCache {
  sessionId: string;
  produits: ProduitDto[];
  clients: ClientDto[];
  savedAt: string;
}

export async function hydratePosCache(sessionId: string): Promise<PosCache | null> {
  await hydrateOffline();
  const raw = await getOfflineStore().getCache(sessionId);
  if (raw && typeof raw === 'object') {
    const cache = raw as PosCache;
    cacheMem.set(sessionId, cache);
    return cache;
  }
  return loadPosCache(sessionId);
}

export function savePosCache(
  sessionId: string,
  produits: ProduitDto[],
  clients: ClientDto[],
): void {
  const payload: PosCache = {
    sessionId,
    produits,
    clients,
    savedAt: new Date().toISOString(),
  };
  cacheMem.set(sessionId, payload);
  void getOfflineStore().setCache(sessionId, payload);
}

export function loadPosCache(sessionId: string): PosCache | null {
  const mem = cacheMem.get(sessionId);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(`${prefix}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PosCache;
  } catch {
    return null;
  }
}
