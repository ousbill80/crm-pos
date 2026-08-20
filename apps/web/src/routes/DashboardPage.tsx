import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Endpoint réel attendu côté API : GET /health (placeholder tant que
// le module Reporting §6.3.4 n'est pas implémenté). Aucune donnée mockée.
function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ status: string }>('/health'),
  });
}

export function DashboardPage() {
  const { data, isLoading, isError, error } = useApiHealth();
  const { user, logout } = useAuth();

  return (
    <div>
      <header>
        <span>{user?.login} — {user?.role}</span>
        <button type="button" onClick={logout}>
          Déconnexion
        </button>
      </header>
      {isLoading && <p>Connexion à l'API...</p>}
      {isError && <p>Erreur API : {(error as Error).message}</p>}
      {data && <p>API connectée : {data.status}</p>}
    </div>
  );
}
