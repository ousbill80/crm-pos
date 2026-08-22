import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightAlerte } from '../lib/insights/alertes';
import {
  hrefAlerte,
  TYPE_LABEL,
  type AlerteDto,
} from '../lib/alertes-ui';

// Alertes automatiques §6.7 — source unique : GET /alertes.
export type { AlerteDto };

function useAlertes() {
  return useQuery({
    queryKey: ['alertes'],
    queryFn: () => apiFetch<AlerteDto[]>('/alertes'),
  });
}

type FiltreSeverite = 'TOUS' | 'WARNING' | 'CRITICAL';
type FiltreType = 'TOUS' | AlerteDto['type'];

export function AlertesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, isError, error } = useAlertes();
  const [filtre, setFiltre] = useState<FiltreSeverite>('TOUS');
  const typeRaw = searchParams.get('type');
  const filtreType: FiltreType =
    typeRaw === 'ECART_CAISSE' ||
    typeRaw === 'VERSEMENT_EN_RETARD' ||
    typeRaw === 'ACCES_REFUSE' ||
    typeRaw === 'STOCK_BAS'
      ? typeRaw
      : 'TOUS';

  const alertes = useMemo(
    () =>
      (data ?? []).filter((a) => {
        if (filtre !== 'TOUS' && a.severite !== filtre) return false;
        if (filtreType !== 'TOUS' && a.type !== filtreType) return false;
        return true;
      }),
    [data, filtre, filtreType],
  );

  function setType(type: FiltreType) {
    const next = new URLSearchParams(searchParams);
    if (type === 'TOUS') next.delete('type');
    else next.set('type', type);
    setSearchParams(next, { replace: true });
  }

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
                <label htmlFor="filtre-type">Type</label>
                <select
                  id="filtre-type"
                  value={filtreType}
                  onChange={(e) => setType(e.target.value as FiltreType)}
                >
                  <option value="TOUS">Tous</option>
                  {(Object.keys(TYPE_LABEL) as AlerteDto['type'][]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
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
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => navigate(hrefAlerte(a))}
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
                      <span className="badge badge-ok">{TYPE_LABEL[a.type]}</span>
                      <InfoTooltip insight={insightAlerte(a.type, a.severite)} />
                      <time dateTime={a.dateHeure}>
                        {new Date(a.dateHeure).toLocaleString()}
                      </time>
                    </div>
                    <div>{a.message}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ListPanel>
      )}
    </div>
  );
}
