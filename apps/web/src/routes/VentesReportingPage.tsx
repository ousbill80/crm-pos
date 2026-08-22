import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Download, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RoleLibelle, rolesPourApp } from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import { insightCa30Jours, insightJoursAvecCa } from '../lib/insights/ventes';

const ROLES_VENTES = rolesPourApp('ventes');

interface VenteQuotidienne {
  date: string;
  total: string;
}

function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return `${value} FCFA`;
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`;
  }
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

export function VentesReportingPage() {
  const { user } = useAuth();
  const filtre = useFiltreMagasinSiege();
  const peutLire = user !== null && ROLES_VENTES.includes(user.role);

  const serieQ = useQuery({
    queryKey: ['reporting', 'ventes-quotidiennes'],
    queryFn: () =>
      apiFetch<VenteQuotidienne[]>('/reporting/ventes-quotidiennes?jours=30'),
    enabled: peutLire,
  });

  const chart = useMemo(
    () =>
      (serieQ.data ?? []).map((d) => ({
        date: d.date.slice(5),
        label: d.date,
        total: Number(d.total),
      })),
    [serieQ.data],
  );

  const totalPeriode = useMemo(
    () => chart.reduce((s, d) => s + d.total, 0),
    [chart],
  );

  if (!peutLire) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Reporting ventes"
        subtitle={libellePerimetrePage(user?.role as RoleLibelle, {
          boutiqueId: filtre.boutiqueId,
          nomMagasin: filtre.nomMagasin,
          texteReseau: 'Évolution du CA et export détaillé (§6.3)',
          texteBoutique: 'CA de votre magasin',
        })}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const q = filtre.boutiqueId
                ? `?boutiqueId=${encodeURIComponent(filtre.boutiqueId)}`
                : '';
              void apiDownload(`/reporting/ventes/export.csv${q}`, 'ventes.csv');
            }}
          >
            <Download size={16} /> Export CSV
          </button>
        }
      />

      <div className="toolbar">
        <FiltreMagasinSiege id="ventes-reporting-magasin" />
      </div>

      <section className="kpi-grid dash-kpi-grid" style={{ marginBottom: 16 }}>
        <a href="#reporting-chart" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <TrendingUp size={16} />
            </span>
            <InfoTooltip
              insight={insightCa30Jours(
                String(totalPeriode),
                chart.filter((d) => d.total > 0).length,
              )}
            />
          </div>
          <div className="kpi-label">CA 30 jours (série)</div>
          <div className="kpi-value money">
            {serieQ.isLoading ? '…' : formatFcfa(totalPeriode)}
          </div>
          <div className="kpi-hint">Voir la courbe ci-dessous</div>
        </a>
        <a href="#reporting-chart" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <CalendarCheck size={16} />
            </span>
            <InfoTooltip
              insight={insightJoursAvecCa(
                chart.filter((d) => d.total > 0).length,
                chart.length,
              )}
            />
          </div>
          <div className="kpi-label">Jours avec CA</div>
          <div className="kpi-value">
            {chart.filter((d) => d.total > 0).length}
          </div>
          <div className="kpi-hint">Sur {chart.length} jour(s)</div>
        </a>
      </section>

      <ListPanel title="Évolution quotidienne — 30 jours" id="reporting-chart">
        {serieQ.isLoading && <LoadingState label="Chargement…" />}
        {serieQ.isError && (
          <p role="alert">Impossible de charger la série de ventes.</p>
        )}
        {!serieQ.isLoading && chart.length === 0 && (
          <EmptyState
            title="Aucune vente"
            description="Les encaissements POS alimenteront ce reporting."
          />
        )}
        {chart.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="ventesCaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#875A7B" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#875A7B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ef" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCompact(v)}
                width={48}
              />
              <Tooltip
                formatter={(value) => [formatFcfa(Number(value ?? 0)), 'CA']}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.label ?? '')
                }
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#875A7B"
                strokeWidth={2}
                fill="url(#ventesCaFill)"
                name="CA"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ListPanel>
    </div>
  );
}
