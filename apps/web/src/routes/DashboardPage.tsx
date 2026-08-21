import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  Download,
  FileText,
  Package,
  Scale,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  buildPrioritesDashboard,
  insightChiffreAffaires,
  insightClientsCrm,
  insightLitiges,
  insightMargeBrute,
  insightTresorerie,
  insightVersementsEnRetard,
  synthetiserSante,
} from '../lib/insights/dashboard';

type DashSectionId =
  | 'ca-evolution'
  | 'ca-boutiques'
  | 'modes'
  | 'rentabilite'
  | 'pipeline'
  | 'soldes'
  | 'segments';

const DASH_SECTIONS: DashSectionId[] = [
  'ca-evolution',
  'ca-boutiques',
  'modes',
  'rentabilite',
  'pipeline',
  'soldes',
  'segments',
];

const DASH_OPEN_DEFAULT: Record<DashSectionId, boolean> = {
  'ca-evolution': true,
  'ca-boutiques': true,
  modes: true,
  rentabilite: true,
  pipeline: true,
  soldes: true,
  segments: true,
};

function DashSection({
  id,
  title,
  meta,
  open,
  onToggle,
  summary,
  children,
  className,
}: {
  id: DashSectionId;
  title: string;
  meta?: ReactNode;
  open: boolean;
  onToggle: (id: DashSectionId) => void;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`panel dash-section ${open ? 'is-open' : 'is-collapsed'}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="dash-section-toggle"
        aria-expanded={open}
        aria-controls={`dash-section-${id}`}
        onClick={() => onToggle(id)}
      >
        <span className="dash-section-title-wrap">
          <h2>{title}</h2>
          {meta ? <span className="dash-panel-meta">{meta}</span> : null}
        </span>
        <span className="dash-section-chevron" aria-hidden>
          <ChevronDown size={18} />
        </span>
      </button>
      {!open && summary ? (
        <div className="dash-section-summary">{summary}</div>
      ) : null}
      {open ? (
        <div id={`dash-section-${id}`} className="dash-section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

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
  rentabiliteParBoutique: Array<{
    boutiqueId: string;
    nomBoutique: string;
    chiffreAffairesNet: string;
    coutDesVentes: string;
    margeBrute: string;
    tauxMarge: string;
    valeurStock: string;
  }>;
}

interface VenteQuotidienne {
  date: string;
  total: string;
}

type PeriodePreset = '7j' | '30j' | 'mois' | 'perso';

const COULEURS_MODES = ['#0f766e', '#2563eb', '#d97706', '#7c3aed'];
const COULEURS_SEGMENTS: Record<string, string> = {
  VIP: '#0f766e',
  REGULIER: '#2563eb',
  NOUVEAU: '#d97706',
};

const STATUT_ORDER = [
  'INITIEE',
  'EN_TRANSIT',
  'RECEPTIONNEE',
  'VALIDEE',
  'LITIGE',
] as const;

const STATUT_LABEL: Record<string, string> = {
  INITIEE: 'Initiée',
  EN_TRANSIT: 'En transit',
  RECEPTIONNEE: 'Réceptionnée',
  VALIDEE: 'Validée',
  LITIGE: 'Litige',
};

const MODE_LABEL: Record<string, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  MOBILE_MONEY: 'Mobile Money',
};

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangeForPreset(preset: Exclude<PeriodePreset, 'perso'>): { from: string; to: string } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (preset === '7j') from.setDate(from.getDate() - 6);
  else if (preset === '30j') from.setDate(from.getDate() - 29);
  else from.setDate(1);
  return { from: toInputDate(from), to: toInputDate(to) };
}

function buildQuery(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams();
  if (dateFrom) {
    const d = new Date(dateFrom);
    d.setHours(0, 0, 0, 0);
    params.set('dateFrom', d.toISOString());
  }
  if (dateTo) {
    const d = new Date(dateTo);
    d.setHours(23, 59, 59, 999);
    params.set('dateTo', d.toISOString());
  }
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
    queryFn: () => apiFetch<VenteQuotidienne[]>('/reporting/ventes-quotidiennes?jours=30'),
  });
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

function tendanceCa(serie: VenteQuotidienne[] | undefined): { deltaPct: number | null; label: string } {
  if (!serie || serie.length < 8) return { deltaPct: null, label: 'Tendance N/D' };
  const nums = serie.map((d) => Number(d.total));
  const recent = nums.slice(-7).reduce((a, b) => a + b, 0);
  const prev = nums.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (prev === 0) {
    return { deltaPct: recent > 0 ? 100 : 0, label: recent > 0 ? 'vs 7 j. préc.' : 'Stable' };
  }
  return { deltaPct: ((recent - prev) / prev) * 100, label: 'vs 7 j. préc.' };
}

function tooltipStyle() {
  return {
    borderRadius: 8,
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)',
    fontSize: 12.5,
  };
}

function dashboardPourMagasin(
  data: ReportingDashboard,
  boutiqueId: string,
): ReportingDashboard {
  const parBoutique = data.chiffreAffaires.parBoutique.filter(
    (b) => b.boutiqueId === boutiqueId,
  );
  const total = parBoutique.reduce((n, b) => n + Number(b.montant), 0);
  const caisses = data.tresorerie.caisses.filter((c) => c.boutiqueId === boutiqueId);
  const auxiliaires = caisses.reduce((n, c) => n + Number(c.solde), 0);
  const rentabilite = data.rentabiliteParBoutique.filter(
    (r) => r.boutiqueId === boutiqueId,
  );
  return {
    ...data,
    chiffreAffaires: {
      ...data.chiffreAffaires,
      total: String(total),
      parBoutique,
    },
    tresorerie: {
      ...data.tresorerie,
      totalSoldesAuxiliaires: String(auxiliaires),
      caisses,
    },
    rentabiliteParBoutique: rentabilite,
  };
}

export function DashboardPage() {
  const { user } = useAuth();
  const magasin = useFiltreMagasinSiege();
  const initial = rangeForPreset('30j');
  const [preset, setPreset] = useState<PeriodePreset>('30j');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const { data: brut, isLoading, isError, error, isFetching } =
    useReportingDashboard(dateFrom, dateTo);
  const { data: serieQuotidienne } = useVentesQuotidiennes();
  const data = useMemo(
    () =>
      brut && magasin.boutiqueId
        ? dashboardPourMagasin(brut, magasin.boutiqueId)
        : brut,
    [brut, magasin.boutiqueId],
  );

  const priorites = useMemo(
    () =>
      data
        ? buildPrioritesDashboard({
            versementsEnRetard24h: data.versements.enRetard24h,
            nombreLitiges: data.ecarts.nombreLitiges,
            montantEcartsAbsolus: data.ecarts.montantEcartsAbsolus,
            rentabilite: data.rentabiliteParBoutique.map((r) => ({
              boutiqueId: r.boutiqueId,
              nomBoutique: r.nomBoutique,
              margeBrute: r.margeBrute,
              tauxMarge: r.tauxMarge,
            })),
          })
        : [],
    [data],
  );
  const sante = useMemo(() => synthetiserSante(priorites), [priorites]);
  const tendance = useMemo(() => tendanceCa(serieQuotidienne), [serieQuotidienne]);

  const serieChart = useMemo(
    () =>
      (serieQuotidienne ?? []).map((d) => ({
        date: d.date.slice(5),
        total: Number(d.total),
        label: d.date,
      })),
    [serieQuotidienne],
  );

  const modesChart = useMemo(
    () =>
      (data?.chiffreAffaires.parModePaiement ?? []).map((m) => ({
        ...m,
        montant: Number(m.montant),
        label: MODE_LABEL[m.modePaiement] ?? m.modePaiement,
      })),
    [data],
  );

  const caMax = Math.max(
    ...(data?.chiffreAffaires.parBoutique.map((b) => Number(b.montant)) ?? [0]),
    1,
  );

  const margeReseau = useMemo(() => {
    if (!data?.rentabiliteParBoutique.length) return null;
    const ca = data.rentabiliteParBoutique.reduce((s, r) => s + Number(r.chiffreAffairesNet), 0);
    const marge = data.rentabiliteParBoutique.reduce((s, r) => s + Number(r.margeBrute), 0);
    return { marge, taux: ca > 0 ? ((marge / ca) * 100).toFixed(1) : '0.0' };
  }, [data]);

  function applyPreset(p: Exclude<PeriodePreset, 'perso'>) {
    const r = rangeForPreset(p);
    setPreset(p);
    setDateFrom(r.from);
    setDateTo(r.to);
  }

  const query = buildQuery(dateFrom, dateTo);

  return (
    <div className="dash">
      <PageHeader
        title="Tableau de bord"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau: data
            ? `Périmètre ${data.perimetre} · actualisé ${new Date(data.genereAt).toLocaleString('fr-FR')}`
            : 'Pilotage CA, trésorerie, rentabilité et CRM',
          texteBoutique: 'Pilotage du magasin — CA, trésorerie et rentabilité',
        })}
        actions={
          <div className="dash-toolbar">
            <FiltreMagasinSiege id="dash-filtre-magasin" />
            <div className="dash-presets" role="group" aria-label="Période">
              {(
                [
                  ['7j', '7 jours'],
                  ['30j', '30 jours'],
                  ['mois', 'Ce mois'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={preset === id ? 'dash-preset actif' : 'dash-preset'}
                  onClick={() => applyPreset(id)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={preset === 'perso' ? 'dash-preset actif' : 'dash-preset'}
                onClick={() => setPreset('perso')}
              >
                Perso
              </button>
            </div>
            {preset === 'perso' && (
              <div className="filtre-periode">
                <label htmlFor="dateFrom">Du</label>
                <input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setPreset('perso');
                    setDateFrom(e.target.value);
                  }}
                />
                <label htmlFor="dateTo">Au</label>
                <input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setPreset('perso');
                    setDateTo(e.target.value);
                  }}
                />
              </div>
            )}
            <div className="rapport-actions" aria-label="Exports du tableau de bord">
              <span className="rapport-actions-label">Rapport</span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  void apiDownload(`/reporting/dashboard/export.csv${query}`, 'tableau-de-bord.csv')
                }
              >
                <Download size={14} /> CSV boutique
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void apiDownload(`/reporting/ventes/export.csv${query}`, 'ventes.csv')}
              >
                <Download size={14} /> Détail ventes
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void apiDownload(`/reporting/dashboard/export.pdf${query}`, 'tableau-de-bord.pdf')
                }
              >
                <FileText size={14} /> PDF
              </button>
            </div>
          </div>
        }
      />

      {isLoading && <LoadingState label="Chargement du tableau de bord…" />}
      {isError && <p role="alert">Erreur reporting : {(error as Error).message}</p>}

      {data && (
        <>
          {isFetching && !isLoading && <p className="dash-refreshing">Actualisation…</p>}

          <section className={`dash-sante dash-sante-${sante.severity}`}>
            <div className="dash-sante-main">
              <span className="dash-sante-badge">{sante.label}</span>
              <p>{sante.detail}</p>
            </div>
            <div className="dash-sante-meta">
              <span>{priorites.length} priorité(s)</span>
              <Link to="/alertes">
                Alertes <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          {priorites.length > 0 && (
            <section className="dash-priorites" aria-label="Actions prioritaires">
              <h2>À traiter</h2>
              <div className="dash-priorites-grid">
                {priorites.slice(0, 4).map((p) => (
                  <article key={p.id} className={`dash-priorite dash-priorite-${p.severity}`}>
                    <div className="dash-priorite-icon">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h3>{p.title}</h3>
                      <p>{p.detail}</p>
                      <Link to={p.href}>
                        {p.cta} <ArrowRight size={13} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="kpi-grid dash-kpi-grid">
            <Link to="/finance?tab=resultat" className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <ShoppingCart size={16} />
                </span>
                <InfoTooltip
                  insight={insightChiffreAffaires(
                    data.chiffreAffaires.total,
                    data.chiffreAffaires.parBoutique.length,
                  )}
                />
              </div>
              <div className="kpi-label">Chiffre d&apos;affaires</div>
              <div className="kpi-value">{formatFcfa(data.chiffreAffaires.total)}</div>
              <div className="kpi-hint dash-kpi-trend">
                {tendance.deltaPct === null ? (
                  <span>{data.chiffreAffaires.parBoutique.length} boutique(s)</span>
                ) : (
                  <span className={tendance.deltaPct >= 0 ? 'trend-up' : 'trend-down'}>
                    {tendance.deltaPct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(tendance.deltaPct).toFixed(1)} % {tendance.label}
                  </span>
                )}
              </div>
            </Link>

            <Link to="/tresorerie" className="kpi-card dash-kpi">
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
              <div className="kpi-label">Trésorerie auxiliaire</div>
              <div className="kpi-value">{formatFcfa(data.tresorerie.totalSoldesAuxiliaires)}</div>
              <div className="kpi-hint">{data.tresorerie.caisses.length} caisse(s) · grand livre</div>
            </Link>

            <Link
              to="/alertes?type=VERSEMENT_EN_RETARD"
              className={
                data.versements.enRetard24h > 0 ? 'kpi-card dash-kpi kpi-warning' : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Banknote size={16} />
                </span>
                <InfoTooltip insight={insightVersementsEnRetard(data.versements.enRetard24h)} />
              </div>
              <div className="kpi-label">Versements en retard</div>
              <div className="kpi-value">{data.versements.enRetard24h}</div>
              <div className="kpi-hint">&gt; 24 h non transmis</div>
            </Link>

            <Link
              to="/litiges"
              className={
                data.ecarts.nombreLitiges > 0 ? 'kpi-card dash-kpi kpi-danger' : 'kpi-card dash-kpi'
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
              <div className="kpi-label">Litiges / écarts</div>
              <div className="kpi-value">{data.ecarts.nombreLitiges}</div>
              <div className="kpi-hint">{formatFcfa(data.ecarts.montantEcartsAbsolus)} cumulés</div>
            </Link>

            <Link to="/clients" className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Users size={16} />
                </span>
                <InfoTooltip insight={insightClientsCrm(data.crm.nombreClients)} />
              </div>
              <div className="kpi-label">Clients CRM</div>
              <div className="kpi-value">{data.crm.nombreClients}</div>
              <div className="kpi-hint">{data.crm.parSegment.length} segment(s)</div>
            </Link>

            {margeReseau && (
              <Link
                to="/finance?tab=resultat"
                className={
                  Number(margeReseau.taux) < 0
                    ? 'kpi-card dash-kpi kpi-danger'
                    : Number(margeReseau.taux) < 15
                      ? 'kpi-card dash-kpi kpi-warning'
                      : 'kpi-card dash-kpi'
                }
              >
                <div className="dash-kpi-top">
                  <span className="dash-kpi-icon">
                    <Building2 size={16} />
                  </span>
                  <InfoTooltip
                    insight={insightMargeBrute(margeReseau.marge.toFixed(2), margeReseau.taux)}
                  />
                </div>
                <div className="kpi-label">Marge brute réseau</div>
                <div className="kpi-value">{formatFcfa(margeReseau.marge)}</div>
                <div className="kpi-hint">Taux {margeReseau.taux} %</div>
              </Link>
            )}
          </div>

          <div className="dash-layout">
            <section className="panel dash-panel-span">
              <div className="dash-panel-head">
                <h2>Évolution du CA — 30 jours</h2>
                <span className="dash-panel-meta">
                  Période affichée {formatFcfa(data.chiffreAffaires.total)}
                </span>
              </div>
              {serieChart.length === 0 ? (
                <p className="lead">Aucune vente sur les 30 derniers jours.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={serieChart}>
                    <defs>
                      <linearGradient id="caFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
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
                      contentStyle={tooltipStyle()}
                      formatter={(value) => [formatFcfa(Number(value ?? 0)), 'CA']}
                      labelFormatter={(_, payload) => String(payload?.[0]?.payload?.label ?? '')}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#0f766e"
                      strokeWidth={2}
                      fill="url(#caFill)"
                      name="CA"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="panel">
              <div className="dash-panel-head">
                <h2>CA par boutique</h2>
              </div>
              {data.chiffreAffaires.parBoutique.length === 0 ? (
                <p className="lead">Aucune vente sur la période.</p>
              ) : (
                <ul className="dash-rank">
                  {[...data.chiffreAffaires.parBoutique]
                    .sort((a, b) => Number(b.montant) - Number(a.montant))
                    .map((b, i) => (
                      <li key={b.boutiqueId}>
                        <div className="dash-rank-row">
                          <span className="dash-rank-pos">{i + 1}</span>
                          <span className="dash-rank-name">{b.nomBoutique}</span>
                          <span className="money">{formatFcfa(b.montant)}</span>
                        </div>
                        <div className="dash-bar-track">
                          <div
                            className="dash-bar-fill"
                            style={{ width: `${(Number(b.montant) / caMax) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="dash-panel-head">
                <h2>Modes de paiement</h2>
              </div>
              {modesChart.length === 0 ? (
                <p className="lead">Aucune vente sur la période.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={modesChart}
                      dataKey="montant"
                      nameKey="label"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {modesChart.map((entry, index) => (
                        <Cell
                          key={entry.modePaiement}
                          fill={COULEURS_MODES[index % COULEURS_MODES.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(value) => formatFcfa(Number(value ?? 0))}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="dash-panel-head">
              <h2>Rentabilité par boutique</h2>
              <span className="dash-panel-meta">Seuil vigilance marge &lt; 15 %</span>
            </div>
            {data.rentabiliteParBoutique.length === 0 ? (
              <p className="lead">Aucune boutique dans le périmètre.</p>
            ) : (
              <div className="table-wrap">
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Boutique</th>
                      <th className="num">CA net</th>
                      <th className="num">Coût des ventes</th>
                      <th className="num">Marge brute</th>
                      <th className="num">Taux</th>
                      <th className="num">Stock valorisé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.rentabiliteParBoutique]
                      .sort((a, b) => Number(b.margeBrute) - Number(a.margeBrute))
                      .map((r) => {
                        const margeNegative = Number(r.margeBrute) < 0;
                        const margeFaible = !margeNegative && Number(r.tauxMarge) < 15;
                        return (
                          <tr key={r.boutiqueId}>
                            <td>
                              <strong>{r.nomBoutique}</strong>{' '}
                              <InfoTooltip insight={insightMargeBrute(r.margeBrute, r.tauxMarge)} />
                            </td>
                            <td className="num">{formatFcfa(r.chiffreAffairesNet)}</td>
                            <td className="num">{formatFcfa(r.coutDesVentes)}</td>
                            <td className="num">{formatFcfa(r.margeBrute)}</td>
                            <td className="num">
                              <span
                                className={
                                  margeNegative
                                    ? 'dash-taux dash-taux-bad'
                                    : margeFaible
                                      ? 'dash-taux dash-taux-warn'
                                      : 'dash-taux dash-taux-ok'
                                }
                              >
                                {r.tauxMarge} %
                              </span>
                              {margeNegative && (
                                <span className="badge badge-critical">Négative</span>
                              )}
                              {margeFaible && (
                                <span className="badge badge-warning">Faible</span>
                              )}
                            </td>
                            <td className="num">{formatFcfa(r.valeurStock)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                  {margeReseau && (
                    <tfoot>
                      <tr>
                        <th>Total périmètre</th>
                        <th className="num">{formatFcfa(data.chiffreAffaires.total)}</th>
                        <th className="num">
                          {formatFcfa(
                            data.rentabiliteParBoutique.reduce(
                              (s, r) => s + Number(r.coutDesVentes),
                              0,
                            ),
                          )}
                        </th>
                        <th className="num">{formatFcfa(margeReseau.marge)}</th>
                        <th className="num">{margeReseau.taux} %</th>
                        <th className="num">
                          {formatFcfa(
                            data.rentabiliteParBoutique.reduce(
                              (s, r) => s + Number(r.valeurStock),
                              0,
                            ),
                          )}
                        </th>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>

          <div className="dash-layout dash-layout-3">
            <section className="panel">
              <div className="dash-panel-head">
                <h2>Pipeline versements</h2>
              </div>
              <ul className="dash-pipeline">
                {STATUT_ORDER.map((statut) => {
                  const row = data.versements.parStatut.find((s) => s.statut === statut);
                  const nombre = row?.nombre ?? 0;
                  const montant = row?.montant ?? '0';
                  return (
                    <li key={statut} className={nombre === 0 ? 'muted' : undefined}>
                      <span className={`dash-pipe-dot statut-${statut.toLowerCase()}`} />
                      <span>
                        {STATUT_LABEL[statut] ?? statut}
                        <small> · {nombre}</small>
                      </span>
                      <span className="money">{formatFcfa(montant)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel">
              <div className="dash-panel-head">
                <h2>Soldes de caisse</h2>
              </div>
              {data.tresorerie.caisses.length === 0 ? (
                <p className="lead">Aucune caisse dans le périmètre.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart
                      data={[...data.tresorerie.caisses]
                        .sort((a, b) => Number(b.solde) - Number(a.solde))
                        .slice(0, 6)
                        .map((c) => ({
                          name:
                            c.type === 'CENTRALE'
                              ? 'Centrale'
                              : `Aux. ${c.caisseId.slice(0, 4)}`,
                          solde: Number(c.solde),
                        }))}
                      layout="vertical"
                      margin={{ left: 8, right: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        formatter={(value) => formatFcfa(Number(value ?? 0))}
                      />
                      <Bar dataKey="solde" fill="#0f766e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <ul>
                    {data.tresorerie.caisses.map((c) => (
                      <li key={c.caisseId}>
                        <span>
                          {c.type === 'CENTRALE' ? 'Centrale' : 'Auxiliaire'}{' '}
                          <small style={{ color: 'var(--text-muted)' }}>{c.caisseId.slice(0, 8)}</small>
                        </span>
                        <span className="money">{formatFcfa(c.solde)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="panel">
              <div className="dash-panel-head">
                <h2>Segments clients</h2>
              </div>
              {data.crm.parSegment.length === 0 ? (
                <p className="lead">Aucun client segmenté.</p>
              ) : (
                <ul className="dash-segments">
                  {data.crm.parSegment.map((s) => {
                    const part =
                      data.crm.nombreClients > 0
                        ? (s.nombre / data.crm.nombreClients) * 100
                        : 0;
                    return (
                      <li key={s.segment}>
                        <div className="dash-rank-row">
                          <span
                            className="dash-seg-dot"
                            style={{ background: COULEURS_SEGMENTS[s.segment] ?? '#6b7280' }}
                          />
                          <span className="dash-rank-name">{s.segment}</span>
                          <span>
                            {s.nombre} <small>({part.toFixed(0)} %)</small>
                          </span>
                        </div>
                        <div className="dash-bar-track">
                          <div
                            className="dash-bar-fill"
                            style={{
                              width: `${part}%`,
                              background: COULEURS_SEGMENTS[s.segment] ?? '#6b7280',
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <nav className="dash-shortcuts" aria-label="Raccourcis">
            <Link to="/pos" className="dash-shortcut">
              <ShoppingCart size={18} />
              <span>Point de vente</span>
            </Link>
            <Link to="/transactions?enCours=1" className="dash-shortcut">
              <Banknote size={18} />
              <span>Transactions</span>
            </Link>
            <Link to="/stocks" className="dash-shortcut">
              <Package size={18} />
              <span>Stocks</span>
            </Link>
            <Link to="/clients" className="dash-shortcut">
              <Users size={18} />
              <span>Clients CRM</span>
            </Link>
            <Link to="/caisses" className="dash-shortcut">
              <Wallet size={18} />
              <span>Caisses</span>
            </Link>
            <Link to="/alertes" className="dash-shortcut">
              <AlertTriangle size={18} />
              <span>Alertes</span>
            </Link>
          </nav>
        </>
      )}
    </div>
  );
}
