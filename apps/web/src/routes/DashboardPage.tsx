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
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
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
  insightPipelineVersement,
  insightSegmentClient,
  insightSoldeCaisse,
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

type ColonneRentab =
  | 'boutique'
  | 'ca'
  | 'partCa'
  | 'cmv'
  | 'ratioCmv'
  | 'marge'
  | 'partMarge'
  | 'taux'
  | 'stock'
  | 'margeSurStock';

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
  const [openSections, setOpenSections] =
    useState<Record<DashSectionId, boolean>>(DASH_OPEN_DEFAULT);
  const [sortRentab, setSortRentab] = useState<SortState<ColonneRentab> | null>(null);
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

  const toggleSection = useCallback((id: DashSectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const expandAll = useCallback(() => {
    setOpenSections(
      Object.fromEntries(DASH_SECTIONS.map((id) => [id, true])) as Record<
        DashSectionId,
        boolean
      >,
    );
  }, []);

  const collapseAll = useCallback(() => {
    setOpenSections(
      Object.fromEntries(DASH_SECTIONS.map((id) => [id, false])) as Record<
        DashSectionId,
        boolean
      >,
    );
  }, []);

  const allOpen = DASH_SECTIONS.every((id) => openSections[id]);
  const allClosed = DASH_SECTIONS.every((id) => !openSections[id]);

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

  const rentabiliteRows = useMemo(() => {
    if (!data?.rentabiliteParBoutique.length) return [];
    const caTotal = data.rentabiliteParBoutique.reduce(
      (s, r) => s + Number(r.chiffreAffairesNet),
      0,
    );
    const margeTotal = data.rentabiliteParBoutique.reduce(
      (s, r) => s + Number(r.margeBrute),
      0,
    );
    return [...data.rentabiliteParBoutique]
      .sort((a, b) => Number(b.margeBrute) - Number(a.margeBrute))
      .map((r) => {
        const ca = Number(r.chiffreAffairesNet);
        const cmv = Number(r.coutDesVentes);
        const marge = Number(r.margeBrute);
        const stock = Number(r.valeurStock);
        return {
          ...r,
          ca,
          cmv,
          marge,
          stock,
          partCa: caTotal > 0 ? (ca / caTotal) * 100 : 0,
          partMarge: margeTotal !== 0 ? (marge / margeTotal) * 100 : 0,
          ratioCmv: ca > 0 ? (cmv / ca) * 100 : 0,
          margeSurStock: stock > 0 ? (marge / stock) * 100 : null,
          margeNegative: marge < 0,
          margeFaible: marge >= 0 && Number(r.tauxMarge) < 15,
        };
      });
  }, [data]);

  const margeReseau = useMemo(() => {
    if (!rentabiliteRows.length) return null;
    const ca = rentabiliteRows.reduce((s, r) => s + r.ca, 0);
    const marge = rentabiliteRows.reduce((s, r) => s + r.marge, 0);
    const cmv = rentabiliteRows.reduce((s, r) => s + r.cmv, 0);
    const stock = rentabiliteRows.reduce((s, r) => s + r.stock, 0);
    const vigilance = rentabiliteRows.filter(
      (r) => r.margeNegative || r.margeFaible,
    ).length;
    const meilleure = rentabiliteRows[0];
    const pire = rentabiliteRows[rentabiliteRows.length - 1];
    return {
      ca,
      marge,
      cmv,
      stock,
      taux: ca > 0 ? ((marge / ca) * 100).toFixed(1) : '0.0',
      vigilance,
      meilleure,
      pire,
    };
  }, [rentabiliteRows]);

  const rentabiliteChart = useMemo(
    () =>
      rentabiliteRows.slice(0, 8).map((r) => ({
        name:
          r.nomBoutique.length > 14
            ? `${r.nomBoutique.slice(0, 12)}…`
            : r.nomBoutique,
        fullName: r.nomBoutique,
        ca: r.ca,
        marge: r.marge,
        cmv: r.cmv,
      })),
    [rentabiliteRows],
  );

  const rentabiliteAffichee = useMemo(
    () =>
      sortRows(rentabiliteRows, sortRentab, (r, key) => {
        switch (key) {
          case 'boutique':
            return r.nomBoutique;
          case 'ca':
            return r.ca;
          case 'partCa':
            return r.partCa;
          case 'cmv':
            return r.cmv;
          case 'ratioCmv':
            return r.ratioCmv;
          case 'marge':
            return r.marge;
          case 'partMarge':
            return r.partMarge;
          case 'taux':
            return Number(r.tauxMarge);
          case 'stock':
            return r.stock;
          case 'margeSurStock':
            return r.margeSurStock;
          default:
            return null;
        }
      }),
    [rentabiliteRows, sortRentab],
  );

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
                <div className="kpi-hint">
                  Taux {margeReseau.taux} %
                  {margeReseau.vigilance > 0
                    ? ` · ${margeReseau.vigilance} vigilance`
                    : ''}
                </div>
              </Link>
            )}
          </div>

          <div className="dash-sections-bar" role="toolbar" aria-label="Sections">
            <span className="dash-sections-bar-label">Sections</span>
            <button
              type="button"
              className="btn-ghost"
              disabled={allOpen}
              onClick={expandAll}
            >
              <ChevronsUpDown size={14} /> Tout développer
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={allClosed}
              onClick={collapseAll}
            >
              <ChevronsDownUp size={14} /> Tout réduire
            </button>
          </div>

          <div className="dash-layout">
            <DashSection
              id="ca-evolution"
              className="dash-panel-span"
              title="Évolution du CA — 30 jours"
              meta={`Période affichée ${formatFcfa(data.chiffreAffaires.total)}`}
              open={openSections['ca-evolution']}
              onToggle={toggleSection}
              summary={
                <p className="dash-section-summary-line">
                  {serieChart.length} jour(s) · CA période{' '}
                  <strong className="money">{formatFcfa(data.chiffreAffaires.total)}</strong>
                  {tendance.deltaPct != null && (
                    <>
                      {' '}
                      · tendance {tendance.deltaPct >= 0 ? '+' : ''}
                      {tendance.deltaPct.toFixed(1)} %
                    </>
                  )}
                </p>
              }
            >
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
            </DashSection>

            <DashSection
              id="ca-boutiques"
              title="CA par boutique"
              meta={`${data.chiffreAffaires.parBoutique.length} magasin(s)`}
              open={openSections['ca-boutiques']}
              onToggle={toggleSection}
              summary={
                data.chiffreAffaires.parBoutique.length === 0 ? (
                  <p className="dash-section-summary-line">Aucune vente</p>
                ) : (
                  <ul className="dash-section-summary-list">
                    {[...data.chiffreAffaires.parBoutique]
                      .sort((a, b) => Number(b.montant) - Number(a.montant))
                      .slice(0, 3)
                      .map((b, i) => (
                        <li key={b.boutiqueId}>
                          <span>
                            {i + 1}. {b.nomBoutique}
                          </span>
                          <span className="money">{formatFcfa(b.montant)}</span>
                        </li>
                      ))}
                  </ul>
                )
              }
            >
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
            </DashSection>

            <DashSection
              id="modes"
              title="Modes de paiement"
              meta={`${modesChart.length} mode(s)`}
              open={openSections.modes}
              onToggle={toggleSection}
              summary={
                modesChart.length === 0 ? (
                  <p className="dash-section-summary-line">Aucune vente</p>
                ) : (
                  <ul className="dash-section-summary-list">
                    {[...modesChart]
                      .sort((a, b) => b.montant - a.montant)
                      .map((m) => (
                        <li key={m.modePaiement}>
                          <span>{m.label}</span>
                          <span className="money">{formatFcfa(m.montant)}</span>
                        </li>
                      ))}
                  </ul>
                )
              }
            >
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
            </DashSection>
          </div>

          <DashSection
            id="rentabilite"
            title="Rentabilité par boutique"
            meta={
              margeReseau
                ? `Marge ${margeReseau.taux} % · seuil vigilance < 15 %`
                : 'Seuil vigilance marge < 15 %'
            }
            open={openSections.rentabilite}
            onToggle={toggleSection}
            summary={
              !margeReseau ? (
                <p className="dash-section-summary-line">Aucune boutique</p>
              ) : (
                <div className="dash-rentab-summary">
                  <div className="dash-rentab-summary-kpis">
                    <span>
                      Marge <strong className="money">{formatFcfa(margeReseau.marge)}</strong>
                    </span>
                    <span>Taux {margeReseau.taux} %</span>
                    <span>
                      {margeReseau.vigilance > 0
                        ? `${margeReseau.vigilance} en vigilance`
                        : 'Aucune vigilance'}
                    </span>
                  </div>
                  <ul className="dash-section-summary-list">
                    {rentabiliteRows.slice(0, 3).map((r) => (
                      <li key={r.boutiqueId}>
                        <span>
                          {r.nomBoutique}
                          {r.margeNegative || r.margeFaible ? ' · !' : ''}
                        </span>
                        <span className="money">
                          {formatFcfa(r.marge)} · {r.tauxMarge} %
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
          >
            {rentabiliteRows.length === 0 ? (
              <p className="lead">Aucune boutique dans le périmètre.</p>
            ) : (
              <>
                {margeReseau && (
                  <div className="dash-rentab-kpis">
                    <article className="dash-rentab-kpi">
                      <div className="client-kpi-label">CA net</div>
                      <div className="client-kpi-value client-kpi-value-sm money">
                        {formatFcfa(margeReseau.ca)}
                      </div>
                    </article>
                    <article className="dash-rentab-kpi">
                      <div className="client-kpi-label">Coût des ventes</div>
                      <div className="client-kpi-value client-kpi-value-sm money">
                        {formatFcfa(margeReseau.cmv)}
                      </div>
                    </article>
                    <article className="dash-rentab-kpi">
                      <div className="client-kpi-label">Marge brute</div>
                      <div className="client-kpi-value client-kpi-value-sm money">
                        {formatFcfa(margeReseau.marge)}
                      </div>
                      <div className="client-kpi-hint">Taux {margeReseau.taux} %</div>
                    </article>
                    <article className="dash-rentab-kpi">
                      <div className="client-kpi-label">Stock valorisé</div>
                      <div className="client-kpi-value client-kpi-value-sm money">
                        {formatFcfa(margeReseau.stock)}
                      </div>
                    </article>
                    <article
                      className={
                        margeReseau.vigilance > 0
                          ? 'dash-rentab-kpi dash-rentab-kpi-warn'
                          : 'dash-rentab-kpi'
                      }
                    >
                      <div className="client-kpi-label">Vigilance marge</div>
                      <div className="client-kpi-value">{margeReseau.vigilance}</div>
                      <div className="client-kpi-hint">
                        boutiques &lt; 15 % ou négatives
                      </div>
                    </article>
                    <article className="dash-rentab-kpi">
                      <div className="client-kpi-label">Meilleure / plus faible</div>
                      <div className="client-kpi-hint">
                        {margeReseau.meilleure?.nomBoutique} (
                        {margeReseau.meilleure?.tauxMarge} %)
                      </div>
                      <div className="client-kpi-hint">
                        {margeReseau.pire?.nomBoutique} ({margeReseau.pire?.tauxMarge} %)
                      </div>
                    </article>
                  </div>
                )}

                {rentabiliteChart.length > 0 && (
                  <div className="dash-rentab-chart">
                    <h3 className="dash-rentab-subtitle">CA net vs marge brute</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={rentabiliteChart} margin={{ left: 4, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ef" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) => formatCompact(v)}
                          width={48}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle()}
                          formatter={(value, name) => [
                            formatFcfa(Number(value ?? 0)),
                            name === 'ca' ? 'CA net' : name === 'marge' ? 'Marge' : 'CMV',
                          ]}
                          labelFormatter={(_, payload) =>
                            String(payload?.[0]?.payload?.fullName ?? '')
                          }
                        />
                        <Legend
                          formatter={(value) =>
                            value === 'ca' ? 'CA net' : value === 'marge' ? 'Marge' : 'CMV'
                          }
                        />
                        <Bar dataKey="ca" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="marge" fill="#0f766e" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="table-wrap">
                  <table className="pl-table">
                    <thead>
                      <tr>
                        <SortHeader
                          active={sortRentab?.key === 'boutique'}
                          dir={sortRentab?.key === 'boutique' ? sortRentab.dir : 'asc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'boutique'))}
                        >
                          Boutique
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'ca'}
                          dir={sortRentab?.key === 'ca' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'ca'))}
                        >
                          CA net
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'partCa'}
                          dir={sortRentab?.key === 'partCa' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'partCa'))}
                        >
                          Part CA
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'cmv'}
                          dir={sortRentab?.key === 'cmv' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'cmv'))}
                        >
                          CMV
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'ratioCmv'}
                          dir={sortRentab?.key === 'ratioCmv' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'ratioCmv'))}
                        >
                          CMV/CA
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'marge'}
                          dir={sortRentab?.key === 'marge' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'marge'))}
                        >
                          Marge brute
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'partMarge'}
                          dir={sortRentab?.key === 'partMarge' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'partMarge'))}
                        >
                          Part marge
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'taux'}
                          dir={sortRentab?.key === 'taux' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'taux'))}
                        >
                          Taux
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'stock'}
                          dir={sortRentab?.key === 'stock' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'stock'))}
                        >
                          Stock
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortRentab?.key === 'margeSurStock'}
                          dir={sortRentab?.key === 'margeSurStock' ? sortRentab.dir : 'desc'}
                          onClick={() => setSortRentab((s) => toggleSort(s, 'margeSurStock'))}
                        >
                          Marge/stock
                        </SortHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {rentabiliteAffichee.map((r) => (
                        <tr
                          key={r.boutiqueId}
                          className={
                            r.margeNegative
                              ? 'dash-rentab-row-bad'
                              : r.margeFaible
                                ? 'dash-rentab-row-warn'
                                : undefined
                          }
                        >
                          <td>
                            <strong>{r.nomBoutique}</strong>{' '}
                            <InfoTooltip
                              insight={insightMargeBrute(r.margeBrute, r.tauxMarge)}
                            />
                          </td>
                          <td className="num">{formatFcfa(r.ca)}</td>
                          <td className="num">{r.partCa.toFixed(1)} %</td>
                          <td className="num">{formatFcfa(r.cmv)}</td>
                          <td className="num">{r.ratioCmv.toFixed(1)} %</td>
                          <td className="num">{formatFcfa(r.marge)}</td>
                          <td className="num">{r.partMarge.toFixed(1)} %</td>
                          <td className="num">
                            <span
                              className={
                                r.margeNegative
                                  ? 'dash-taux dash-taux-bad'
                                  : r.margeFaible
                                    ? 'dash-taux dash-taux-warn'
                                    : 'dash-taux dash-taux-ok'
                              }
                            >
                              {r.tauxMarge} %
                            </span>
                            {r.margeNegative && (
                              <span className="badge badge-critical">Négative</span>
                            )}
                            {r.margeFaible && (
                              <span className="badge badge-warning">Faible</span>
                            )}
                          </td>
                          <td className="num">{formatFcfa(r.stock)}</td>
                          <td className="num">
                            {r.margeSurStock == null
                              ? '—'
                              : `${r.margeSurStock.toFixed(1)} %`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {margeReseau && (
                      <tfoot>
                        <tr>
                          <th>Total périmètre</th>
                          <th className="num">{formatFcfa(margeReseau.ca)}</th>
                          <th className="num">100 %</th>
                          <th className="num">{formatFcfa(margeReseau.cmv)}</th>
                          <th className="num">
                            {margeReseau.ca > 0
                              ? `${((margeReseau.cmv / margeReseau.ca) * 100).toFixed(1)} %`
                              : '—'}
                          </th>
                          <th className="num">{formatFcfa(margeReseau.marge)}</th>
                          <th className="num">100 %</th>
                          <th className="num">{margeReseau.taux} %</th>
                          <th className="num">{formatFcfa(margeReseau.stock)}</th>
                          <th className="num">
                            {margeReseau.stock > 0
                              ? `${((margeReseau.marge / margeReseau.stock) * 100).toFixed(1)} %`
                              : '—'}
                          </th>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <p className="dash-rentab-footnote">
                  Marge = CA net − coût des ventes (CMV). Seuil de vigilance UI : taux &lt; 15 %.
                  Marge/stock = rendement de la marge sur le stock valorisé.{' '}
                  <Link to="/finance?tab=resultat">Voir le compte de résultat →</Link>
                </p>
              </>
            )}
          </DashSection>

          <div className="dash-layout dash-layout-3">
            <DashSection
              id="pipeline"
              title="Pipeline versements"
              open={openSections.pipeline}
              onToggle={toggleSection}
              summary={
                <ul className="dash-section-summary-list">
                  {STATUT_ORDER.filter((statut) => {
                    const row = data.versements.parStatut.find((s) => s.statut === statut);
                    return (row?.nombre ?? 0) > 0;
                  })
                    .slice(0, 3)
                    .map((statut) => {
                      const row = data.versements.parStatut.find((s) => s.statut === statut);
                      return (
                        <li key={statut}>
                          <span>{STATUT_LABEL[statut]}</span>
                          <span>
                            {row?.nombre ?? 0} · {formatFcfa(row?.montant ?? '0')}
                          </span>
                        </li>
                      );
                    })}
                  {data.versements.parStatut.every((s) => s.nombre === 0) && (
                    <li>
                      <span>Aucun versement actif</span>
                    </li>
                  )}
                </ul>
              }
            >
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
                      <InfoTooltip insight={insightPipelineVersement(statut, nombre, montant)} />
                    </li>
                  );
                })}
              </ul>
            </DashSection>

            <DashSection
              id="soldes"
              title="Soldes de caisse"
              meta={`${data.tresorerie.caisses.length} caisse(s)`}
              open={openSections.soldes}
              onToggle={toggleSection}
              summary={
                <p className="dash-section-summary-line">
                  Auxiliaires{' '}
                  <strong className="money">
                    {formatFcfa(data.tresorerie.totalSoldesAuxiliaires)}
                  </strong>
                  {' · '}
                  {data.tresorerie.caisses.length} caisse(s)
                </p>
              }
            >
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
                    {[...data.tresorerie.caisses]
                      .sort((a, b) => Number(b.solde) - Number(a.solde))
                      .map((c) => (
                      <li key={c.caisseId}>
                        <span>
                          {c.type === 'CENTRALE' ? 'Centrale' : 'Auxiliaire'}{' '}
                          <small style={{ color: 'var(--text-muted)' }}>{c.caisseId.slice(0, 8)}</small>
                        </span>
                        <span className="money">{formatFcfa(c.solde)}</span>
                        <InfoTooltip insight={insightSoldeCaisse(c.type, c.solde)} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DashSection>

            <DashSection
              id="segments"
              title="Segments clients"
              meta={`${data.crm.nombreClients} client(s)`}
              open={openSections.segments}
              onToggle={toggleSection}
              summary={
                data.crm.parSegment.length === 0 ? (
                  <p className="dash-section-summary-line">Aucun client segmenté</p>
                ) : (
                  <ul className="dash-section-summary-list">
                    {data.crm.parSegment.map((s) => (
                      <li key={s.segment}>
                        <span>{s.segment}</span>
                        <span>{s.nombre}</span>
                      </li>
                    ))}
                  </ul>
                )
              }
            >
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
                          <InfoTooltip
                            insight={insightSegmentClient(s.segment, s.nombre, data.crm.nombreClients)}
                          />
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
            </DashSection>
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
