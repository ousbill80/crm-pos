import { createIdbStore } from './idb-store';
import { createMemoryStore } from './memory-store';
import { migrateLocalStorage } from './migrate-localstorage';
import type { OfflineStore } from './types';

let store: OfflineStore | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

export function setOfflineStore(next: OfflineStore): void {
  store = next;
  hydrated = false;
  hydratePromise = null;
}

export function getOfflineStore(): OfflineStore {
  if (store) return store;
  store =
    typeof (globalThis as { indexedDB?: unknown }).indexedDB === 'undefined'
      ? createMemoryStore()
      : createIdbStore();
  return store;
}

export async function hydrateOffline(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const s = getOfflineStore();
    await migrateLocalStorage(s);
    hydrated = true;
  })();
  await hydratePromise;
}

export function resetOfflineForTests(): void {
  store = createMemoryStore();
  hydrated = false;
  hydratePromise = null;
  try {
    (globalThis as { localStorage?: { clear(): void } }).localStorage?.clear();
  } catch {
    /* ignore */
  }
}
