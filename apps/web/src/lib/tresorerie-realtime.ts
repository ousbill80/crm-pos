import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth-storage';

const rawApiBase = import.meta.env.VITE_API_URL;
const API_BASE_URL =
  rawApiBase === undefined || rawApiBase === null
    ? 'http://localhost:3000'
    : String(rawApiBase).replace(/\/$/, '');
export const TRANSACTION_STATUT_EVENT = 'transaction.statut';

export type TresorerieRealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export interface TransactionStatutPayload {
  id: string;
  statut: string;
  type: string;
  montant: string;
  caisseId: string;
  boutiqueId: string | null;
  zoneId: string | null;
}

type StatusListener = (status: TresorerieRealtimeStatus) => void;

let socket: Socket | null = null;
let refCount = 0;
let status: TresorerieRealtimeStatus = 'idle';
const statusListeners = new Set<StatusListener>();
const statutListeners = new Set<(payload: TransactionStatutPayload) => void>();

function setStatus(next: TresorerieRealtimeStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener(status);
}

function subscribeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => {
    statusListeners.delete(listener);
  };
}

function getStatusSnapshot(): TresorerieRealtimeStatus {
  return status;
}

function invalidateAfterStatut(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: TransactionStatutPayload,
): void {
  void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  void queryClient.invalidateQueries({
    queryKey: ['transactions', payload.id],
  });
  void queryClient.invalidateQueries({ queryKey: ['caisses'] });
  void queryClient.invalidateQueries({ queryKey: ['reporting'] });
  void queryClient.invalidateQueries({ queryKey: ['alertes'] });
  void queryClient.invalidateQueries({ queryKey: ['litiges'] });
}

function attachSocketHandlers(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  if (!socket) return;

  socket.off(TRANSACTION_STATUT_EVENT);
  socket.on(TRANSACTION_STATUT_EVENT, (payload: TransactionStatutPayload) => {
    invalidateAfterStatut(queryClient, payload);
    for (const listener of statutListeners) listener(payload);
  });

  socket.off('connect');
  socket.on('connect', () => setStatus('connected'));

  socket.off('disconnect');
  socket.on('disconnect', () => setStatus('disconnected'));

  socket.off('connect_error');
  socket.on('connect_error', () => setStatus('disconnected'));
}

function connect(queryClient: ReturnType<typeof useQueryClient>): void {
  const token = getToken();
  if (!token) return;

  if (socket) {
    attachSocketHandlers(queryClient);
    if (socket.connected) setStatus('connected');
    else setStatus('connecting');
    return;
  }

  setStatus('connecting');
  socket = io(`${API_BASE_URL ? `${API_BASE_URL}/tresorerie` : '/tresorerie'}`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  attachSocketHandlers(queryClient);
}

function disconnect(): void {
  socket?.disconnect();
  socket = null;
  setStatus('idle');
}

// Connexion unique partagée (ProtectedRoute) — évite plusieurs sockets §5.2.
export function useTresorerieRealtime(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    refCount += 1;
    connect(queryClient);

    return () => {
      refCount -= 1;
      if (refCount <= 0) disconnect();
    };
  }, [enabled, queryClient]);
}

export function useTresorerieRealtimeStatus(): TresorerieRealtimeStatus {
  return useSyncExternalStore(
    subscribeStatus,
    getStatusSnapshot,
    getStatusSnapshot,
  );
}

export function useTresorerieStatutListener(
  listener: ((payload: TransactionStatutPayload) => void) | null,
): void {
  useEffect(() => {
    if (!listener) return;
    statutListeners.add(listener);
    return () => {
      statutListeners.delete(listener);
    };
  }, [listener]);
}
