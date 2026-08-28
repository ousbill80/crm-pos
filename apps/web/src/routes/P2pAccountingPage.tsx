import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, Printer, Scale } from 'lucide-react';
import { menuAutorise, type RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { fmtDate, fmtFcfa } from '../lib/achats-ui';
import {
  agingBucket,
  agingTotals,
  balanceTotals,
  CLASSES_SYSCOHADA,
  classeSyscohada,
  daysOverdue,
  emptyAgingCopy,
  groupBalanceByClasse,
  groupLedger,
  ledgerTotals,
  moneyClass,
  type AgingBucket,
} from '../lib/compta-reports';
import {
  insightAgeeBucket,
  insightAgeeEncours,
  insightBalanceGenerale,
  insightGrandLivre,
  insightPeriodeComptable,
} from '../lib/insights/compta';
import {
  hasP2pRole,
  JOURNAL_TYPE_COMPTE,
  JOURNAL_TYPE_HINTS,
  JOURNAL_TYPE_JOURNAL,
  JOURNAL_TYPE_LABELS,
  JOURNAL_TYPES,
  journalActifPourType,
  p2pApi,
  SOURCE_COMPTABLE_LABELS,
  type AccountingJournal,
  type AgingRow,
  type BalanceRow,
  type JournalComptableType,
  type LedgerRow,
} from '../lib/p2p';
import type { SocieteDto } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { MajorBrandMark } from '../components/MajorBrandMark';
import { InfoTooltip } from '../components/InfoTooltip';
import { ComptaJournauxPanel } from './ComptaJournauxPanel';
import {
  ComptaBanquePanel,
  ComptaPaiementsPanel,
  ComptaPeriodesPanel,
} from './ComptaOpsPanels';
import {
  ComptaEtatsPanel,
  ComptaChargesPanel,
  ComptaFilePanel,
  ComptaOdPanel,
  ComptaPlanPanel,
  ComptaTvaPanel,
  ComptaLettragePanel,
} from './ComptaGlPanels';
import { ComptaImmosPanel, ComptaLiassePanel } from './ComptaLiasseImmosPanels';

type Report =
  | 'balance'
  | 'grand-livre'
  | 'balance-agee-fournisseurs'
  | 'balance-agee-clients'
  | 'journaux'
  | 'plan'
  | 'od'
  | 'charges'
  | 'bilan'
  | 'tva'
  | 'liasse'
  | 'immos'
  | 'file'
  | 'paiements'
  | 'periodes'
  | 'banque'
  | 'lettrage';

const ALIASES: Record<string, Report> = {
  'plan-comptes': 'plan',
  etats: 'bilan',
};

const REPORTS: Report[] = [
  'journaux',
  'od',
  'charges',
  'file',
  'banque',
  'balance-agee-fournisseurs',
  'balance-agee-clients',
  'paiements',
  'lettrage',
  'balance',
  'grand-livre',
  'bilan',
  'tva',
  'liasse',
  'immos',
  'plan',
  'periodes',
];

const NAV_GROUPS: { label: string; items: Report[] }[] = [
  { label: 'Saisie', items: ['journaux', 'od', 'charges', 'file', 'banque'] },
  { label: 'Tiers', items: ['balance-agee-fournisseurs', 'balance-agee-clients', 'paiements', 'lettrage'] },
  { label: 'Rapports', items: ['balance', 'grand-livre', 'bilan', 'tva', 'liasse'] },
  { label: 'Paramètres', items: ['plan', 'periodes', 'immos'] },
];

const NAV_LABELS: Record<Report, string> = {
  balance: 'Balance',
  journaux: 'Journaux',
  'grand-livre': 'Grand livre',
  plan: 'Plan de comptes',
  od: 'Saisie OD',
  charges: 'Charges 6xx',
  bilan: 'Bilan',
  tva: 'TVA',
  liasse: 'Liasse',
  immos: 'Immos',
  'balance-agee-fournisseurs': 'Âgée 401',
  'balance-agee-clients': 'Âgée 411',
  file: 'File',
  paiements: 'Paiements',
  banque: 'Banque',
  periodes: 'Périodes',
  lettrage: 'Lettrage',
};

const REPORT_TITLES: Record<Report, string> = {
  balance: 'Balance générale',
  'grand-livre': 'Grand livre',
  'balance-agee-fournisseurs': 'Balance âgée fournisseurs (401)',
  'balance-agee-clients': 'Balance âgée clients (411)',
  journaux: 'Journaux comptables',
  plan: 'Plan de comptes',
  od: 'Opérations diverses',
  charges: 'Factures de charge (6xx)',
  bilan: 'Bilan et compte de résultat',
  tva: 'État TVA',
  liasse: 'Liasse SYSCOHADA',
  immos: 'Immobilisations',
  file: 'File d’écritures',
  paiements: 'Propositions de paiement',
  periodes: 'Périodes et clôture',
  banque: 'Rapprochement bancaire',
  lettrage: 'Lettrage 401 / 411',
};

function journalHint(type: JournalComptableType, items: AccountingJournal[] | undefined) {
  const journal = journalActifPourType(items, type);
  if (!journal) return JOURNAL_TYPE_HINTS[type];
  const n = journal._count.ecritures;
  return `${JOURNAL_TYPE_HINTS[type]} · ${journal.code} · ${n} pièce${n > 1 ? 's' : ''}`;
}

const TABLE_REPORTS: Report[] = [
  'balance',
  'grand-livre',
  'balance-agee-fournisseurs',
  'balance-agee-clients',
];

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseReport(raw: string | null): Report {
  const mapped = raw ? (ALIASES[raw] ?? raw) : 'balance';
  return REPORTS.includes(mapped as Report) ? (mapped as Report) : 'balance';
}

function isoDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function periodDay(iso: string) {
  return iso.slice(0, 10);
}

function isoFromParts(y: number, m: number, d: number) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function applyDatePreset(kind: 'mois' | 'trimestre' | 'ytd' | 'annee'): { du: string; au: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (kind === 'mois') {
    return { du: isoFromParts(y, m, 1), au: isoFromParts(y, m, lastDayOfMonth(y, m)) };
  }
  if (kind === 'trimestre') {
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    const qEnd = qStart + 2;
    return {
      du: isoFromParts(y, qStart, 1),
      au: isoFromParts(y, qEnd, lastDayOfMonth(y, qEnd)),
    };
  }
  if (kind === 'ytd') {
    return { du: isoFromParts(y, 1, 1), au: isoDate() };
  }
  return { du: isoFromParts(y, 1, 1), au: isoFromParts(y, 12, 31) };
}

const AGING_BUCKETS: Array<{ key: AgingBucket; label: string }> = [
  { key: 'current', label: 'Non échu' },
  { key: 'd30', label: '0–30 j' },
  { key: 'd60', label: '31–60 j' },
  { key: 'd90', label: '61–90 j' },
  { key: 'd90p', label: '+90 j' },
];

function labelSourceComptable(sourceType: string): string {
  return SOURCE_COMPTABLE_LABELS[sourceType] ?? sourceType.replaceAll('_', ' ');
}

function ComptaPiecesMenu({
  role,
  societeId,
  onOpenJournal,
  onOpenJournaux,
}: {
  role?: RoleLibelle;
  societeId?: string;
  onOpenJournal: (journalId: string) => void;
  onOpenJournaux: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const peutFacturesAchat = role ? menuAutorise(role, 'purchase', '/achats/factures') : false;
  const journals = useQuery({
    queryKey: ['p2p-journals', societeId],
    queryFn: () => p2pApi.journals(societeId!),
    enabled: Boolean(societeId),
  });

  function closeMenu() {
    detailsRef.current?.removeAttribute('open');
  }

  function openType(type: JournalComptableType) {
    closeMenu();
    const journal = journalActifPourType(journals.data?.items, type);
    if (journal) onOpenJournal(journal.id);
    else onOpenJournaux();
  }

  return (
    <details ref={detailsRef} className="compta-factures-menu">
      <summary className="btn btn-secondary">Pièces</summary>
      <div className="compta-factures-menu-panel" role="menu">
        <p className="compta-pieces-group">Achats · {JOURNAL_TYPE_COMPTE.ACHATS}</p>
        {peutFacturesAchat && (
          <Link to="/achats/factures" role="menuitem" onClick={closeMenu}>
            <strong>Factures d’achat</strong>
            <span>Pièces fournisseurs, matching commande / réception, journal des achats.</span>
          </Link>
        )}
        <Link
          to="/finance/comptabilite?rapport=charges"
          role="menuitem"
          onClick={closeMenu}
        >
          <strong>Factures de charge 6xx</strong>
          <span>Loyers, transport, honoraires — hors marchandises, puis journal des achats.</span>
        </Link>
        <button type="button" role="menuitem" onClick={() => openType('ACHATS')}>
          <strong>{JOURNAL_TYPE_JOURNAL.ACHATS}</strong>
          <span>{journalHint('ACHATS', journals.data?.items)}</span>
        </button>
        <p className="compta-pieces-group">Ventes · {JOURNAL_TYPE_COMPTE.VENTES}</p>
        <button type="button" role="menuitem" onClick={() => openType('VENTES')}>
          <strong>{JOURNAL_TYPE_JOURNAL.VENTES}</strong>
          <span>{journalHint('VENTES', journals.data?.items)}</span>
        </button>
        <p className="compta-pieces-group">Trésorerie</p>
        <button type="button" role="menuitem" onClick={() => openType('CAISSE')}>
          <strong>{JOURNAL_TYPE_JOURNAL.CAISSE}</strong>
          <span>{journalHint('CAISSE', journals.data?.items)}</span>
        </button>
        <button type="button" role="menuitem" onClick={() => openType('BANQUE')}>
          <strong>{JOURNAL_TYPE_JOURNAL.BANQUE}</strong>
          <span>{journalHint('BANQUE', journals.data?.items)}</span>
        </button>
        <p className="compta-pieces-group">OD · {JOURNAL_TYPE_COMPTE.OPERATIONS_DIVERSES}</p>
        <Link to="/finance/comptabilite?rapport=od" role="menuitem" onClick={closeMenu}>
          <strong>Saisie OD</strong>
          <span>Écriture manuelle multi-lignes sur le journal des opérations diverses.</span>
        </Link>
        <button type="button" role="menuitem" onClick={() => openType('OPERATIONS_DIVERSES')}>
          <strong>{JOURNAL_TYPE_JOURNAL.OPERATIONS_DIVERSES}</strong>
          <span>{journalHint('OPERATIONS_DIVERSES', journals.data?.items)}</span>
        </button>
        <p className="compta-pieces-note">
          Un ticket POS et une commande web payée sont comptabilisés au journal des ventes (411 /
          701 / 4457). Le journal de caisse reste le circuit d’encaissement boutique.
        </p>
      </div>
    </details>
  );
}

export function P2pAccountingPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const report = parseReport(params.get('rapport'));
  const journalId = params.get('journal') ?? '';
  const peutLire = hasP2pRole(user?.role, 'comptabiliteLecture');
  const [du, setDu] = useState(`${new Date().getFullYear()}-01-01`);
  const [au, setAu] = useState(isoDate());
  const societe = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
    enabled: peutLire,
  });
  const tableReport = TABLE_REPORTS.includes(report);
  const datedReport =
    tableReport || report === 'bilan' || report === 'tva' || report === 'liasse';
  const balance = useQuery<BalanceRow[] | LedgerRow[] | AgingRow[]>({
    queryKey: ['p2p-report', report, societe.data?.id, du, au, journalId],
    queryFn: () => {
      const id = societe.data!.id;
      if (report === 'balance') return p2pApi.report<BalanceRow[]>(report, id, du, au);
      if (report === 'grand-livre') {
        return p2pApi.report<LedgerRow[]>(report, id, du, au, journalId || undefined);
      }
      if (report === 'balance-agee-clients') {
        return p2pApi.report<AgingRow[]>('balance-agee-clients', id, du, au);
      }
      return p2pApi.report<AgingRow[]>('balance-agee-fournisseurs', id, du, au);
    },
    enabled: peutLire && Boolean(societe.data?.id) && tableReport,
  });
  const periods = useQuery({
    queryKey: ['p2p-periods', societe.data?.id],
    queryFn: () => p2pApi.periods(societe.data!.id),
    enabled: peutLire && Boolean(societe.data?.id) && datedReport,
  });
  const journals = useQuery({
    queryKey: ['p2p-journals', societe.data?.id],
    queryFn: () => p2pApi.journals(societe.data!.id),
    enabled: peutLire && Boolean(societe.data?.id) && report === 'grand-livre',
  });
  const postingQueue = useQuery({
    queryKey: ['p2p-file', societe.data?.id],
    queryFn: () => p2pApi.postingQueue(societe.data!.id),
    enabled: peutLire && Boolean(societe.data?.id),
  });
  const journalFiltre = journals.data?.items.find((row) => row.id === journalId);
  const selectedPeriodId = useMemo(
    () =>
      periods.data?.find((row) => periodDay(row.dateDebut) === du && periodDay(row.dateFin) === au)
        ?.id ?? '',
    [periods.data, du, au],
  );
  const totals = useMemo(() => {
    if (!balance.data) {
      return {
        debit: 0,
        credit: 0,
        due: 0,
        overdue: 0,
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        d90p: 0,
      };
    }
    if (report === 'balance') {
      return { ...balanceTotals(balance.data as BalanceRow[]), due: 0, overdue: 0, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
    }
    if (report === 'grand-livre') {
      return { ...ledgerTotals(balance.data as LedgerRow[]), due: 0, overdue: 0, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
    }
    const aging = agingTotals(balance.data as AgingRow[], au);
    const overdue = aging.d30 + aging.d60 + aging.d90 + aging.d90p;
    return { debit: 0, credit: 0, ...aging, overdue };
  }, [balance.data, report, au]);

  const agingKind = report === 'balance-agee-clients' ? '411' : '401';
  if (!peutLire) return <p role="alert">Vous n’avez pas accès à la comptabilité.</p>;

  if (societe.isError) {
    return <p role="alert">Impossible de charger la fiche société : la comptabilité ne peut pas s’ouvrir.</p>;
  }

  const filePending = (postingQueue.data ?? []).filter(
    (row) => row.statut === 'EN_ATTENTE' || row.statut === 'ERREUR',
  ).length;
  const reportTitle = REPORT_TITLES[report] ?? REPORT_TITLES.balance;
  const balanced = Math.abs(totals.debit - totals.credit) < 0.01;
  const agingReport =
    report === 'balance-agee-fournisseurs' || report === 'balance-agee-clients';

  return (
    <div className="p2p-module compta-app">
      <div className="compta-print-head" aria-hidden="true">
        <MajorBrandMark variant="doc" />
        <h1>{reportTitle}</h1>
        <p>
          {societe.data?.raisonSociale ?? '—'} · {fmtDate(du)} – {fmtDate(au)}
          {selectedPeriodId
            ? ` · période ${periods.data?.find((row) => row.id === selectedPeriodId)?.code ?? ''}`
            : ''}
        </p>
      </div>
      <div className="no-print">
        <PageHeader
          title="Comptabilité"
          subtitle="SYSCOHADA : journaux Achats, Ventes, Caisse, Banque et OD. Grand livre append-only — une écriture validée ne s’édite pas."
          actions={
            <>
              <ComptaPiecesMenu
                key={`${report}-${journalId}`}
                role={user?.role}
                societeId={societe.data?.id}
                onOpenJournal={(id) => setParams({ rapport: 'grand-livre', journal: id })}
                onOpenJournaux={() => setParams({ rapport: 'journaux' })}
              />
              <Link className="btn btn-secondary" to="/finance/accounting-ai">Comptabilité intelligente</Link>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                <Printer size={16} /> Imprimer
              </button>
            </>
          }
        />
        <p className="compta-norme" role="note">
          Une <strong>facture</strong> est une pièce d’achat (journal des achats, compte 401).
          Un <strong>ticket POS</strong> et une <strong>commande web payée</strong> passent au
          journal des ventes (411 / 701 / 4457). Les encaissements boutique restent sur le journal
          de caisse (571). Les marchandises suivent l’inventaire permanent : mise en stock
          31 / 408, facture 408 / 401, ventes CMV 603 / 31.
        </p>
      </div>
      <nav className="p2p-subnav no-print" aria-label="Rapports comptables">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="p2p-subnav-group">
            <span className="p2p-subnav-group-label">{group.label}</span>
            {group.items.map((item) => (
              <button
                key={item}
                type="button"
                className={report === item ? 'actif' : undefined}
                onClick={() => setParams({ rapport: item })}
              >
                {NAV_LABELS[item]}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {filePending > 0 && (
        <p className="compta-why no-print" role="status">
          {filePending} pièce(s) en file (période fermée, mapping manquant, ou tickets
          non encore repris).{' '}
          <Link to="/finance/comptabilite?rapport=file">Ouvrir la file</Link>
          {hasP2pRole(user?.role, 'comptabiliteEcriture')
            ? ' — le RAF peut rattraper les ventes POS et rejouer la file.'
            : ''}
        </p>
      )}
      {datedReport && (
        <div className="panel p2p-section no-print compta-period-bar">
          <div className="compta-period-bar-head">
            <strong>
              Période <InfoTooltip insight={insightPeriodeComptable()} />
            </strong>
            <nav className="compta-journal-chips" aria-label="Raccourcis de période">
              {(
                [
                  ['mois', 'Mois'],
                  ['trimestre', 'Trimestre'],
                  ['ytd', 'YTD'],
                  ['annee', 'Année'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    const next = applyDatePreset(kind);
                    setDu(next.du);
                    setAu(next.au);
                  }}
                >
                  {label}
                </button>
              ))}
              {(periods.data ?? [])
                .filter((row) => !row.cloture)
                .slice(0, 4)
                .map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={selectedPeriodId === row.id ? 'actif' : undefined}
                    onClick={() => {
                      setDu(periodDay(row.dateDebut));
                      setAu(periodDay(row.dateFin));
                    }}
                  >
                    {row.code}
                  </button>
                ))}
            </nav>
          </div>
          <div className="p2p-inline-fields">
            <label>
              Calendrier
              <select
                aria-label="Période comptable"
                value={selectedPeriodId}
                onChange={(event) => {
                  const row = periods.data?.find((item) => item.id === event.target.value);
                  if (!row) return;
                  setDu(periodDay(row.dateDebut));
                  setAu(periodDay(row.dateFin));
                }}
              >
                <option value="">Personnalisée</option>
                {(periods.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {fmtDate(row.dateDebut)} – {fmtDate(row.dateFin)}
                    {row.cloture ? ' (clôturée)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Du
              <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
            </label>
            <label>
              Au
              <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
            </label>
            {journalId && (
              <button type="button" onClick={() => setParams({ rapport: 'grand-livre' })}>
                Tous les journaux
              </button>
            )}
            {societe.data && datedReport && (
              <button
                type="button"
                onClick={() => {
                  void p2pApi.exportEcritures(societe.data!.id, du, au).then((payload) => {
                    const rows = payload.rows;
                    if (!rows.length) return;
                    const headers = Object.keys(rows[0]);
                    const csv = [
                      headers.join(';'),
                      ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(';')),
                    ].join('\n');
                    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `grand-livre-${du}-${au}.csv`;
                    link.click();
                  });
                }}
              >
                Exporter le grand livre
              </button>
            )}
          </div>
        </div>
      )}
      {tableReport && (
        <section className="kpi-grid dash-kpi-grid no-print">
          {agingReport ? (
            <>
              <article className="kpi-card dash-kpi">
                <Scale size={16} />
                <div className="kpi-label">
                  Encours {agingKind}{' '}
                  <InfoTooltip
                    insight={insightAgeeEncours(agingKind, totals.due, totals.overdue)}
                  />
                </div>
                <div className="kpi-value">{fmtFcfa(totals.due)}</div>
                <div className="kpi-hint">
                  {totals.overdue > 0.01
                    ? `dont ${fmtFcfa(totals.overdue)} échu`
                    : 'Non soldé à la date de fin'}
                </div>
              </article>
              {AGING_BUCKETS.map((bucket) => (
                <article key={bucket.key} className="kpi-card dash-kpi">
                  <AlertTriangle size={16} />
                  <div className="kpi-label">
                    {bucket.label}{' '}
                    <InfoTooltip insight={insightAgeeBucket(bucket.key, totals[bucket.key])} />
                  </div>
                  <div className="kpi-value">{fmtFcfa(totals[bucket.key])}</div>
                  <div className="kpi-hint">Tranche d’âge</div>
                </article>
              ))}
            </>
          ) : (
            <>
              <article className="kpi-card dash-kpi">
                <Scale size={16} />
                <div className="kpi-label">
                  Débits{' '}
                  {report === 'balance' ? (
                    <InfoTooltip insight={insightBalanceGenerale(totals.debit, totals.credit)} />
                  ) : (
                    <InfoTooltip insight={insightGrandLivre()} />
                  )}
                </div>
                <div className="kpi-value">{fmtFcfa(totals.debit)}</div>
                <div className="kpi-hint">Période sélectionnée</div>
              </article>
              <article className="kpi-card dash-kpi">
                <BookOpen size={16} />
                <div className="kpi-label">
                  Crédits <InfoTooltip insight={insightBalanceGenerale(totals.debit, totals.credit)} />
                </div>
                <div className="kpi-value">{fmtFcfa(totals.credit)}</div>
                <div className="kpi-hint">{balanced ? 'Balance équilibrée' : 'Écart à contrôler'}</div>
              </article>
              <article className="kpi-card dash-kpi">
                <AlertTriangle size={16} />
                <div className="kpi-label">Écart</div>
                <div className="kpi-value">{fmtFcfa(Math.abs(totals.debit - totals.credit))}</div>
                <div className="kpi-hint">
                  {balanced ? (
                    <span className="badge badge-ok">OK</span>
                  ) : (
                    <span className="badge badge-warning">À contrôler</span>
                  )}
                </div>
              </article>
              <article className="kpi-card dash-kpi">
                <div className="kpi-label">Lignes</div>
                <div className="kpi-value">{balance.data?.length ?? 0}</div>
                <div className="kpi-hint">
                  {report === 'balance' ? 'Comptes mouvementés' : 'Mouvements affichés'}
                </div>
              </article>
            </>
          )}
        </section>
      )}

      {report === 'journaux' && societe.data && (
        <ComptaJournauxPanel
          societeId={societe.data.id}
          onOpenJournal={(id) => setParams({ rapport: 'grand-livre', journal: id })}
        />
      )}
      {report === 'plan' && societe.data && (
        <ComptaPlanPanel societeId={societe.data.id} role={user?.role} />
      )}
      {report === 'od' && societe.data && (
        <ComptaOdPanel societe={societe.data} role={user?.role} />
      )}
      {report === 'charges' && societe.data && (
        <ComptaChargesPanel societe={societe.data} role={user?.role} />
      )}
      {report === 'bilan' && societe.data && (
        <ComptaEtatsPanel societeId={societe.data.id} du={du} au={au} />
      )}
      {report === 'tva' && societe.data && (
        <ComptaTvaPanel societeId={societe.data.id} du={du} au={au} />
      )}
      {report === 'liasse' && societe.data && (
        <ComptaLiassePanel societeId={societe.data.id} du={du} au={au} />
      )}
      {report === 'immos' && societe.data && (
        <ComptaImmosPanel societe={societe.data} role={user?.role} />
      )}
      {report === 'file' && societe.data && (
        <ComptaFilePanel societeId={societe.data.id} role={user?.role} />
      )}
      {report === 'paiements' && (
        <ComptaPaiementsPanel societe={societe.data} role={user?.role} />
      )}
      {report === 'periodes' && societe.data && (
        <ComptaPeriodesPanel societeId={societe.data.id} role={user?.role} />
      )}
      {report === 'banque' && (
        <ComptaBanquePanel societe={societe.data} role={user?.role} />
      )}
      {report === 'lettrage' && societe.data && (
        <ComptaLettragePanel societeId={societe.data.id} role={user?.role} />
      )}

      {tableReport && (
        <section className="panel p2p-section compta-report">
          <div className="dash-panel-head">
            <div>
              <h2>
                {reportTitle}{' '}
                {report === 'balance' && (
                  <InfoTooltip insight={insightBalanceGenerale(totals.debit, totals.credit)} />
                )}
                {report === 'grand-livre' && <InfoTooltip insight={insightGrandLivre()} />}
                {agingReport && (
                  <InfoTooltip
                    insight={insightAgeeEncours(agingKind, totals.due, totals.overdue)}
                  />
                )}
              </h2>
              <p className="lead">
                {societe.data?.raisonSociale ?? 'Chargement de la société…'} · {fmtDate(du)} – {fmtDate(au)}
                {journalFiltre && report === 'grand-livre'
                  ? ` · journal ${journalFiltre.code} (${JOURNAL_TYPE_LABELS[journalFiltre.type]})`
                  : ''}
              </p>
            </div>
          </div>
          {balance.isLoading && <LoadingState label="Chargement du rapport…" />}
          {balance.isError && <p role="alert">Le rapport comptable n’a pas pu être chargé.</p>}
          {report === 'grand-livre' && (
            <nav className="compta-journal-chips" aria-label="Filtrer le grand livre par journal">
              <button
                type="button"
                className={!journalId ? 'actif' : undefined}
                onClick={() => setParams({ rapport: 'grand-livre' })}
              >
                Tous
              </button>
              {JOURNAL_TYPES.map((type) => {
                const journal = journalActifPourType(journals.data?.items, type);
                const n = journal?._count.ecritures ?? 0;
                return (
                  <button
                    key={type}
                    type="button"
                    className={journal && journalId === journal.id ? 'actif' : undefined}
                    disabled={!journal}
                    onClick={() => {
                      if (journal) setParams({ rapport: 'grand-livre', journal: journal.id });
                    }}
                  >
                    {JOURNAL_TYPE_LABELS[type]}
                    {journal ? ` · ${n}` : ''}
                  </button>
                );
              })}
            </nav>
          )}
          {balance.data && balance.data.length === 0 && report === 'balance-agee-clients' && (
            <EmptyState {...emptyAgingCopy('clients')} />
          )}
          {balance.data && balance.data.length === 0 && report === 'balance-agee-fournisseurs' && (
            <EmptyState {...emptyAgingCopy('fournisseurs')} />
          )}
          {balance.data && balance.data.length === 0 && report === 'grand-livre' && (
            <EmptyState
              title={journalFiltre ? `Aucune écriture · ${journalFiltre.code}` : 'Aucune écriture'}
              description={
                journalFiltre
                  ? `Le journal ${JOURNAL_TYPE_LABELS[journalFiltre.type]} n’a pas de mouvement sur cette période.`
                  : 'Aucune écriture comptable sur cette période.'
              }
            />
          )}
          {balance.data && balance.data.length === 0 && report === 'balance' && (
            <EmptyState title="Aucune écriture" description="Aucune écriture comptable sur cette période." />
          )}
          {report === 'balance' && Boolean(balance.data?.length) && (
            <BalanceTable rows={balance.data as BalanceRow[]} />
          )}
          {report === 'grand-livre' && Boolean(balance.data?.length) && (
            <LedgerTable rows={balance.data as LedgerRow[]} />
          )}
          {report === 'balance-agee-fournisseurs' && Boolean(balance.data?.length) && (
            <AgingTable rows={balance.data as AgingRow[]} au={au} partnerLabel="Fournisseur" />
          )}
          {report === 'balance-agee-clients' && Boolean(balance.data?.length) && (
            <AgingTable rows={balance.data as AgingRow[]} au={au} partnerLabel="Client" />
          )}
        </section>
      )}
    </div>
  );
}

function BalanceTable({ rows }: { rows: BalanceRow[] }) {
  const [q, setQ] = useState('');
  const [classeFiltre, setClasseFiltre] = useState<string>('ALL');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (classeFiltre !== 'ALL' && classeSyscohada(r.numero) !== classeFiltre) return false;
      if (!needle) return true;
      return (
        r.numero.toLowerCase().includes(needle) ||
        r.intitule.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, classeFiltre]);
  const groups = groupBalanceByClasse(filtered);
  const totals = balanceTotals(filtered);
  const classes = useMemo(() => {
    const set = new Set(rows.map((r) => classeSyscohada(r.numero)));
    return [...set].sort();
  }, [rows]);
  return (
    <div className="compta-balance">
      <div className="p2p-inline-fields no-print">
        <label className="compta-paiements-search">
          Rechercher
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="N° compte ou intitulé…"
            aria-label="Rechercher dans la balance"
          />
        </label>
        <nav className="compta-journal-chips" aria-label="Filtrer par classe">
          <button
            type="button"
            className={classeFiltre === 'ALL' ? 'actif' : undefined}
            onClick={() => setClasseFiltre('ALL')}
          >
            Toutes
          </button>
          {classes.map((c) => (
            <button
              key={c}
              type="button"
              className={classeFiltre === c ? 'actif' : undefined}
              onClick={() => setClasseFiltre(c)}
            >
              {c} · {CLASSES_SYSCOHADA[c] ?? 'Autres'}
            </button>
          ))}
        </nav>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Aucun compte" description="Ajustez la recherche ou le filtre de classe." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Compte</th>
                <th>Intitulé</th>
                <th>Débit</th>
                <th>Crédit</th>
                <th>Solde</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.classe}>
                <tr className="compta-account-head">
                  <th colSpan={5}>Classe {group.classe} · {group.libelle}</th>
                </tr>
                {group.rows.map((r) => {
                  const solde = Number(r.solde);
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.numero}</td>
                      <td>{r.intitule}</td>
                      <td className="money">{fmtFcfa(r.debit)}</td>
                      <td className="money">{fmtFcfa(r.credit)}</td>
                      <td className={moneyClass(solde)}>{fmtFcfa(solde)}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th colSpan={2}>
                  Total
                  {filtered.length !== rows.length ? ` (${filtered.length}/${rows.length})` : ''}
                </th>
                <th className="money">{fmtFcfa(totals.debit)}</th>
                <th className="money">{fmtFcfa(totals.credit)}</th>
                <th className={moneyClass(totals.solde)}>{fmtFcfa(totals.solde)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      return (
        r.compte.numero.toLowerCase().includes(needle) ||
        r.compte.intitule.toLowerCase().includes(needle) ||
        r.libelle.toLowerCase().includes(needle) ||
        r.ecriture.numero.toLowerCase().includes(needle) ||
        (r.ecriture.journal?.code ?? '').toLowerCase().includes(needle) ||
        labelSourceComptable(r.ecriture.sourceType).toLowerCase().includes(needle)
      );
    });
  }, [rows, q]);
  const groups = groupLedger(filtered);
  const totals = ledgerTotals(filtered);
  return (
    <div className="compta-ledger">
      <div className="p2p-inline-fields no-print">
        <label className="compta-paiements-search">
          Rechercher
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Compte, pièce, libellé, journal…"
            aria-label="Rechercher dans le grand livre"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Aucune écriture" description="Aucun résultat pour cette recherche." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Journal</th>
                <th>Origine</th>
                <th>Pièce</th>
                <th>Libellé</th>
                <th>Débit</th>
                <th>Crédit</th>
              </tr>
            </thead>
            {groups.map((group) => {
              const sub = ledgerTotals(group.lignes);
              return (
                <tbody key={group.compte.id}>
                  <tr className="compta-account-head">
                    <th colSpan={7}>{group.compte.numero} · {group.compte.intitule}</th>
                  </tr>
                  {group.lignes.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.ecriture.dateComptable)}</td>
                      <td>
                        <span className="mono">{r.ecriture.journal?.code ?? '—'}</span>
                        {r.ecriture.journal?.type ? (
                          <small>
                            {JOURNAL_TYPE_LABELS[r.ecriture.journal.type as JournalComptableType] ??
                              r.ecriture.journal.type}
                          </small>
                        ) : null}
                      </td>
                      <td>{labelSourceComptable(r.ecriture.sourceType)}</td>
                      <td className="mono">{r.ecriture.numero}</td>
                      <td>{r.libelle}</td>
                      <td className="money">{fmtFcfa(r.debit)}</td>
                      <td className="money">{fmtFcfa(r.credit)}</td>
                    </tr>
                  ))}
                  <tr className="compta-subtotal">
                    <td colSpan={5}>Sous-total {group.compte.numero}</td>
                    <td className="money">{fmtFcfa(sub.debit)}</td>
                    <td className="money">{fmtFcfa(sub.credit)}</td>
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <th colSpan={5}>
                  Total
                  {filtered.length !== rows.length ? ` (${filtered.length}/${rows.length})` : ''}
                </th>
                <th className="money">{fmtFcfa(totals.debit)}</th>
                <th className="money">{fmtFcfa(totals.credit)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function AgingTable({
  rows,
  au,
  partnerLabel,
}: {
  rows: AgingRow[];
  au: string;
  partnerLabel: string;
}) {
  const [q, setQ] = useState('');
  const [bucketFiltre, setBucketFiltre] = useState<AgingBucket | 'ALL'>('ALL');
  const totals = agingTotals(rows, au);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const net = Number(r.netAPayer ?? r.montant);
      const paid = r.allocationsPaiement.reduce((s, p) => s + Number(p.montant), 0);
      const due = net - paid;
      if (due < 0.01) return false;
      const bucket = agingBucket(r.dateEcheance, au);
      if (bucketFiltre !== 'ALL' && bucket !== bucketFiltre) return false;
      if (!needle) return true;
      return (
        r.fournisseur.nom.toLowerCase().includes(needle) ||
        r.numero.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, bucketFiltre, au]);
  const filteredTotals = agingTotals(filtered, au);

  return (
    <div className="compta-aging">
      <div className="p2p-inline-fields no-print">
        <label className="compta-paiements-search">
          Rechercher
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${partnerLabel}, n° pièce…`}
            aria-label={`Rechercher ${partnerLabel.toLowerCase()}`}
          />
        </label>
        <nav className="compta-journal-chips" aria-label="Filtrer par tranche d’âge">
          <button
            type="button"
            className={bucketFiltre === 'ALL' ? 'actif' : undefined}
            onClick={() => setBucketFiltre('ALL')}
          >
            Toutes
          </button>
          {AGING_BUCKETS.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              className={bucketFiltre === bucket.key ? 'actif' : undefined}
              onClick={() => setBucketFiltre(bucket.key)}
            >
              {bucket.label} · {fmtFcfa(totals[bucket.key])}
            </button>
          ))}
        </nav>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{partnerLabel}</th>
              <th>Pièce</th>
              <th>Échéance</th>
              <th>Retard</th>
              {AGING_BUCKETS.map((bucket) => (
                <th key={bucket.key}>{bucket.label}</th>
              ))}
              <th>Encours</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const net = Number(r.netAPayer ?? r.montant);
              const paid = r.allocationsPaiement.reduce((s, p) => s + Number(p.montant), 0);
              const due = net - paid;
              const bucket = agingBucket(r.dateEcheance, au);
              const retard = daysOverdue(r.dateEcheance, au);
              return (
                <tr key={r.id} className={retard > 0 ? 'compta-aging-overdue' : undefined}>
                  <td>{r.fournisseur.nom}</td>
                  <td className="mono">{r.numero}</td>
                  <td>
                    {fmtDate(r.dateEcheance)}{' '}
                    {retard > 0 ? (
                      <span className="badge badge-warning">Échu</span>
                    ) : (
                      <span className="badge badge-ok">À échéance</span>
                    )}
                  </td>
                  <td>{retard > 0 ? `${retard} j` : '—'}</td>
                  {AGING_BUCKETS.map((item) => (
                    <td key={item.key} className="money">
                      {item.key === bucket ? fmtFcfa(due) : '—'}
                    </td>
                  ))}
                  <td className="money">
                    <strong>{fmtFcfa(due)}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>
                Total{filtered.length !== rows.length ? ` (${filtered.length}/${rows.length})` : ''}
              </th>
              {AGING_BUCKETS.map((item) => (
                <th key={item.key} className="money">
                  {fmtFcfa(filteredTotals[item.key])}
                </th>
              ))}
              <th className="money">{fmtFcfa(filteredTotals.due)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
