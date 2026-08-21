import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  Download,
  FileText,
  Landmark,
  Package,
  Scale,
  TrendingDown,
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
  Cell,
  Pie,
  PieChart,
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
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  insightAlertesDaf,
  insightCashBoutiquesVsCentrale,
  insightMargeGlobale,
  insightMargeSurStock,
  insightRotationStock,
  insightSanteStock,
} from '../lib/insights/finance';
import { insightMargeBrute } from '../lib/insights/dashboard';
import type { Insight } from '../lib/insights/types';
import type { StockSyntheseDto } from '../lib/types';

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

const MODE_PAIEMENT_LABELS: Record<string, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  MOBILE_MONEY: 'Mobile Money',
  VIREMENT: 'Virement',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

const MODE_PAIEMENT_COLORS = [
  '#1B4F72',
  '#017E84',
  '#1e8449',
  '#d68910',
  '#7d3c98',
  '#5d6d7e',
];

function formatFcfa(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1)} M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(Math.round(value));
}

function periodeLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return 'Historique complet';
  if (dateFrom && dateTo) return `Du ${dateFrom} au ${dateTo}`;
  if (dateFrom) return `Depuis le ${dateFrom}`;
  return `Jusqu’au ${dateTo}`;
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

function CompteResultatPanel({
  data,
  dateFrom,
  dateTo,
}: {
  data: ReportingDaf;
  dateFrom: string;
  dateTo: string;
}) {
  const taux = Number(data.resultat.tauxMarge);
  const margeTone =
    taux < 0 ? 'negatif' : taux < 15 ? 'faible' : 'sain';

  const boutiquesTriees = useMemo(
    () =>
      [...data.resultat.parBoutique].sort(
        (a, b) => Number(b.margeBrute) - Number(a.margeBrute),
      ),
    [data.resultat.parBoutique],
  );

  const chartMarge = useMemo(
    () =>
      boutiquesTriees.map((r) => ({
        nom:
          r.nomBoutique.length > 18
            ? `${r.nomBoutique.slice(0, 16)}…`
            : r.nomBoutique,
        ca: Number(r.chiffreAffairesNet),
        marge: Number(r.margeBrute),
        taux: Number(r.tauxMarge),
      })),
    [boutiquesTriees],
  );

  const chartModes = useMemo(
    () =>
      data.resultat.parModePaiement.map((m) => ({
        name: MODE_PAIEMENT_LABELS[m.modePaiement] ?? m.modePaiement,
        value: Number(m.montant),
        key: m.modePaiement,
      })),
    [data.resultat.parModePaiement],
  );

  const totalModes = chartModes.reduce((s, m) => s + m.value, 0);

  return (
    <div className="pl-module">
      <header className="pl-header">
        <div>
          <p className="pl-eyebrow">Pôle central · Compte de résultat</p>
          <h2>Résultat d’exploitation réseau</h2>
          <p className="pl-periode">{periodeLabel(dateFrom, dateTo)}</p>
        </div>
        <div className={`pl-taux-badge pl-taux-${margeTone}`}>
          <span>Taux de marge brute</span>
          <strong>{data.resultat.tauxMarge} %</strong>
          <InfoTooltip
            insight={insightMargeBrute(
              data.resultat.margeBrute,
              data.resultat.tauxMarge,
            )}
          />
        </div>
      </header>

      <section className="pl-statement" aria-label="État du résultat">
        <div className="pl-line pl-line-ca">
          <div className="pl-line-label">
            <TrendingUp size={16} />
            <div>
              <strong>Chiffre d’affaires net</strong>
              <span>Ventes − retours sur la période</span>
            </div>
          </div>
          <div className="pl-line-value">{formatFcfa(data.resultat.caNet)}</div>
        </div>

        <div className="pl-line pl-line-cmv">
          <div className="pl-line-label">
            <ArrowDownRight size={16} />
            <div>
              <strong>Coût des marchandises vendues (CMV)</strong>
              <span>Coût unitaire figé à la vente (CMP)</span>
            </div>
          </div>
          <div className="pl-line-value pl-debit">
            − {formatFcfa(data.resultat.cmv)}
          </div>
        </div>

        <div className={`pl-line pl-line-marge pl-marge-${margeTone}`}>
          <div className="pl-line-label">
            {taux < 0 ? <TrendingDown size={16} /> : <Wallet size={16} />}
            <div>
              <strong>Marge brute</strong>
              <span>CA net − CMV · indicateur clé DAF</span>
            </div>
          </div>
          <div className="pl-line-value">
            {formatFcfa(data.resultat.margeBrute)}
          </div>
        </div>
      </section>

      <div className="pl-grid">
        <ListPanel
          title="Marge par boutique"
          toolbar={
            <span className="dash-panel-meta">Triée par marge décroissante</span>
          }
        >
          {chartMarge.length === 0 ? (
            <p className="lead">Aucune vente sur la période.</p>
          ) : (
            <div className="pl-chart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={chartMarge}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatCompact(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="nom"
                    width={110}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      formatFcfa(Number(v)),
                      name === 'marge' ? 'Marge brute' : 'CA net',
                    ]}
                  />
                  <Bar dataKey="ca" name="ca" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                  <Bar
                    dataKey="marge"
                    name="marge"
                    radius={[0, 4, 4, 0]}
                  >
                    {chartMarge.map((row) => (
                      <Cell
                        key={row.nom}
                        fill={
                          row.taux < 0
                            ? '#c0392b'
                            : row.taux < 15
                              ? '#d68910'
                              : '#1e8449'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ListPanel>

        <ListPanel title="Répartition par mode de paiement">
          {chartModes.length === 0 ? (
            <p className="lead">Aucun paiement enregistré sur la période.</p>
          ) : (
            <div className="pl-modes">
              <div className="pl-modes-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartModes}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {chartModes.map((entry, i) => (
                        <Cell
                          key={entry.key}
                          fill={MODE_PAIEMENT_COLORS[i % MODE_PAIEMENT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatFcfa(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="pl-modes-legend">
                {chartModes.map((m, i) => (
                  <li key={m.key}>
                    <span
                      className="pl-swatch"
                      style={{
                        background:
                          MODE_PAIEMENT_COLORS[i % MODE_PAIEMENT_COLORS.length],
                      }}
                    />
                    <span className="pl-modes-name">{m.name}</span>
                    <span className="pl-modes-amt">{formatFcfa(m.value)}</span>
                    <span className="pl-modes-pct">
                      {totalModes > 0
                        ? `${((m.value / totalModes) * 100).toFixed(0)} %`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ListPanel>
      </div>

      <ListPanel
        title="Détail par boutique"
        toolbar={
          <InfoTooltip
            insight={{
              title: 'Seuil de vigilance',
              interpretation:
                'Taux de marge < 15 % = vigilance ; marge négative = CMV supérieur au CA net.',
              severity: 'info',
            }}
          />
        }
      >
        <div className="table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Boutique</th>
                <th className="num">CA net</th>
                <th className="num">CMV</th>
                <th className="num">Marge brute</th>
                <th className="num">Taux</th>
                <th className="num">Stock (CMP)</th>
              </tr>
            </thead>
            <tbody>
              {boutiquesTriees.length === 0 ? (
                <tr>
                  <td colSpan={6}>Aucune boutique avec activité sur la période.</td>
                </tr>
              ) : (
                boutiquesTriees.map((r) => {
                  const t = Number(r.tauxMarge);
                  const neg = t < 0;
                  const faible = !neg && t < 15;
                  return (
                    <tr key={r.boutiqueId}>
                      <td>
                        <span className="pl-boutique-name">
                          {r.nomBoutique}
                          <InfoTooltip
                            insight={insightMargeBrute(r.margeBrute, r.tauxMarge)}
                          />
                        </span>
                      </td>
                      <td className="num">{formatFcfa(r.chiffreAffairesNet)}</td>
                      <td className="num">{formatFcfa(r.coutDesVentes)}</td>
                      <td className="num">{formatFcfa(r.margeBrute)}</td>
                      <td className="num">
                        <span
                          className={
                            neg
                              ? 'badge badge-danger'
                              : faible
                                ? 'badge badge-warning'
                                : 'badge badge-ok'
                          }
                        >
                          {r.tauxMarge} %
                        </span>
                      </td>
                      <td className="num">{formatFcfa(r.valeurStock)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>Total réseau</th>
                <th className="num">{formatFcfa(data.resultat.caNet)}</th>
                <th className="num">{formatFcfa(data.resultat.cmv)}</th>
                <th className="num">{formatFcfa(data.resultat.margeBrute)}</th>
                <th className="num">
                  <span className={`badge badge-${margeTone === 'sain' ? 'ok' : margeTone === 'faible' ? 'warning' : 'danger'}`}>
                    {data.resultat.tauxMarge} %
                  </span>
                </th>
                <th className="num">{formatFcfa(data.stocks.valeurTotale)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </ListPanel>
    </div>
  );
}

function dafPourMagasin(data: ReportingDaf, boutiqueId: string): ReportingDaf {
  const resultatBoutique = data.resultat.parBoutique.filter(
    (b) => b.boutiqueId === boutiqueId,
  );
  const stocksBoutique = data.stocks.parBoutique.filter(
    (b) => b.boutiqueId === boutiqueId,
  );
  const r = resultatBoutique[0];
  const s = stocksBoutique[0];
  return {
    ...data,
    resultat: {
      ...data.resultat,
      caNet: r?.chiffreAffairesNet ?? '0',
      cmv: r?.coutDesVentes ?? '0',
      margeBrute: r?.margeBrute ?? '0',
      tauxMarge: r?.tauxMarge ?? '0',
      parBoutique: resultatBoutique,
    },
    stocks: {
      ...data.stocks,
      valeurTotale: s?.valeur ?? data.stocks.valeurTotale,
      ruptures: s?.ruptures ?? 0,
      sousSeuil: s?.sousSeuil ?? 0,
      parBoutique: stocksBoutique,
    },
  };
}

export function FinancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const magasin = useFiltreMagasinSiege();
  const [searchParams, setSearchParams] = useSearchParams();
  const onglet = (searchParams.get('tab') as Onglet | null) ?? 'vue';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [boutiqueStockId, setBoutiqueStockId] = useState<string | null>(
    () => magasin.boutiqueId || null,
  );

  const peutLire =
    user !== null && ROLES_FINANCE.includes(user.role as RoleLibelle);

  const query = buildQuery(dateFrom, dateTo);
  const daf = useQuery({
    queryKey: ['reporting', 'daf', dateFrom, dateTo],
    queryFn: () => apiFetch<ReportingDaf>(`/reporting/daf${query}`),
    enabled: peutLire,
  });

  const data = useMemo(
    () =>
      daf.data && magasin.boutiqueId
        ? dafPourMagasin(daf.data, magasin.boutiqueId)
        : daf.data,
    [daf.data, magasin.boutiqueId],
  );

  useEffect(() => {
    if (magasin.boutiqueId) setBoutiqueStockId(magasin.boutiqueId);
  }, [magasin.boutiqueId]);

  const syntheseStock = useQuery({
    queryKey: ['stocks', 'synthese', 'finance'],
    queryFn: () => apiFetch<StockSyntheseDto>('/stocks/synthese'),
    enabled: peutLire && onglet === 'stocks' && Boolean(boutiqueStockId),
  });

  const boutiqueSelectionnee = data?.stocks.parBoutique.find(
    (b) => b.boutiqueId === boutiqueStockId,
  );

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
    const next = new URLSearchParams(searchParams);
    if (tab === 'vue') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
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
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Pôle central DAF — résultat ventes, stocks, analyse et trésorerie réseau',
        })}
        actions={
          <div className="page-header-actions-row">
            <FiltreMagasinSiege id="finance-filtre-magasin" />
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
            <div className="rapport-actions" aria-label="Exports du rapport Finance">
              <span className="rapport-actions-label">Rapport</span>
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
                <Download size={14} /> CSV
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void apiDownload(
                    `/reporting/daf/export.pdf${query}`,
                    'finance-daf.pdf',
                  )
                }
              >
                <FileText size={14} /> PDF
              </button>
            </div>
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
          <section className="kpi-grid dash-kpi-grid" aria-label="KPI pôle central">
            <button
              type="button"
              className="kpi-card dash-kpi"
              onClick={() => setOnglet('resultat')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <TrendingUp size={16} />
                </span>
                <InfoTooltip
                  insight={insightMargeGlobale(
                    data.resultat.tauxMarge,
                    data.resultat.caNet,
                  )}
                />
              </div>
              <div className="kpi-label">CA net</div>
              <div className="kpi-value">{formatFcfa(data.resultat.caNet)}</div>
              <div className="kpi-hint">
                Marge {data.resultat.tauxMarge} % · cliquer → résultat
              </div>
            </button>
            <button
              type="button"
              className="kpi-card dash-kpi"
              onClick={() => setOnglet('resultat')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Wallet size={16} />
                </span>
                <InfoTooltip
                  insight={insightMargeBrute(
                    data.resultat.margeBrute,
                    data.resultat.tauxMarge,
                  )}
                />
              </div>
              <div className="kpi-label">Marge brute</div>
              <div className="kpi-value">
                {formatFcfa(data.resultat.margeBrute)}
              </div>
              <div className="kpi-hint">
                CMV {formatFcfa(data.resultat.cmv)} · cliquer → résultat
              </div>
            </button>
            <button
              type="button"
              className="kpi-card dash-kpi"
              onClick={() => navigate('/stocks')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Package size={16} />
                </span>
                <InfoTooltip
                  insight={insightSanteStock(
                    data.stocks.sante,
                    data.stocks.ruptures,
                    data.stocks.sousSeuil,
                  )}
                />
              </div>
              <div className="kpi-label">Valeur stock</div>
              <div className="kpi-value">
                {formatFcfa(data.stocks.valeurTotale)}
              </div>
              <div className="kpi-hint">
                {data.stocks.ruptures} rupture(s) · cliquer → stocks
              </div>
            </button>
            <button
              type="button"
              className="kpi-card dash-kpi"
              onClick={() => navigate('/tresorerie')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Landmark size={16} />
                </span>
                <InfoTooltip
                  insight={insightCashBoutiquesVsCentrale(
                    data.tresorerie.soldeMagasins,
                    data.tresorerie.soldeTiroirs,
                    data.tresorerie.soldeCentrale,
                  )}
                />
              </div>
              <div className="kpi-label">Cash conseillé</div>
              <div className="kpi-value">
                {formatFcfa(data.tresorerie.cashConseille)}
              </div>
              <div className="kpi-hint">
                Centrale {formatFcfa(data.tresorerie.soldeCentrale)} · cliquer
              </div>
            </button>
          </section>

          {data.analyse.alertes.length > 0 && (
            <ListPanel title="Alertes croisées">
              <ul className="alert-list">
                {data.analyse.alertes.map((a) => {
                  const href =
                    a.code === 'LITIGES_OUVERTS'
                      ? '/litiges'
                      : a.code === 'VERSEMENTS_RETARD'
                        ? '/alertes?type=VERSEMENT_EN_RETARD'
                        : a.code === 'STOCK_RUPTURES' || a.code === 'STOCK_SOUS_SEUIL'
                          ? '/stocks'
                          : a.code === 'CASH_BLOQUE_BOUTIQUES'
                            ? '/tresorerie'
                            : null;
                  return (
                    <li key={a.code} className={`alert-item alert-${a.severite}`}>
                      <AlertTriangle size={14} />{' '}
                      {href ? <Link to={href}>{a.message}</Link> : a.message}
                    </li>
                  );
                })}
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
        <CompteResultatPanel
          data={data}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
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
          <div className="charts-row">
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
                      <tr
                        key={b.boutiqueId}
                        className={
                          boutiqueStockId === b.boutiqueId ? 'row-selected' : undefined
                        }
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setBoutiqueStockId(b.boutiqueId);
                          magasin.setBoutiqueId(b.boutiqueId);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setBoutiqueStockId(b.boutiqueId);
                            magasin.setBoutiqueId(b.boutiqueId);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Détail stock ${b.nomBoutique}`}
                      >
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

            <ListPanel
              title={
                boutiqueSelectionnee
                  ? `Détail — ${boutiqueSelectionnee.nomBoutique}`
                  : 'Détail boutique'
              }
              toolbar={
                boutiqueStockId ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setBoutiqueStockId(null)}
                  >
                    Fermer
                  </button>
                ) : null
              }
            >
              {!boutiqueStockId && (
                <p className="lead">
                  Cliquez une ligne pour afficher les entrepôts, ruptures et liens
                  magasin.
                </p>
              )}
              {boutiqueStockId && boutiqueSelectionnee && (
                <div className="client-workspace-section">
                  <div className="client-kpi-grid">
                    <article className="client-kpi-card">
                      <div className="client-kpi-label">Valeur</div>
                      <div className="client-kpi-value client-kpi-value-sm money">
                        {formatFcfa(boutiqueSelectionnee.valeur)}
                      </div>
                    </article>
                    <article className="client-kpi-card">
                      <div className="client-kpi-label">Unités</div>
                      <div className="client-kpi-value">
                        {boutiqueSelectionnee.unites}
                      </div>
                    </article>
                    <article className="client-kpi-card">
                      <div className="client-kpi-label">Ruptures</div>
                      <div className="client-kpi-value">
                        {boutiqueSelectionnee.ruptures}
                      </div>
                    </article>
                    <article className="client-kpi-card">
                      <div className="client-kpi-label">Sous seuil</div>
                      <div className="client-kpi-value">
                        {boutiqueSelectionnee.sousSeuil}
                      </div>
                    </article>
                  </div>
                  {syntheseStock.isLoading && (
                    <LoadingState label="Chargement synthèse…" />
                  )}
                  {syntheseStock.data && (
                    <div className="table-wrap" style={{ marginTop: '1rem' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Entrepôt</th>
                            <th>Unités</th>
                            <th>Valeur</th>
                            <th>Ruptures</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {syntheseStock.data.parEntrepot
                            .filter((e) => e.boutiqueId === boutiqueStockId)
                            .map((e) => (
                              <tr key={e.entrepotId}>
                                <td>
                                  {e.nom} ({e.code})
                                </td>
                                <td>{e.unites}</td>
                                <td>{formatFcfa(e.valeur)}</td>
                                <td>{e.ruptures}</td>
                                <td>
                                  <Link
                                    className="link-button"
                                    to={`/stocks/entrepots/${e.entrepotId}`}
                                  >
                                    Ouvrir
                                  </Link>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="lead" style={{ marginTop: '0.75rem' }}>
                    <Link to={`/stocks?boutiqueId=${boutiqueStockId}`}>
                      Voir le module Stocks filtré
                    </Link>
                  </p>
                </div>
              )}
            </ListPanel>
          </div>
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
