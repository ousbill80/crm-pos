import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Scale, Wallet } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightLitiges,
  insightTresorerie,
  insightVersementsEnRetard,
} from '../lib/insights/dashboard';
import type { ReportingDashboard } from './DashboardPage';

interface AlerteDto {
  type: string;
  message: string;
  severite?: string;
}

export function TresoreriePage() {
  const dashboard = useQuery({
    queryKey: ['reporting', 'dashboard', 'tresorerie'],
    queryFn: () => apiFetch<ReportingDashboard>('/reporting/dashboard'),
  });

  const alertes = useQuery({
    queryKey: ['alertes', 'tresorerie'],
    queryFn: () => apiFetch<AlerteDto[]>('/alertes'),
  });

  const data = dashboard.data;
  const alertesTreso = (alertes.data ?? []).filter(
    (a) =>
      a.type === 'ECART_CAISSE' ||
      a.type === 'VERSEMENT_EN_RETARD' ||
      a.type === 'ACCES_REFUSE',
  );

  return (
    <div>
      <PageHeader
        title="Trésorerie"
        subtitle="Soldes, pipeline de versements et litiges — grand livre append-only (§6.4)"
        actions={
          <div className="page-header-actions">
            <Link className="btn-secondary" to="/transactions">
              Transactions
            </Link>
            <Link className="btn-secondary" to="/litiges">
              Litiges
            </Link>
            <Link className="btn-primary" to="/caisses">
              Caisses
            </Link>
          </div>
        }
      />

      {dashboard.isLoading && <LoadingState label="Chargement de la trésorerie..." />}
      {dashboard.isError && (
        <p role="alert">Impossible de charger le tableau de trésorerie.</p>
      )}

      {data && (
        <>
          <div className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Wallet size={16} />
                </span>
                <InfoTooltip
                  insight={insightTresorerie(
                    data.tresorerie.totalSoldesAuxiliaires,
                    data.tresorerie.caisses.length,
                  )}
                />
              </div>
              <div className="kpi-label">Soldes auxiliaires</div>
              <div className="kpi-value money">
                {data.tresorerie.totalSoldesAuxiliaires} FCFA
              </div>
              <div className="kpi-hint">
                {
                  data.tresorerie.caisses.filter((c) => c.type === 'AUXILIAIRE')
                    .length
                }{' '}
                caisses boutique
              </div>
            </article>

            <article
              className={
                data.ecarts.nombreLitiges > 0
                  ? 'kpi-card dash-kpi kpi-danger'
                  : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Scale size={16} />
                </span>
                <InfoTooltip
                  insight={insightLitiges(
                    data.ecarts.nombreLitiges,
                    data.ecarts.montantEcartsAbsolus,
                  )}
                />
              </div>
              <div className="kpi-label">Litiges</div>
              <div className="kpi-value">{data.ecarts.nombreLitiges}</div>
              <div className="kpi-hint money">
                Écarts abs. {data.ecarts.montantEcartsAbsolus} FCFA
              </div>
            </article>

            <article
              className={
                data.versements.enRetard24h > 0
                  ? 'kpi-card dash-kpi kpi-warning'
                  : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <AlertTriangle size={16} />
                </span>
                <InfoTooltip
                  insight={insightVersementsEnRetard(data.versements.enRetard24h)}
                />
              </div>
              <div className="kpi-label">Retards &gt; 24h</div>
              <div className="kpi-value">{data.versements.enRetard24h}</div>
              <div className="kpi-hint">Versements non aboutis</div>
            </article>
          </div>

          <div className="panel-grid-2">
            <ListPanel title="Pipeline des versements">
              <table>
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Nombre</th>
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {data.versements.parStatut.map((row) => (
                    <tr key={row.statut}>
                      <td>
                        <span className="badge badge-neutral">{row.statut}</span>
                      </td>
                      <td>{row.nombre}</td>
                      <td className="money">{row.montant} FCFA</td>
                    </tr>
                  ))}
                  {data.versements.parStatut.length === 0 && (
                    <tr>
                      <td colSpan={3}>Aucun versement sur la période.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="lead">
                <Link to="/transactions">
                  Voir toutes les transactions <ArrowRight size={14} />
                </Link>
              </p>
            </ListPanel>

            <ListPanel title="Soldes par caisse">
              <table>
                <thead>
                  <tr>
                    <th>Caisse</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tresorerie.caisses.map((c) => (
                    <tr key={c.caisseId}>
                      <td>
                        <span
                          className={
                            c.type === 'CENTRALE'
                              ? 'badge badge-info'
                              : 'badge badge-neutral'
                          }
                        >
                          {c.type}
                        </span>{' '}
                        <code>{c.caisseId.slice(0, 8)}…</code>
                      </td>
                      <td className="money">{c.solde} FCFA</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="lead">
                <Link to="/caisses">
                  Grand livre des caisses <ArrowRight size={14} />
                </Link>
              </p>
            </ListPanel>
          </div>

          <ListPanel title="Alertes trésorerie">
            {alertes.isLoading && <LoadingState label="Chargement des alertes..." />}
            {!alertes.isLoading && alertesTreso.length === 0 && (
              <p className="lead">Aucune alerte trésorerie active.</p>
            )}
            {alertesTreso.length > 0 && (
              <ul>
                {alertesTreso.map((a, i) => (
                  <li key={`${a.type}-${i}`}>
                    <span className="badge badge-warning">{a.type}</span> {a.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="lead">
              <Link to="/alertes">
                Toutes les alertes <ArrowRight size={14} />
              </Link>
            </p>
          </ListPanel>
        </>
      )}
    </div>
  );
}
