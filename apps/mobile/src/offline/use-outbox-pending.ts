import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  getOfflineStore,
  outboxPendingCount,
  type OutboxOp,
} from '@caisse-crm/offline';

export function useOutboxPending(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    void outboxPendingCount(getOfflineStore())
      .then(setCount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    const poll = setInterval(refresh, 4000);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [refresh]);

  return count;
}

export function useOutboxOperations(): {
  ops: OutboxOp[];
  refresh: () => Promise<void>;
} {
  const [ops, setOps] = useState<OutboxOp[]>([]);

  const refresh = useCallback(async () => {
    const rows = await getOfflineStore().listOutbox();
    setOps(rows);
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const poll = setInterval(() => void refresh(), 4000);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [refresh]);

  return { ops, refresh };
}
