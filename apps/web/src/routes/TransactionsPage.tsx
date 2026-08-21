import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RoleLibelle,
  ROLES_MISE_EN_TRANSIT,
  ROLES_VALIDATION_CAISSE_CENTRALE,
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

const ROLES_INITIATION: RoleLibelle[] = [
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

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
  const auxiliaires = caisses.filter((c) => c.type === TypeCaisse.AUXILIAIRE);
  const [caisseId, setCaisseId] = useState(auxiliaires[0]?.id ?? '');
  const [type, setType] = useState<TypeTransaction>(TypeTransaction.SORTIE_FONDS);
  const [montant, setMontant] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        caisseId,
        type,
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
      // Filet hors-ligne : si le réseau tombe pendant le POST.
      enqueueTransactionInit({
        caisseId,
        type,
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

  if (auxiliaires.length === 0) {
    return <p>Aucune caisse auxiliaire disponible pour initier une transaction.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="stack-form">
      <label htmlFor="caisseId">Caisse</label>
      <select id="caisseId" value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
        {auxiliaires.map((c) => (
          <option key={c.id} value={c.id}>
            {`AUXILIAIRE · ${c.id.slice(0, 8)}`}
          </option>
        ))}
      </select>
      <label htmlFor="type">Type</label>
      <select
        id="type"
        value={type}
        onChange={(e) => setType(e.target.value as TypeTransaction)}
      >
        <option value={TypeTransaction.SORTIE_FONDS}>Versement / sortie vers centrale</option>
        <option value={TypeTransaction.VENTE}>Encaissement (vente) local</option>
      </select>
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

function RapprocherForm({
  transaction,
  onSuccess,
}: {
  transaction: TransactionDto;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [montantRecu, setMontantRecu] = useState(transaction.montant);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/rapprocher`, {
        method: 'PATCH',
        body: JSON.stringify({ montantRecu: Number(montantRecu) }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onSuccess?.();
    },
    onError: () => setError('Échec du rapprochement.'),
  });

  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="lead">
        Montant déclaré : <strong className="money">{transaction.montant} FCFA</strong>
      </p>
      <label htmlFor="montantRecu">Montant reçu</label>
      <input
        id="montantRecu"
        type="number"
        min="0"
        step="0.01"
        value={montantRecu}
        onChange={(e) => setMontantRecu(e.target.value)}
        required
      />
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        Rapprocher
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function TransactionDetail({ transactionId }: { transactionId: string }) {
  const detail = useQuery({
    queryKey: ['transactions', transactionId],
    queryFn: () => apiFetch<TransactionDto>(`/transactions/${transactionId}`),
  });

  if (detail.isLoading) return <LoadingState label="Chargement du détail..." />;
  if (detail.isError || !detail.data) {
    return <p role="alert">Impossible de charger le détail.</p>;
  }

  const t = detail.data;
  return (
    <div className="stack-form">
      <p>
        <span className={badgeStatut(t.statut)}>{t.statut}</span>{' '}
        <InfoTooltip insight={insightStatutTransaction(t.statut)} />
      </p>
      <p>
        Type : <strong>{labelType(t.type)}</strong>
      </p>
      <p>
        Montant : <strong className="money">{t.montant} FCFA</strong>
      </p>
      <p>Date : {new Date(t.dateHeure).toLocaleString()}</p>
      <p>
        Caisse : <code>{t.caisseId.slice(0, 8)}…</code>
        {t.caisse?.boutique?.nom ? ` · ${t.caisse.boutique.nom}` : ''}
      </p>
      {t.bordereau && (
        <>
          <h4>Bordereau</h4>
          <p>
            Déclaré :{' '}
            <strong className="money">{t.bordereau.montantDeclare} FCFA</strong>
          </p>
          <p>Émis : {new Date(t.bordereau.dateEmission).toLocaleString()}</p>
          {t.bordereau.reception && (
            <>
              <h4>Réception / rapprochement</h4>
              <p>
                Reçu :{' '}
                <strong className="money">{t.bordereau.reception.montantRecu} FCFA</strong>
              </p>
              <p>
                Écart :{' '}
                <strong className="money">{t.bordereau.reception.ecart} FCFA</strong>
              </p>
              <p>Statut final : {t.bordereau.reception.statutFinal}</p>
            </>
          )}
        </>
      )}
      {t.contreparties && t.contreparties.length > 0 && (
        <>
          <h4>Contrepartie centrale</h4>
          {t.contreparties.map((c) => (
            <p key={c.id}>
              <code>{c.id.slice(0, 8)}…</code> · {c.montant} FCFA · {c.statut}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function TransactionActions({
  transaction,
  onRapprocher,
}: {
  transaction: TransactionDto;
  onRapprocher: (t: TransactionDto) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const transition = useMutation({
    mutationFn: (path: string) =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/${path}`, {
        method: 'PATCH',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  if (!user) return null;

  const actions: ReactNode[] = [];

  if (
    transaction.statut === StatutTransaction.INITIEE &&
    ROLES_MISE_EN_TRANSIT.includes(user.role)
  ) {
    actions.push(
      <button key="transit" type="button" onClick={() => transition.mutate('transit')}>
        Passer en transit
      </button>,
    );
  }

  if (
    transaction.statut === StatutTransaction.EN_TRANSIT &&
    ROLES_VALIDATION_CAISSE_CENTRALE.includes(user.role)
  ) {
    actions.push(
      <button key="receptionner" type="button" onClick={() => transition.mutate('receptionner')}>
        Réceptionner
      </button>,
    );
  }

  if (
    transaction.statut === StatutTransaction.RECEPTIONNEE &&
    (ROLES_VALIDATION_CAISSE_CENTRALE.includes(user.role) ||
      user.role === RoleLibelle.DIRECTION_GENERALE)
  ) {
    actions.push(
      <button key="rapprocher" type="button" onClick={() => onRapprocher(transaction)}>
        Rapprocher
      </button>,
    );
  }

  return <div className="table-actions">{actions}</div>;
}

export function TransactionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutInitier = user !== null && ROLES_INITIATION.includes(user.role);
  useTresorerieRealtime(user !== null);
  const [pendingOffline, setPendingOffline] = useState(outboxCount());
  const [filters, setFilters] = useState({
    statut: '',
    type: '',
    caisseId: '',
    from: '',
    to: '',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [rapprocherTx, setRapprocherTx] = useState<TransactionDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    async function sync() {
      if (!navigator.onLine) return;
      const result = await flushOutbox((path, body) =>
        apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
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

  const queryUrl = useMemo(() => buildQuery(filters), [filters]);

  const { data: transactions, isLoading, isError } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => apiFetch<TransactionDto[]>(queryUrl),
  });

  const { data: caisses } = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
  });

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Circuit INITIÉE → EN_TRANSIT → RÉCEPTIONNÉE → VALIDÉE | LITIGE → VALIDÉE"
        actions={
          <>
            {pendingOffline > 0 ? (
              <span className="badge badge-warning">
                {pendingOffline} en file hors-ligne
              </span>
            ) : null}
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
                  {c.type} · {c.id.slice(0, 8)}
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

      {transactions && (
        <ListPanel title="Transactions">
          {transactions.length === 0 ? (
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setDetailId(t.id)}
                      >
                        {new Date(t.dateHeure).toLocaleString()}
                      </button>
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
                    <td>
                      <TransactionActions
                        transaction={t}
                        onRapprocher={setRapprocherTx}
                      />
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

      <Modal
        open={rapprocherTx !== null}
        onClose={() => setRapprocherTx(null)}
        title="Rapprochement"
      >
        {rapprocherTx && (
          <RapprocherForm
            transaction={rapprocherTx}
            onSuccess={() => setRapprocherTx(null)}
          />
        )}
      </Modal>

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Détail transaction"
      >
        {detailId && <TransactionDetail transactionId={detailId} />}
      </Modal>
    </div>
  );
}
