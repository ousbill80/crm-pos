import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

// Alertes automatiques §6.7 — source unique : GET /alertes.
export interface AlerteDto {
  type: 'ECART_CAISSE' | 'VERSEMENT_EN_RETARD' | 'ACCES_REFUSE';
  severite: 'WARNING' | 'CRITICAL';
  message: string;
  dateHeure: string;
  entite: string;
  entiteId: string;
}

function useAlertes() {
  return useQuery({
    queryKey: ['alertes'],
    queryFn: () => apiFetch<AlerteDto[]>('/alertes'),
  });
}

export function AlertesPage() {
  const { data, isLoading, isError, error } = useAlertes();

  if (isLoading) {
    return <p>Chargement des alertes...</p>;
  }

  if (isError) {
    return <p>Erreur alertes : {(error as Error).message}</p>;
  }

  const alertes = data ?? [];

  return (
    <div>
      <h1>Alertes</h1>
      <p>
        Écarts de caisse, versements en retard (&gt; 24 h), accès refusés —
        §6.7
      </p>

      {alertes.length === 0 ? (
        <p>Aucune alerte active sur votre périmètre.</p>
      ) : (
        <ul>
          {alertes.map((a) => (
            <li key={`${a.type}-${a.entiteId}-${a.dateHeure}`}>
              <strong>[{a.severite}]</strong> {a.type} — {a.message}
              <br />
              <small>{new Date(a.dateHeure).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
