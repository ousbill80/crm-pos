import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiDownload, apiFetch } from '../lib/api';

// Dashboard Reporting §6.3.4 — source unique : GET /reporting/dashboard.
export interface ReportingDashboard {
  perimetre: 'RESEAU' | 'ZONE' | 'BOUTIQUE';
  genereAt: string;
  chiffreAffaires: {
    total: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      montant: string;
    }>;
    parModePaiement: Array<{ modePaiement: string; montant: string }>;
  };
  versements: {
    parStatut: Array<{ statut: string; nombre: number; montant: string }>;
    enRetard24h: number;
  };
  ecarts: {
    nombreLitiges: number;
    montantEcartsAbsolus: string;
  };
  tresorerie: {
    totalSoldesAuxiliaires: string;
    caisses: Array<{
      caisseId: string;
      type: string;
      boutiqueId: string | null;
      solde: string;
    }>;
  };
  crm: {
    nombreClients: number;
    parSegment: Array<{ segment: string; nombre: number }>;
  };
}

interface VenteQuotidienne {
  date: string;
  total: string;
}

const COULEURS_MODES = ['#2563eb', '#16a34a', '#d97706'];

function buildQuery(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
  if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function useReportingDashboard(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['reporting', 'dashboard', dateFrom, dateTo],
    queryFn: () =>
      apiFetch<ReportingDashboard>(`/reporting/dashboard${buildQuery(dateFrom, dateTo)}`),
  });
}

function useVentesQuotidiennes() {
  return useQuery({
    queryKey: ['reporting', 'ventes-quotidiennes'],
    queryFn: () =>
      apiFetch<VenteQuotidienne[]>('/reporting/ventes-quotidiennes?jours=30'),
  });
}

function formatFcfa(value: string) {
  return `${value} FCFA`;
}

export function DashboardPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data, isLoading, isError, error } = useReportingDashboard(dateFrom, dateTo);
  const { data: serieQuotidienne } = useVentesQuotidiennes();

  if (isLoading) {
    return <p>Chargement du tableau de bord...</p>;
  }

  if (isError) {
    return <p role="alert">Erreur reporting : {(error as Error).message}</p>;
  }

  if (!data) {
    return null;
  }

  const query = buildQuery(dateFrom, dateTo);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="lead">
            Périmètre <strong>{data.perimetre}</strong> · mis à jour{' '}
            {new Date(data.genereAt).toLocaleString()}
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Période & exports</h2>
        <div className="filtre-periode">
          <label htmlFor="dateFrom">Du</label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <label htmlFor="dateTo">Au</label>
          <input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}>
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={() =>
              void apiDownload(`/reporting/dashboard/export.csv${query}`, 'tableau-de-bord.csv')
            }
          >
            Exporter CA par boutique (CSV)
          </button>
          <button
            type="button"
            onClick={() =>
              void apiDownload(`/reporting/ventes/export.csv${query}`, 'ventes.csv')
            }
          >
            Exporter le détail des ventes (CSV)
          </button>
        </div>
      </section>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Chiffre d&apos;affaires</div>
          <div className="kpi-value">{formatFcfa(data.chiffreAffaires.total)}</div>
          <div className="kpi-hint">
            {data.chiffreAffaires.parBoutique.length} boutique(s)
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Trésorerie auxiliaire</div>
          <div className="kpi-value">
            {formatFcfa(data.tresorerie.totalSoldesAuxiliaires)}
          </div>
          <div className="kpi-hint">{data.tresorerie.caisses.length} caisse(s)</div>
        </div>
        <div
          className={
            data.versements.enRetard24h > 0 ? 'kpi-card kpi-warning' : 'kpi-card'
          }
        >
          <div className="kpi-label">Versements en retard</div>
          <div className="kpi-value">{data.versements.enRetard24h}</div>
          <div className="kpi-hint">&gt; 24 h non transmis</div>
        </div>
        <div
          className={
            data.ecarts.nombreLitiges > 0 ? 'kpi-card kpi-danger' : 'kpi-card'
          }
        >
          <div className="kpi-label">Litiges / écarts</div>
          <div className="kpi-value">{data.ecarts.nombreLitiges}</div>
          <div className="kpi-hint">
            {formatFcfa(data.ecarts.montantEcartsAbsolus)} cumulés
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Clients CRM</div>
          <div className="kpi-value">{data.crm.nombreClients}</div>
          <div className="kpi-hint">fichier consolidé réseau</div>
        </div>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>CA par boutique</h2>
          {data.chiffreAffaires.parBoutique.length === 0 ? (
            <p className="lead">Aucune vente sur la période.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.chiffreAffaires.parBoutique}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nomBoutique" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="montant" name="CA (FCFA)" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
              <ul>
                {data.chiffreAffaires.parBoutique.map((b) => (
                  <li key={b.boutiqueId}>
                    <span>{b.nomBoutique}</span>
                    <span className="money">{formatFcfa(b.montant)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Répartition par mode de paiement</h2>
          {data.chiffreAffaires.parModePaiement.length === 0 ? (
            <p className="lead">Aucune vente sur la période.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.chiffreAffaires.parModePaiement}
                  dataKey="montant"
                  nameKey="modePaiement"
                  outerRadius={80}
                  label
                >
                  {data.chiffreAffaires.parModePaiement.map((entry, index) => (
                    <Cell
                      key={entry.modePaiement}
                      fill={COULEURS_MODES[index % COULEURS_MODES.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="panel">
          <h2>Évolution du CA (30 derniers jours)</h2>
          {!serieQuotidienne || serieQuotidienne.length === 0 ? (
            <p className="lead">Aucune donnée disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={serieQuotidienne}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="CA (FCFA)"
                  stroke="#16a34a"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="panel">
          <h2>Versements par statut</h2>
          <ul>
            {data.versements.parStatut
              .filter((s) => s.nombre > 0)
              .map((s) => (
                <li key={s.statut}>
                  <span>
                    {s.statut} · {s.nombre}
                  </span>
                  <span className="money">{formatFcfa(s.montant)}</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Soldes de caisse</h2>
          <ul>
            {data.tresorerie.caisses.map((c) => (
              <li key={c.caisseId}>
                <span>
                  {c.type}{' '}
                  <small style={{ color: 'var(--text-muted)' }}>
                    {c.caisseId.slice(0, 8)}
                  </small>
                </span>
                <span className="money">{formatFcfa(c.solde)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Segments clients</h2>
          <ul>
            {data.crm.parSegment.map((s) => (
              <li key={s.segment}>
                <span>{s.segment}</span>
                <span className="money">{s.nombre}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
