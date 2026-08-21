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
import { insightStatutTransaction } from '../lib/insights/transactions';
import { useTresorerieRealtime } from '../lib/tresorerie-realtime';
import {
  enqueueTransactionInit,
  flushOutbox,
  outboxCount,
} from '../lib/offline/outbox';
import type { CaisseDto, TransactionDto } from '../lib/types';

function labelCaisseOption(c: CaisseDto): string {
  if (c.type === TypeCaisse.MAGASIN) {
    return `Magasin · ${c.libelle ?? c.id.slice(0, 8)}`;
  }
  if (c.type === TypeCaisse.TIROIR) {
    return `Tiroir · ${c.code ?? ''} ${c.libelle ?? ''}`.trim();
  }
  return `Centrale · ${c.libelle ?? c.id.slice(0, 8)}`;
}

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

function labelType(type: string) {
  if (type === TypeTransaction.VENTE) return 'Encaissement (vente)';
  if (type === TypeTransaction.SORTIE_FONDS) return 'Versement / sortie';
  return type;
}

function badgeStatut(statut: string) {
  if (statut === StatutTransaction.VALIDEE) return 'badge badge-ok';
  if (statut === StatutTransaction.LITIGE) return 'badge badge-critical';
  if (statut === StatutTransaction.EN_TRANSIT) return 'badge badge-warning';
  if (statut === StatutTransaction.RECEPTIONNEE) return 'badge badge-info';
  return 'badge badge-neutral';
}

function buildQuery(filters: {
  statut: string;
  type: string;
  caisseId: string;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams();
  if (filters.statut) params.set('statut', filters.statut);
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
        "Hors ligne ou erreur réseau — transaction mise en file d'attente (§6.7).",
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
        Aucune caisse MAGASIN disponible pour initier une SORTIE_FONDS vers la
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
      <p className="lead">Type : versement / sortie vers centrale (§6.4)</p>
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
        Initier
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function TransactionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const enCours = searchParams.get('enCours') === '1';
  const ageingBucket = searchParams.get('ageing');
  const caisseIdParam = searchParams.get('caisseId') ?? '';
  const statutParam = searchParams.get('statut') ?? '';
  const peutInitier =
    user !== null && ROLES_INITIATION_SORTIE_FONDS.includes(user.role);
  useTresorerieRealtime(user !== null);
  const [pendingOffline, setPendingOffline] = useState(outboxCount());
  const [filters, setFilters] = useState({
    statut: statutParam,
    type: '',
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
    async function sync() {
      if (!navigator.onLine) return;
      const result = await flushOutbox((path, body, method = 'POST') =>
        apiFetch(path, {
          method,
          ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
        }),
      );
      setPendingOffline(outboxCount());
      if (result.flushed > 0) {
        void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      }
    }
    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [queryClient]);

  // Depuis /tresorerie?enCours=1 : on charge sans filtre statut API, filtre local.
  const queryFilters = enCours ? { ...filters, statut: '' } : filters;
  const queryUrl = useMemo(() => buildQuery(queryFilters), [queryFilters]);

  const { data: transactions, isLoading, isError } = useQuery({
    queryKey: ['transactions', queryFilters, enCours, ageingBucket],
    queryFn: () => apiFetch<TransactionDto[]>(queryUrl),
  });

  const transactionsFiltrees = useMemo(() => {
    if (!transactions) return undefined;
    let rows = transactions;
    if (enCours) {
      rows = rows.filter((t) =>
        STATUTS_EN_COURS.includes(t.statut as StatutTransaction),
      );
    }
    if (filters.statut) {
      rows = rows.filter((t) => t.statut === filters.statut);
    }
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
    return rows;
  }, [transactions, enCours, ageingBucket, filters.statut]);

  const colonnesStatut = useMemo(() => {
    if (enCours) return STATUTS_EN_COURS;
    if (filters.statut) return [filters.statut as StatutTransaction];
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

  const { data: caisses } = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
  });

  return (
    <div className="treso-module">
      <PageHeader
        title="Transactions"
        subtitle={
          enCours
            ? ageingBucket && AGEING_HOURS[ageingBucket]
              ? `En cours · ageing ${ageingBucket.replace('_', '–')}`
              : 'Filtre : circuit en cours (initiée / transit / réceptionnée)'
            : 'Circuit INITIÉE → EN_TRANSIT → RÉCEPTIONNÉE → VALIDÉE | LITIGE → VALIDÉE'
        }
        actions={
          <>
            <nav className="circuit-nav" aria-label="Circuit trésorerie">
              <Link className="circuit-nav-item" to="/tresorerie">
                <Wallet size={14} /> Trésorerie
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
                Colonnes
              </button>
              <button
                type="button"
                className={vue === 'liste' ? 'btn-secondary is-active' : 'btn-secondary'}
                onClick={() => setVue('liste')}
              >
                Liste
              </button>
            </div>
            {peutInitier ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setModalOpen(true)}
                disabled={!caisses}
              >
                Nouvelle transaction
              </button>
            ) : null}
          </>
        }
      />

      <ListPanel title="Filtres">
        <div className="filters-row">
          <label>
            Statut
            <select
              value={filters.statut}
              onChange={(e) => setFilters((f) => ({ ...f, statut: e.target.value }))}
              disabled={enCours}
            >
              <option value="">Tous</option>
              {STATUTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
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
              {(caisses ?? []).map((c) => (
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
      </ListPanel>

      {isLoading && <LoadingState label="Chargement des transactions..." />}
      {isError && <p role="alert">Erreur lors du chargement des transactions.</p>}

      {transactionsFiltrees && vue === 'colonnes' && (
        <div className="tx-kanban" aria-label="File de travail par statut §6.4">
          {colonnesStatut.map((statut) => {
            const cards = parStatut.get(statut) ?? [];
            return (
              <section key={statut} className="tx-kanban-col">
                <header className="tx-kanban-col-head">
                  <span className={badgeStatut(statut)}>{statut}</span>
                  <InfoTooltip insight={insightStatutTransaction(statut)} />
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
                        <div className="tx-kanban-card-title">
                          {new Date(t.dateHeure).toLocaleString()}
                        </div>
                        <div className="money">{t.montant} FCFA</div>
                        <div className="tx-kanban-meta">
                          {labelType(t.type)} · <code>{t.caisseId.slice(0, 8)}…</code>
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
                    Nouvelle transaction
                  </button>
                ) : undefined
              }
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Caisse</th>
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
                      <strong>{new Date(t.dateHeure).toLocaleString()}</strong>
                    </td>
                    <td>{labelType(t.type)}</td>
                    <td className="money">{t.montant} FCFA</td>
                    <td>
                      <span className={badgeStatut(t.statut)}>{t.statut}</span>{' '}
                      <InfoTooltip insight={insightStatutTransaction(t.statut)} />
                    </td>
                    <td>
                      <code>{t.caisseId.slice(0, 8)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ListPanel>
      )}

      {peutInitier && caisses && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle transaction">
          <NouvelleTransactionForm caisses={caisses} onSuccess={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
