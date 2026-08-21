import type { ClientDto, ProduitDto } from '../types';

const prefix = 'caisse-crm.pos.cache.';

export interface PosCache {
  sessionId: string;
  produits: ProduitDto[];
  clients: ClientDto[];
  savedAt: string;
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
  try {
    localStorage.setItem(`${prefix}${sessionId}`, JSON.stringify(payload));
  } catch {
    // quota — le POS continue en ligne
  }
}

export function loadPosCache(sessionId: string): PosCache | null {
  try {
    const raw = localStorage.getItem(`${prefix}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PosCache;
  } catch {
    return null;
  }
}
