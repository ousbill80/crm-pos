let queue: Promise<void> = Promise.resolve();

/**
 * Sérialise uniquement les mutations locales de l'outbox. Les appels réseau
 * restent hors verrou : l'encaissement n'attend jamais la fin d'un flush.
 */
export async function withOutboxLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}
