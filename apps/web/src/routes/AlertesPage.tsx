import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightAlerte } from '../lib/insights/alertes';

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

type FiltreSeverite = 'TOUS' | 'WARNING' | 'CRITICAL';

export function AlertesPage() {
  const { data, isLoading, isError, error } = useAlertes();
  const [filtre, setFiltre] = useState<FiltreSeverite>('TOUS');

  const alertes = (data ?? []).filter(
    (a) => filtre === 'TOUS' || a.severite === filtre,
  );

  return (
    <div>
      <PageHeader
        title="Alertes"
        subtitle="Écarts de caisse, versements > 24 h, accès refusés — contrôle interne §6.7"
      />

      {isLoading && <LoadingState label="Chargement des alertes..." />}
      {isError && (
        <p role="alert">Erreur alertes : {(error as Error).message}</p>
      )}

      {!isLoading && !isError && (
        <ListPanel
          title="Alertes actives"
          toolbar={
            <div className="toolbar" style={{ margin: 0, padding: 0, border: 'none' }}>
              <div>
                <label htmlFor="filtre-sev">Sévérité</label>
                <select
                  id="filtre-sev"
                  value={filtre}
                  onChange={(e) => setFiltre(e.target.value as FiltreSeverite)}
                >
                  <option value="TOUS">Tous</option>
                  <option value="WARNING">WARNING</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>
          }
        >
          {alertes.length === 0 ? (
            <EmptyState
              title="Aucune alerte"
              description="Aucune alerte active sur votre périmètre pour ce filtre."
            />
          ) : (
            <ul className="alerte-list">
              {alertes.map((a) => (
                <li
                  key={`${a.type}-${a.entiteId}-${a.dateHeure}`}
                  className={
                    a.severite === 'CRITICAL'
                      ? 'alerte-item critical'
                      : 'alerte-item warning'
                  }
                >
                  <div className="alerte-item-meta">
                    <span
                      className={
                        a.severite === 'CRITICAL'
                          ? 'badge badge-critical'
                          : 'badge badge-warning'
                      }
                    >
                      {a.severite === 'CRITICAL' ? (
                        <AlertCircle size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}
                      {a.severite}
                    </span>
                    <span className="badge badge-ok">{a.type}</span>
                    <InfoTooltip insight={insightAlerte(a.type, a.severite)} />
                    <time dateTime={a.dateHeure}>
                      {new Date(a.dateHeure).toLocaleString()}
                    </time>
                  </div>
                  <div>{a.message}</div>
                </li>
              ))}
            </ul>
          )}
        </ListPanel>
      )}
    </div>
  );
}
