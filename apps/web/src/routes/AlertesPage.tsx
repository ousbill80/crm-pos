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
    return <p role="alert">Erreur alertes : {(error as Error).message}</p>;
  }

  const alertes = data ?? [];

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Alertes</h1>
          <p className="lead">
            Écarts de caisse, versements &gt; 24 h, accès refusés — contrôle
            interne §6.7
          </p>
        </div>
      </header>

      {alertes.length === 0 ? (
        <div className="panel">
          <p className="lead" style={{ margin: 0 }}>
            Aucune alerte active sur votre périmètre.
          </p>
        </div>
      ) : (
        <ul className="alerte-list">
          {alertes.map((a) => (
            <li
              key={`${a.type}-${a.entiteId}-${a.dateHeure}`}
              className={
                a.severite === 'CRITICAL' ? 'alerte-item critical' : 'alerte-item warning'
              }
            >
              <div className="alerte-item-meta">
                <span
                  className={
                    a.severite === 'CRITICAL' ? 'badge badge-critical' : 'badge badge-warning'
                  }
                >
                  {a.severite}
                </span>
                <span className="badge badge-ok">{a.type}</span>
                <time dateTime={a.dateHeure}>
                  {new Date(a.dateHeure).toLocaleString()}
                </time>
              </div>
              <div>{a.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
