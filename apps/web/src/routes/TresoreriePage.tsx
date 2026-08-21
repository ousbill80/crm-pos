import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  Clock,
  Landmark,
  Scale,
  TrendingUp,
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
import { apiFetch } from '../lib/api';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightAgeingVersements,
  insightCashConseille,
  insightLitiges,
  insightProjectionLiquidite,
  insightTresorerie,
  insightVersementsEnRetard,
} from '../lib/insights/dashboard';
import { useAuth } from '../context/AuthContext';
import { useTresorerieRealtime } from '../lib/tresorerie-realtime';
import { outboxCount } from '../lib/offline/outbox';
import type { Insight } from '../lib/insights/types';
import type { ReportingDashboard } from './DashboardPage';

interface AlerteDto {
  type: string;
  message: string;
}

interface TresoreriePilotage {
  position: {
    soldeAuxiliaires: string;
    soldeCentrale: string;
    cashConseille: string;
    versementsEnCours: string;
  };
  ageing: Array<{
    bucket: '0_24h' | '24_48h' | '48_72h' | 'plus_72h';
    nombre: number;
    montant: string;
  }>;
  courbe: Array<{
    jourOffset: number;
    date: string;
    cashBase: string;
    cashHaut: string;
    cashBas: string;
  }>;
  meta: {
    moyenneCaJournalier30j: string;
    methode: 'MOYENNE_CA_30J';
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

function insightRunway(jours: number | null, moyenneCa: string): Insight {
  if (jours === null) {
    return {
      title: 'Runway',
      interpretation:
        'Impossible à calculer : moyenne CA journalière nulle sur 30 j.',
      severity: 'neutral',
    };
  }
  return {
    title: 'Runway cash',
    interpretation: `Environ ${jours} jour(s) de cash consolidé au rythme du CA moyen (${formatFcfa(moyenneCa)}/j) — indicateur indicatif.`,
    recommendation:
      jours < 14
        ? 'Surveiller les versements en retard et accélérer le circuit vers la centrale.'
        : undefined,
    severity: jours < 14 ? 'warning' : 'ok',
  };
}

export function TresoreriePage() {
  const { user } = useAuth();
  useTresorerieRealtime(user !== null);
  const pendingOffline = outboxCount();

  const dashboard = useQuery({
    queryKey: ['reporting', 'dashboard', 'tresorerie'],
    queryFn: () => apiFetch<ReportingDashboard>('/reporting/dashboard'),
  });

  const pilotage = useQuery({
    queryKey: ['reporting', 'tresorerie-pilotage'],
    queryFn: () => apiFetch<TresoreriePilotage>('/reporting/tresorerie-pilotage'),
  });

  const alertes = useQuery({
    queryKey: ['alertes', 'tresorerie'],
    queryFn: () => apiFetch<AlerteDto[]>('/alertes'),
  });

  const data = dashboard.data;
  const pilot = pilotage.data;
  const alertesTreso = (alertes.data ?? []).filter(
    (a) =>
      a.type === 'ECART_CAISSE' ||
      a.type === 'VERSEMENT_EN_RETARD' ||
      a.type === 'ACCES_REFUSE',
  );

  const courbeChart = (pilot?.courbe ?? []).map((p) => ({
    jour: `J+${p.jourOffset}`,
    date: p.date,
    Projection: Number(p.cashBase),
  }));

  const ageingChart = (pilot?.ageing ?? []).map((a) => ({
    bucket: AGEING_LABELS[a.bucket] ?? a.bucket,
    key: a.bucket,
    nombre: a.nombre,
    montant: Number(a.montant),
  }));

  const proj7 = pilot?.courbe[7];
  const proj30 = pilot?.courbe[30];
  const moyenneCa = Number(pilot?.meta.moyenneCaJournalier30j ?? 0);
  const cash = Number(pilot?.position.cashConseille ?? 0);
  const runwayJours = moyenneCa > 0 ? Math.floor(cash / moyenneCa) : null;

  const loading = dashboard.isLoading || pilotage.isLoading;
  const error = dashboard.isError || pilotage.isError;

  const nbLitiges = data?.ecarts.nombreLitiges ?? 0;
  const nbRetards = data?.versements.enRetard24h ?? 0;
  const santeOk = nbLitiges === 0 && nbRetards === 0 && alertesTreso.length === 0;

  return (
    <div className="treso-module">
      <PageHeader
        title="Trésorerie"
        subtitle="Cash consolidé & projection indicative — grand livre append-only"
        actions={
          <nav className="circuit-nav" aria-label="Circuit trésorerie">
            <Link className="circuit-nav-item" to="/transactions?enCours=1">
              <ArrowRightLeft size={14} /> En cours
            </Link>
            <Link className="circuit-nav-item" to="/litiges">
              <Scale size={14} /> Litiges
              {nbLitiges > 0 ? (
                <span className="circuit-nav-count">{nbLitiges}</span>
              ) : null}
            </Link>
            <Link className="circuit-nav-item circuit-nav-primary" to="/caisses">
              <Landmark size={14} /> Caisses
            </Link>
          </nav>
        }
      />

      {data && (
        <section
          className={`dash-sante ${santeOk ? 'dash-sante-ok' : nbLitiges > 0 ? 'dash-sante-critical' : 'dash-sante-warning'}`}
          aria-label="Santé trésorerie"
        >
          <div className="dash-sante-main">
            <span className="dash-sante-badge">
              {santeOk ? 'Sain' : nbLitiges > 0 ? 'Litiges ouverts' : 'Vigilance'}
            </span>
            <p>
              {nbLitiges} litige(s) · {nbRetards} versement(s) &gt; 24 h
              {pendingOffline > 0
                ? ` · ${pendingOffline} opération(s) hors-ligne en file`
                : ''}
              {data.genereAt
                ? ` · actualisé ${new Date(data.genereAt).toLocaleString('fr-FR')}`
                : ''}
            </p>
          </div>
          <div className="dash-sante-meta treso-sante-links">
            {!santeOk && nbLitiges > 0 ? <Link to="/litiges">Traiter litiges</Link> : null}
            {nbRetards > 0 ? (
              <Link to="/transactions?enCours=1">Circuit en cours</Link>
            ) : null}
            <Link to="/caisses">Voir caisses</Link>
          </div>
        </section>
      )}

      {loading && <LoadingState label="Chargement du pilotage trésorerie..." />}
      {error && <p role="alert">Impossible de charger le pilotage trésorerie.</p>}

      {pilot && data && (
        <>
          <div className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Wallet size={16} />
                </span>
                <InfoTooltip insight={insightCashConseille(pilot.position.cashConseille)} />
              </div>
              <div className="kpi-label">Cash consolidé</div>
              <div className="kpi-value money">
                {formatFcfa(pilot.position.cashConseille)}
              </div>
              <div className="kpi-hint">Magasins / tiroirs + centrale</div>
            </article>

            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Banknote size={16} />
                </span>
                <InfoTooltip
                  insight={insightTresorerie(
                    pilot.position.soldeAuxiliaires,
                    data.tresorerie.caisses.filter((c) => c.type === 'MAGASIN')
                      .length,
                  )}
                />
              </div>
              <div className="kpi-label">Magasins / tiroirs</div>
              <div className="kpi-value money">
                {formatFcfa(pilot.position.soldeAuxiliaires)}
              </div>
              <div className="kpi-hint">Cash boutiques</div>
            </article>

            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Landmark size={16} />
                </span>
              </div>
              <div className="kpi-label">Centrale</div>
              <div className="kpi-value money">
                {formatFcfa(pilot.position.soldeCentrale)}
              </div>
              <div className="kpi-hint">Contreparties validées</div>
            </article>

            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <TrendingUp size={16} />
                </span>
              </div>
              <div className="kpi-label">En cours</div>
              <div className="kpi-value money">
                {formatFcfa(pilot.position.versementsEnCours)}
              </div>
              <div className="kpi-hint">
                <Link to="/transactions?enCours=1">Voir le circuit</Link>
              </div>
            </article>
          </div>

          <div className="kpi-grid dash-kpi-grid">
            <article
              className={
                runwayJours !== null && runwayJours < 14
                  ? 'kpi-card dash-kpi kpi-warning'
                  : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Clock size={16} />
                </span>
                <InfoTooltip
                  insight={insightRunway(
                    runwayJours,
                    pilot.meta.moyenneCaJournalier30j,
                  )}
                />
              </div>
              <div className="kpi-label">Runway</div>
              <div className="kpi-value">
                {runwayJours === null ? '—' : `${runwayJours} j`}
              </div>
              <div className="kpi-hint">Cash ÷ CA moyen / j</div>
            </article>
            {proj7 && (
              <article className="kpi-card dash-kpi">
                <div className="dash-kpi-top">
                  <InfoTooltip
                    insight={insightProjectionLiquidite(
                      'J+7',
                      proj7.cashBase,
                      pilot.meta.moyenneCaJournalier30j,
                    )}
                  />
                </div>
                <div className="kpi-label">Projection J+7</div>
                <div className="kpi-value money">{formatFcfa(proj7.cashBase)}</div>
                <div className="kpi-hint">Indicative</div>
              </article>
            )}
            {proj30 && (
              <article className="kpi-card dash-kpi">
                <div className="dash-kpi-top">
                  <InfoTooltip
                    insight={insightProjectionLiquidite(
                      'J+30',
                      proj30.cashBase,
                      pilot.meta.moyenneCaJournalier30j,
                    )}
                  />
                </div>
                <div className="kpi-label">Projection J+30</div>
                <div className="kpi-value money">{formatFcfa(proj30.cashBase)}</div>
                <div className="kpi-hint">
                  CA moy. {formatFcfa(pilot.meta.moyenneCaJournalier30j)}/j
                </div>
              </article>
            )}
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
              <div className="kpi-hint">
                <Link to="/litiges">Traiter les litiges</Link>
                {' · '}
                <span className="money">
                  Écarts abs. {data.ecarts.montantEcartsAbsolus} FCFA
                </span>
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
              <div className="kpi-hint">
                <Link to="/transactions?enCours=1">Voir le circuit</Link>
              </div>
            </article>
          </div>

          <div className="panel-grid-2">
            <ListPanel title="Courbe de liquidité 30 j">
              <p className="lead">
                Projection indicative = cash consolidé + moyenne CA 30 j × horizon.
                Pas un solde comptable.
              </p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <AreaChart data={courbeChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="jour" tick={{ fontSize: 11 }} interval={4} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        `${(v / 1000).toFixed(0)}k`
                      }
                    />
                    <Tooltip
                      formatter={(value) =>
                        formatFcfa(typeof value === 'number' ? value : Number(value))
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="Projection"
                      stroke="#0f766e"
                      fill="#0f766e"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ListPanel>

            <ListPanel title="Ageing des versements en cours">
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={ageingChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === 'montant'
                          ? formatFcfa(typeof value === 'number' ? value : Number(value))
                          : value
                      }
                    />
                    <Bar dataKey="nombre" name="Nombre" fill="#017E84" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Nb</th>
                    <th>Montant</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pilot.ageing.map((a) => (
                    <tr key={a.bucket}>
                      <td>
                        {AGEING_LABELS[a.bucket]}{' '}
                        <InfoTooltip
                          insight={insightAgeingVersements(a.bucket, a.nombre)}
                        />
                      </td>
                      <td>{a.nombre}</td>
                      <td className="money">{formatFcfa(a.montant)}</td>
                      <td>
                        <Link to={`/transactions?enCours=1&ageing=${a.bucket}`}>
                          Voir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="lead">
                <Link to="/transactions?enCours=1">
                  Toutes les transactions en cours <ArrowRight size={14} />
                </Link>
              </p>
            </ListPanel>
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
                </tbody>
              </table>
            </ListPanel>

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
          </div>
        </>
      )}
    </div>
  );
}
