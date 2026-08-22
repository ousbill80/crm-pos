import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Scale, Wallet } from 'lucide-react';
import {
  ROLES_INITIATION_SORTIE_FONDS,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  insightEnCoursCircuit,
  insightLitigesTransactions,
  insightMontantEnTransit,
  insightPerimetreTransactions,
  insightStatutTransaction,
} from '../lib/insights/transactions';
import { useTresorerieRealtime } from '../lib/tresorerie-realtime';
import {
  enqueueTransactionInit,
  outboxCount,
} from '../lib/offline/outbox';
import { sAbonnerSync } from '../lib/offline/auto-sync';
import type { CaisseDto, TransactionDto } from '../lib/types';

const STATUT_LABEL: Record<string, string> = {
  [StatutTransaction.INITIEE]: 'Initiée',
  [StatutTransaction.EN_TRANSIT]: 'En transit',
  [StatutTransaction.RECEPTIONNEE]: 'Réceptionnée',
  [StatutTransaction.VALIDEE]: 'Validée',
  [StatutTransaction.LITIGE]: 'Litige',
};

const STATUT_QUI: Record<string, string> = {
  [StatutTransaction.INITIEE]: 'Boutique — mise en transit',
  [StatutTransaction.EN_TRANSIT]: 'Caissier central — réceptionner',
  [StatutTransaction.RECEPTIONNEE]: 'Caissier central — rapprocher',
  [StatutTransaction.VALIDEE]: 'Soldée',
  [StatutTransaction.LITIGE]: 'Contrôle interne / DAF',
};

const STATUTS_EN_COURS: StatutTransaction[] = [
  StatutTransaction.INITIEE,
  StatutTransaction.EN_TRANSIT,
  StatutTransaction.RECEPTIONNEE,
];

const AGEING_HOURS: Record<string, { minH: number; maxH: number | null }> = {
  '0_24h': { minH: 0, maxH: 24 },
  '24_48h': { minH: 24, maxH: 48 },
  '48_72h': { minH: 48, maxH: 72 },
  plus_72h: { minH: 72, maxH: null },
};
const STATUTS = Object.values(StatutTransaction);
const TYPES = Object.values(TypeTransaction);

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function labelCaisseOption(c: CaisseDto): string {
  if (c.type === TypeCaisse.MAGASIN) {
    return `Magasin · ${c.libelle ?? c.id.slice(0, 8)}`;
  }
  if (c.type === TypeCaisse.TIROIR) {
    return `Tiroir · ${c.code ?? ''} ${c.libelle ?? ''}`.trim();
  }
  return `Centrale · ${c.libelle ?? c.id.slice(0, 8)}`;
}

function labelType(type: string) {
  if (type === TypeTransaction.VENTE) return 'Encaissement';
  if (type === TypeTransaction.SORTIE_FONDS) return 'Versement / sortie';
  if (type === TypeTransaction.TRANSFERT_INTERNE) return 'Transfert interne';
  return type;
}

function badgeStatut(statut: string) {
  if (statut === StatutTransaction.VALIDEE) return 'badge badge-ok';
  if (statut === StatutTransaction.LITIGE) return 'badge badge-critical';
  if (statut === StatutTransaction.EN_TRANSIT) return 'badge badge-warning';
  if (statut === StatutTransaction.RECEPTIONNEE) return 'badge badge-info';
  return 'badge badge-neutral';
}

function nomMagasinTx(t: TransactionDto): string {
  if (t.caisse?.boutique?.nom) return t.caisse.boutique.nom;
  if (t.caisse?.type === TypeCaisse.CENTRALE) return 'Réseau';
  return '—';
}

function labelCaisseTx(t: TransactionDto): string {
  const c = t.caisse;
  if (!c) return 'Caisse';
  if (c.type === TypeCaisse.TIROIR) {
    return `${c.code ?? 'T??'} — ${c.libelle ?? 'Tiroir'}`;
  }
  if (c.type === TypeCaisse.MAGASIN) return c.libelle ?? 'Caisse magasin';
  return c.libelle ?? 'Caisse centrale';
}

function buildQuery(filters: {
  type: string;
  caisseId: string;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.caisseId) params.set('caisseId', filters.caisseId);
  if (filters.from) params.set('from', new Date(filters.from).toISOString());
  if (filters.to) params.set('to', new Date(filters.to).toISOString());
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : '/transactions';
}

function NouvelleTransactionForm({
  caisses,
  onSuccess,
}: {
  caisses: CaisseDto[];
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const magasins = caisses.filter((c) => c.type === TypeCaisse.MAGASIN);
  const [caisseId, setCaisseId] = useState(magasins[0]?.id ?? '');
  const [montant, setMontant] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        caisseId,
        type: TypeTransaction.SORTIE_FONDS as typeof TypeTransaction.SORTIE_FONDS,
        montant: Number(montant),
        clientOperationId: crypto.randomUUID(),
      };
      if (!navigator.onLine) {
        enqueueTransactionInit({
          caisseId: payload.caisseId,
          type: payload.type,
          montant: payload.montant,
        });
        return null;
      }
      return apiFetch<TransactionDto>('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setMontant('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onSuccess?.();
    },
    onError: () => {
      enqueueTransactionInit({
        caisseId,
        type: TypeTransaction.SORTIE_FONDS,
        montant: Number(montant),
      });
      setError(
        "Hors ligne ou erreur réseau — versement mis en file d'attente (§6.7).",
      );
      onSuccess?.();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (magasins.length === 0) {
    return (
      <p>
        Aucune caisse magasin disponible pour initier un versement vers la
        centrale.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="stack-form">
      <label htmlFor="caisseId">Caisse magasin (cash office)</label>
      <select id="caisseId" value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
        {magasins.map((c) => (
          <option key={c.id} value={c.id}>
            {labelCaisseOption(c)}
          </option>
        ))}
      </select>
      <p className="lead">Versement / sortie vers la centrale — statut Initiée (§6.4).</p>
      <label htmlFor="montant">Montant</label>
      <input
        id="montant"
        type="number"
        min="0.01"
        step="0.01"
        value={montant}
        onChange={(e) => setMontant(e.target.value)}
        required
      />
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        Initier le versement
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function TransactionsPage({
  titre = 'Transactions',
  typeDefaut = '',
  statutDefaut = '',
}: {
  titre?: string;
  typeDefaut?: string;
  statutDefaut?: string;
} = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const magasin = useFiltreMagasinSiege();
  const [searchParams, setSearchParams] = useSearchParams();
  const enCours = searchParams.get('enCours') === '1';
  const ageingBucket = searchParams.get('ageing');
  const caisseIdParam = searchParams.get('caisseId') ?? '';
  const statutParam = searchParams.get('statut') ?? statutDefaut;
  const typeParam = searchParams.get('type') ?? typeDefaut;
  const peutInitier =
    user !== null && ROLES_INITIATION_SORTIE_FONDS.includes(user.role);
  useTresorerieRealtime(user !== null);
  const [pendingOffline, setPendingOffline] = useState(outboxCount());
  const [filters, setFilters] = useState({
    statut: statutParam,
    type: typeParam,
    caisseId: caisseIdParam,
    from: '',
    to: '',
  });
  const [vue, setVue] = useState<'liste' | 'colonnes'>('colonnes');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (caisseIdParam) {
      setFilters((f) =>
        f.caisseId === caisseIdParam ? f : { ...f, caisseId: caisseIdParam },
      );
    }
  }, [caisseIdParam]);

  useEffect(() => {
    if (statutParam) {
      setFilters((f) =>
        f.statut === statutParam ? f : { ...f, statut: statutParam },
      );
    }
  }, [statutParam]);

  useEffect(() => {
    if (typeParam) {
      setFilters((f) => (f.type === typeParam ? f : { ...f, type: typeParam }));
    }
  }, [typeParam]);

  useEffect(() => {
    function rafraichir() {
      setPendingOffline(outboxCount());
    }
    rafraichir();
    return sAbonnerSync(rafraichir);
  }, []);

  const queryFilters = useMemo(
    () => ({
      type: filters.type,
      caisseId: filters.caisseId,
      from: filters.from,
      to: filters.to,
    }),
    [filters.type, filters.caisseId, filters.from, filters.to],
  );
  const queryUrl = useMemo(() => buildQuery(queryFilters), [queryFilters]);

  const { data: transactions, isLoading, isError } = useQuery({
    queryKey: ['transactions', queryFilters],
    queryFn: () => apiFetch<TransactionDto[]>(queryUrl),
  });

  const dansPerimetre = useMemo(() => {
    if (!transactions) return undefined;
    let rows = transactions;
    if (ageingBucket && AGEING_HOURS[ageingBucket]) {
      const { minH, maxH } = AGEING_HOURS[ageingBucket];
      const now = Date.now();
      rows = rows.filter((t) => {
        const ageH = (now - new Date(t.dateHeure).getTime()) / (60 * 60 * 1000);
        if (ageH < minH) return false;
        if (maxH !== null && ageH >= maxH) return false;
        return true;
      });
    }
    if (magasin.boutiqueId) {
      rows = rows.filter(
        (t) =>
          t.caisse?.boutiqueId === magasin.boutiqueId ||
          t.caisse?.boutique?.id === magasin.boutiqueId,
      );
    }
    return rows;
  }, [transactions, ageingBucket, magasin.boutiqueId]);

  const transactionsFiltrees = useMemo(() => {
    if (!dansPerimetre) return undefined;
    let rows = dansPerimetre;
    if (enCours && !filters.statut) {
      rows = rows.filter((t) =>
        STATUTS_EN_COURS.includes(t.statut as StatutTransaction),
      );
    }
    if (filters.statut) {
      rows = rows.filter((t) => t.statut === filters.statut);
    }
    return rows;
  }, [dansPerimetre, enCours, filters.statut]);

  const counts = useMemo(() => {
    const map = new Map<string, { n: number; montant: number }>();
    for (const s of STATUTS) map.set(s, { n: 0, montant: 0 });
    for (const t of dansPerimetre ?? []) {
      const cur = map.get(t.statut) ?? { n: 0, montant: 0 };
      cur.n += 1;
      cur.montant += Number(t.montant);
      map.set(t.statut, cur);
    }
    return map;
  }, [dansPerimetre]);

  const colonnesStatut = useMemo(() => {
    if (filters.statut) return [filters.statut as StatutTransaction];
    if (enCours) return STATUTS_EN_COURS;
    return STATUTS;
  }, [enCours, filters.statut]);

  const parStatut = useMemo(() => {
    const map = new Map<string, TransactionDto[]>();
    for (const s of colonnesStatut) map.set(s, []);
    for (const t of transactionsFiltrees ?? []) {
      const bucket = map.get(t.statut);
      if (bucket) bucket.push(t);
    }
    return map;
  }, [transactionsFiltrees, colonnesStatut]);

  const kpiEnCours = STATUTS_EN_COURS.reduce(
    (s, st) => s + (counts.get(st)?.n ?? 0),
    0,
  );
  const kpiLitiges = counts.get(StatutTransaction.LITIGE)?.n ?? 0;
  const kpiTransit = counts.get(StatutTransaction.EN_TRANSIT)?.montant ?? 0;
  const kpiTotal = dansPerimetre?.length ?? 0;

  const { data: caisses } = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
  });

  function choisirStatut(statut: string) {
    const next = filters.statut === statut ? '' : statut;
    setFilters((f) => ({ ...f, statut: next }));
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (next) {
        n.set('statut', next);
        n.delete('enCours');
      } else {
        n.delete('statut');
      }
      return n;
    });
  }

  const sousTitre = enCours && !filters.statut
    ? ageingBucket && AGEING_HOURS[ageingBucket]
      ? `Circuit en cours · ${ageingBucket.replace('_', '–')}`
      : 'Circuit en cours — initiée, transit, réceptionnée.'
    : 'Cliquez une étape ou une ligne → fiche transaction.';

  return (
    <div className="treso-module">
      <PageHeader
        title={titre}
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau: sousTitre,
          texteBoutique: sousTitre,
        })}
        actions={
          <>
            <nav className="circuit-nav" aria-label="Circuit trésorerie">
              <Link className="circuit-nav-item" to="/tresorerie">
                Vue
              </Link>
              <Link className="circuit-nav-item" to="/tresorerie/bordereaux">
                <Wallet size={14} /> Bordereaux
              </Link>
              <Link className="circuit-nav-item" to="/tresorerie/reception">
                Réception
              </Link>
              <Link className="circuit-nav-item" to="/litiges">
                <Scale size={14} /> Litiges
              </Link>
              <Link className="circuit-nav-item" to="/caisses">
                <Landmark size={14} /> Caisses
              </Link>
            </nav>
            {pendingOffline > 0 ? (
              <span className="badge badge-warning">
                {pendingOffline} en file hors-ligne
              </span>
            ) : null}
            <div className="vue-toggle" role="group" aria-label="Mode d'affichage">
              <button
                type="button"
                className={vue === 'colonnes' ? 'btn-secondary is-active' : 'btn-secondary'}
                onClick={() => setVue('colonnes')}
              >
                Par étape
              </button>
              <button
                type="button"
                className={vue === 'liste' ? 'btn-secondary is-active' : 'btn-secondary'}
                onClick={() => setVue('liste')}
              >
                Tableau
              </button>
            </div>
            {peutInitier ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setModalOpen(true)}
                disabled={!caisses}
              >
                Nouveau versement
              </button>
            ) : null}
          </>
        }
      />

      <section className="tx-kpis" aria-label="Synthèse circuit">
        <button
          type="button"
          className={`tx-kpi${!enCours && !filters.statut && !ageingBucket ? ' is-actif' : ''}`}
          onClick={() => {
            setFilters((f) => ({ ...f, statut: '' }));
            setSearchParams((p) => {
              const n = new URLSearchParams(p);
              n.delete('statut');
              n.delete('enCours');
              n.delete('ageing');
              return n;
            });
          }}
        >
          <div className="tx-kpi-label">
            Périmètre <InfoTooltip insight={insightPerimetreTransactions(kpiTotal)} />
          </div>
          <div className="tx-kpi-value">{kpiTotal}</div>
          <div className="tx-kpi-hint">Toutes transactions</div>
        </button>
        <button
          type="button"
          className={`tx-kpi${enCours && !filters.statut ? ' is-actif' : ''}`}
          onClick={() => {
            setFilters((f) => ({ ...f, statut: '' }));
            setSearchParams((p) => {
              const n = new URLSearchParams(p);
              n.delete('statut');
              if (enCours) n.delete('enCours');
              else n.set('enCours', '1');
              return n;
            });
          }}
        >
          <div className="tx-kpi-label">
            En cours §6.4 <InfoTooltip insight={insightEnCoursCircuit(kpiEnCours, kpiTotal)} />
          </div>
          <div className="tx-kpi-value">{kpiEnCours}</div>
          <div className="tx-kpi-hint">hors validée / litige</div>
        </button>
        <Link className="tx-kpi" to="/litiges">
          <div className="tx-kpi-label">
            Litiges <InfoTooltip insight={insightLitigesTransactions(kpiLitiges)} />
          </div>
          <div className="tx-kpi-value">{kpiLitiges}</div>
          <div className="tx-kpi-hint">ouvrir la file</div>
        </Link>
        <button
          type="button"
          className={`tx-kpi${filters.statut === StatutTransaction.EN_TRANSIT ? ' is-actif' : ''}`}
          onClick={() => choisirStatut(StatutTransaction.EN_TRANSIT)}
        >
          <div className="tx-kpi-label">
            En transit <InfoTooltip insight={insightMontantEnTransit(kpiTransit)} />
          </div>
          <div className="tx-kpi-value tx-kpi-value-sm money">{formatFcfa(kpiTransit)}</div>
          <div className="tx-kpi-hint">Filtrer sur cette étape</div>
        </button>
      </section>

      <ol className="tx-circuit" aria-label="Circuit §6.4">
        {STATUTS.map((statut, i) => {
          const c = counts.get(statut);
          const actif = filters.statut === statut;
          return (
            <li key={statut}>
              {i > 0 ? (
                <span className="tx-circuit-arrow" aria-hidden>
                  →
                </span>
              ) : null}
              <button
                type="button"
                className={`tx-circuit-step${actif ? ' is-actif' : ''}`}
                onClick={() => choisirStatut(statut)}
              >
                <span className={badgeStatut(statut)}>{STATUT_LABEL[statut]}</span>
                <strong>{c?.n ?? 0}</strong>
                <small>{STATUT_QUI[statut]}</small>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="tx-bar">
        <FiltreMagasinSiege id="tx-filtre-magasin" />
        <label>
          Type
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="">Tous</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {labelType(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Caisse
          <select
            value={filters.caisseId}
            onChange={(e) => setFilters((f) => ({ ...f, caisseId: e.target.value }))}
          >
            <option value="">Toutes</option>
            {(caisses ?? [])
              .filter(
                (c) => !magasin.boutiqueId || c.boutiqueId === magasin.boutiqueId,
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {labelCaisseOption(c)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Du
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </label>
        <label>
          Au
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </label>
      </div>

      {isLoading && <LoadingState label="Chargement des transactions..." />}
      {isError && <p role="alert">Erreur lors du chargement des transactions.</p>}

      {transactionsFiltrees && vue === 'colonnes' && (
        <div className="tx-kanban" aria-label="File de travail par statut §6.4">
          {colonnesStatut.map((statut) => {
            const cards = parStatut.get(statut) ?? [];
            return (
              <section key={statut} className="tx-kanban-col">
                <header className="tx-kanban-col-head">
                  <div>
                    <span className={badgeStatut(statut)}>
                      {STATUT_LABEL[statut] ?? statut}
                    </span>
                    <InfoTooltip insight={insightStatutTransaction(statut)} />
                    <div className="tx-kanban-qui">{STATUT_QUI[statut]}</div>
                  </div>
                  <span className="tx-kanban-count">{cards.length}</span>
                </header>
                <div className="tx-kanban-cards">
                  {cards.length === 0 ? (
                    <p className="tx-kanban-empty">Aucune</p>
                  ) : (
                    cards.map((t) => (
                      <article
                        key={t.id}
                        className="tx-kanban-card"
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/transactions/${t.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/transactions/${t.id}`);
                          }
                        }}
                      >
                        <div className="money">{formatFcfa(t.montant)}</div>
                        <div className="tx-kanban-card-title">{labelType(t.type)}</div>
                        <div className="tx-kanban-meta">
                          {nomMagasinTx(t)} · {labelCaisseTx(t)}
                        </div>
                        <div className="tx-kanban-meta">
                          {new Date(t.dateHeure).toLocaleString('fr-FR')}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {transactionsFiltrees && vue === 'liste' && (
        <ListPanel title="Transactions">
          {transactionsFiltrees.length === 0 ? (
            <EmptyState
              title="Aucune transaction"
              description="Aucune transaction sur votre périmètre pour ces filtres."
              action={
                peutInitier ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setModalOpen(true)}
                    disabled={!caisses}
                  >
                    Nouveau versement
                  </button>
                ) : undefined
              }
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Magasin</th>
                  <th>Caisse</th>
                  <th>Type</th>
                  <th>Montant</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {transactionsFiltrees.map((t) => (
                  <tr
                    key={t.id}
                    className="produit-row"
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/transactions/${t.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/transactions/${t.id}`);
                      }
                    }}
                  >
                    <td>
                      <strong>{new Date(t.dateHeure).toLocaleString('fr-FR')}</strong>
                    </td>
                    <td>{nomMagasinTx(t)}</td>
                    <td>{labelCaisseTx(t)}</td>
                    <td>{labelType(t.type)}</td>
                    <td className="money">{formatFcfa(t.montant)}</td>
                    <td>
                      <span className={badgeStatut(t.statut)}>
                        {STATUT_LABEL[t.statut] ?? t.statut}
                      </span>{' '}
                      <InfoTooltip insight={insightStatutTransaction(t.statut)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ListPanel>
      )}

      {peutInitier && caisses && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau versement">
          <NouvelleTransactionForm caisses={caisses} onSuccess={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
