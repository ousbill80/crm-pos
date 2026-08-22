import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getOfflineStore, outboxPendingCount } from '@caisse-crm/offline';

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
