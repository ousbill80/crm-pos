import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth-storage';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const EVENT = 'transaction.statut';

// Abonnement temps réel aux changements de statut (§5.2).
export function useTresorerieRealtime(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const token = getToken();
    if (!token) return;

    const socket: Socket = io(`${API_BASE_URL}/tresorerie`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on(EVENT, () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
      void queryClient.invalidateQueries({ queryKey: ['reporting'] });
      void queryClient.invalidateQueries({ queryKey: ['alertes'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, queryClient]);
}
