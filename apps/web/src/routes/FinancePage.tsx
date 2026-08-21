import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  Landmark,
  Package,
  Scale,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightAlertesDaf,
  insightCashBoutiquesVsCentrale,
  insightMargeGlobale,
  insightMargeSurStock,
  insightRotationStock,
  insightSanteStock,
} from '../lib/insights/finance';
import type { Insight } from '../lib/insights/types';

const ROLES_FINANCE: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
];

type Onglet = 'vue' | 'resultat' | 'stocks' | 'tresorerie';

export interface ReportingDaf {
  perimetre: 'RESEAU';
  genereAt: string;
  periode: { dateFrom: string | null; dateTo: string | null };
  resultat: {
    caNet: string;
    cmv: string;
    margeBrute: string;
    tauxMarge: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      chiffreAffairesNet: string;
      coutDesVentes: string;
      margeBrute: string;
      tauxMarge: string;
      valeurStock: string;
    }>;
    parModePaiement: Array<{ modePaiement: string; montant: string }>;
  };
  stocks: {
    valeurTotale: string;
    ruptures: number;
    sousSeuil: number;
    couvertureMediane: number | null;
    sante: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      unites: number;
      valeur: string;
      ruptures: number;
      sousSeuil: number;
    }>;
  };
  tresorerie: {
    soldeMagasins: string;
    soldeTiroirs: string;
    soldeCentrale: string;
    cashConseille: string;
    versementsEnCours: string;
    ageing: Array<{
      bucket: string;
      nombre: number;
      montant: string;
    }>;
    litiges: { nombre: number; montantEcartsAbsolus: string };
    courbe: Array<{
      jourOffset: number;
      date: string;
      cashBase: string;
    }>;
    meta: { moyenneCaJournalier30j: string; methode: string };
  };
  analyse: {
    margeSurStock: string | null;
    rotationIndicateur: string | null;
    alertes: Array<{ code: string; message: string; severite: string }>;
  };
}

const AGEING_LABELS: Record<string, string> = {
  '0_24h': '0–24 h',
  '24_48h': '24–48 h',
  '48_72h': '48–72 h',
  plus_72h: '+72 h',
};

function formatFcfa(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function buildQuery(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const q = params.toString();
  return q ? `?${q}` : '';
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={`insight-card insight-${insight.severity}`}>
      <h3>{insight.title}</h3>
      <p>{insight.interpretation}</p>
      {insight.recommendation ? (
        <p className="insight-reco">{insight.recommendation}</p>
      ) : null}
    </article>
  );
}

export function FinancePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const onglet = (searchParams.get('tab') as Onglet | null) ?? 'vue';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const peutLire =
    user !== null && ROLES_FINANCE.includes(user.role as RoleLibelle);

  const query = buildQuery(dateFrom, dateTo);
  const daf = useQuery({
    queryKey: ['reporting', 'daf', dateFrom, dateTo],
    queryFn: () => apiFetch<ReportingDaf>(`/reporting/daf${query}`),
    enabled: peutLire,
  });

  const data = daf.data;

  const insights = useMemo(() => {
    if (!data) return [];
    return [
      insightMargeGlobale(data.resultat.tauxMarge, data.resultat.caNet),
      insightMargeSurStock(data.analyse.margeSurStock, data.stocks.valeurTotale),
      insightRotationStock(data.analyse.rotationIndicateur),
      insightSanteStock(
        data.stocks.sante,
        data.stocks.ruptures,
        data.stocks.sousSeuil,
      ),
      insightCashBoutiquesVsCentrale(
        data.tresorerie.soldeMagasins,
        data.tresorerie.soldeTiroirs,
        data.tresorerie.soldeCentrale,
      ),
      insightAlertesDaf(data.analyse.alertes),
    ];
  }, [data]);

  const courbeChart = (data?.tresorerie.courbe ?? []).map((p) => ({
    jour: `J+${p.jourOffset}`,
    Projection: Number(p.cashBase),
  }));

  const ageingChart = (data?.tresorerie.ageing ?? []).map((a) => ({
    bucket: AGEING_LABELS[a.bucket] ?? a.bucket,
    montant: Number(a.montant),
  }));

  if (!peutLire) {
    return <Navigate to="/dashboard" replace />;
  }

  function setOnglet(tab: Onglet) {
    setSearchParams(tab === 'vue' ? {} : { tab });
  }

  const tabs: Array<{ id: Onglet; label: string }> = [
    { id: 'vue', label: 'Vue DAF' },
    { id: 'resultat', label: 'Compte de résultat' },
    { id: 'stocks', label: 'Stocks & valorisation' },
    { id: 'tresorerie', label: 'Trésorerie' },
  ];

  return (
    <div className="finance-module">
      <PageHeader
        title="Finance"
        subtitle="Pôle central DAF — résultat ventes, stocks, analyse et trésorerie réseau"
        actions={
          <div className="page-header-actions-row">
            <nav className="circuit-nav" aria-label="Liens Finance">
              <Link className="circuit-nav-item" to="/achats/factures">
                <Truck size={14} /> Factures
              </Link>
              <Link className="circuit-nav-item" to="/achats/commandes">
                <Package size={14} /> Commandes
              </Link>
              <Link className="circuit-nav-item" to="/litiges">
                <Scale size={14} /> Litiges
              </Link>
              <Link className="circuit-nav-item circuit-nav-primary" to="/tresorerie">
                <Landmark size={14} /> Circuit caisse
              </Link>
            </nav>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                void apiDownload(
                  `/reporting/daf/export.csv${query}`,
                  'finance-daf.csv',
                )
              }
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        }
      />

      <div className="finance-filters">
        <label>
          Du
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label>
          Au
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <InfoTooltip
          insight={{
            title: 'Période',
            interpretation:
              'Appliquée au compte de résultat (CA / CMV / marge). Stocks et soldes cash sont à l’instant T.',
            severity: 'info',
          }}
        />
      </div>

      <nav className="cfg-nav finance-tabs" aria-label="Onglets Finance">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`cfg-nav-item${onglet === t.id ? ' actif' : ''}`}
            onClick={() => setOnglet(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {daf.isLoading && <LoadingState label="Chargement du cockpit Finance…" />}
      {daf.isError && (
        <p role="alert">Impossible de charger le cockpit Finance DAF.</p>
      )}

      {data && onglet === 'vue' && (
        <>
          <section className="kpi-grid" aria-label="KPI pôle central">
            <article className="kpi-card">
              <div className="kpi-label">
                <TrendingUp size={16} /> CA net
              </div>
              <div className="kpi-value">{formatFcfa(data.resultat.caNet)}</div>
              <div className="kpi-hint">Marge {data.resultat.tauxMarge} %</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">
                <Wallet size={16} /> Marge brute
              </div>
              <div className="kpi-value">
                {formatFcfa(data.resultat.margeBrute)}
              </div>
              <div className="kpi-hint">CMV {formatFcfa(data.resultat.cmv)}</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">
                <Package size={16} /> Valeur stock
              </div>
              <div className="kpi-value">
                {formatFcfa(data.stocks.valeurTotale)}
              </div>
              <div className="kpi-hint">
                {data.stocks.ruptures} rupture(s) · santé {data.stocks.sante}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">
                <Landmark size={16} /> Cash conseillé
              </div>
              <div className="kpi-value">
                {formatFcfa(data.tresorerie.cashConseille)}
              </div>
              <div className="kpi-hint">
                Centrale {formatFcfa(data.tresorerie.soldeCentrale)}
              </div>
            </article>
          </section>

          {data.analyse.alertes.length > 0 && (
            <ListPanel title="Alertes croisées">
              <ul className="alert-list">
                {data.analyse.alertes.map((a) => (
                  <li key={a.code} className={`alert-item alert-${a.severite}`}>
                    <AlertTriangle size={14} /> {a.message}
                  </li>
                ))}
              </ul>
            </ListPanel>
          )}

          <section className="insight-grid" aria-label="Insights Finance">
            {insights.map((i) => (
              <InsightCard key={i.title} insight={i} />
            ))}
          </section>
        </>
      )}

      {data && onglet === 'resultat' && (
        <ListPanel title="Compte de résultat par boutique">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Boutique</th>
                  <th>CA net</th>
                  <th>CMV</th>
                  <th>Marge brute</th>
                  <th>Taux</th>
                  <th>Valeur stock</th>
                </tr>
              </thead>
              <tbody>
                {data.resultat.parBoutique.map((r) => (
                  <tr key={r.boutiqueId}>
                    <td>{r.nomBoutique}</td>
                    <td>{formatFcfa(r.chiffreAffairesNet)}</td>
                    <td>{formatFcfa(r.coutDesVentes)}</td>
                    <td>{formatFcfa(r.margeBrute)}</td>
                    <td>{r.tauxMarge} %</td>
                    <td>{formatFcfa(r.valeurStock)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Réseau</th>
                  <th>{formatFcfa(data.resultat.caNet)}</th>
                  <th>{formatFcfa(data.resultat.cmv)}</th>
                  <th>{formatFcfa(data.resultat.margeBrute)}</th>
                  <th>{data.resultat.tauxMarge} %</th>
                  <th>{formatFcfa(data.stocks.valeurTotale)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
          {data.resultat.parModePaiement.length > 0 && (
            <>
              <h3>Par mode de paiement</h3>
              <ul className="mode-paiement-list">
                {data.resultat.parModePaiement.map((m) => (
                  <li key={m.modePaiement}>
                    {m.modePaiement} — {formatFcfa(m.montant)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </ListPanel>
      )}

      {data && onglet === 'stocks' && (
        <>
          <section className="kpi-grid" aria-label="KPI stocks">
            <article className="kpi-card">
              <div className="kpi-label">Valorisation</div>
              <div className="kpi-value">
                {formatFcfa(data.stocks.valeurTotale)}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Ruptures</div>
              <div className="kpi-value">{data.stocks.ruptures}</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Sous seuil</div>
              <div className="kpi-value">{data.stocks.sousSeuil}</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Couverture médiane</div>
              <div className="kpi-value">
                {data.stocks.couvertureMediane != null
                  ? `${data.stocks.couvertureMediane} j`
                  : '—'}
              </div>
            </article>
          </section>
          <ListPanel
            title="Valorisation par boutique"
            toolbar={
              <Link className="btn btn-secondary" to="/stocks">
                Ouvrir Stocks
              </Link>
            }
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Boutique</th>
                    <th>Unités</th>
                    <th>Valeur</th>
                    <th>Ruptures</th>
                    <th>Sous seuil</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stocks.parBoutique.map((b) => (
                    <tr key={b.boutiqueId}>
                      <td>{b.nomBoutique}</td>
                      <td>{b.unites}</td>
                      <td>{formatFcfa(b.valeur)}</td>
                      <td>{b.ruptures}</td>
                      <td>{b.sousSeuil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ListPanel>
        </>
      )}

      {data && onglet === 'tresorerie' && (
        <>
          <section className="kpi-grid" aria-label="Position cash">
            <article className="kpi-card">
              <div className="kpi-label">Magasins (cash office)</div>
              <div className="kpi-value">
                {formatFcfa(data.tresorerie.soldeMagasins)}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Tiroirs POS</div>
              <div className="kpi-value">
                {formatFcfa(data.tresorerie.soldeTiroirs)}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Centrale</div>
              <div className="kpi-value">
                {formatFcfa(data.tresorerie.soldeCentrale)}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Versements en cours</div>
              <div className="kpi-value">
                {formatFcfa(data.tresorerie.versementsEnCours)}
              </div>
              <div className="kpi-hint">
                {data.tresorerie.litiges.nombre} litige(s)
              </div>
            </article>
          </section>

          <div className="charts-row">
            <ListPanel title="Projection cash (indicatif)">
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <AreaChart data={courbeChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="jour" hide />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      formatter={(v) => formatFcfa(Number(v))}
                    />
                    <Area
                      type="monotone"
                      dataKey="Projection"
                      stroke="var(--accent, #017E84)"
                      fill="var(--accent, #017E84)"
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ListPanel>
            <ListPanel title="Ageing versements">
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={ageingChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => formatFcfa(Number(v))} />
                    <Bar dataKey="montant" fill="var(--accent, #017E84)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ListPanel>
          </div>
        </>
      )}

      {data && (
        <p className="meta-foot">
          Périmètre {data.perimetre} · actualisé{' '}
          {new Date(data.genereAt).toLocaleString('fr-FR')}
        </p>
      )}
    </div>
  );
}
