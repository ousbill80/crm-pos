import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RoleLibelle,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
  StatutTransaction,
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
import type { TransactionDto } from '../lib/types';

function estLitigeInterne(t: TransactionDto): boolean {
  return t.type === TypeTransaction.TRANSFERT_INTERNE;
}

function RegulariserForm({
  transaction,
  onSuccess,
}: {
  transaction: TransactionDto;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const interne = estLitigeInterne(transaction);
  const [montantRetenu, setMontantRetenu] = useState(transaction.montant);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/regulariser`, {
        method: 'PATCH',
        body: JSON.stringify({
          montantRetenu: Number(montantRetenu),
          motif,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onSuccess?.();
    },
    onError: () => setError('Échec de la régularisation.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <p className="lead">
        {interne
          ? 'Litige interne tiroir → magasin (hors circuit centrale).'
          : 'Litige §6.4 versement magasin → centrale.'}
      </p>
      <p className="lead">
        Montant déclaré :{' '}
        <strong className="money">{transaction.montant} FCFA</strong>
      </p>
      {transaction.bordereau?.reception && (
        <p className="lead">
          Montant reçu (rapprochement) :{' '}
          <strong className="money">
            {transaction.bordereau.reception.montantRecu} FCFA
          </strong>
          {' · '}
          Écart :{' '}
          <strong className="money">
            {transaction.bordereau.reception.ecart} FCFA
          </strong>
        </p>
      )}
      <label htmlFor="montantRetenu">Montant retenu</label>
      <input
        id="montantRetenu"
        type="number"
        min="0"
        step="0.01"
        value={montantRetenu}
        onChange={(e) => setMontantRetenu(e.target.value)}
        required
      />
      <label htmlFor="motif">Motif (obligatoire)</label>
      <textarea
        id="motif"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        required
        minLength={1}
        rows={3}
      />
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        Régulariser → VALIDÉE
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function LitigesPage() {
  const { user } = useAuth();
  useTresorerieRealtime(user !== null);
  const [selected, setSelected] = useState<TransactionDto | null>(null);

  const peutRegulariserCentrale =
    user !== null && ROLES_REGULARISATION_LITIGE.includes(user.role);
  const peutRegulariserInterne =
    user !== null &&
    ROLES_REGULARISATION_LITIGE_INTERNE.includes(user.role as RoleLibelle);

  const { data: litiges, isLoading, isError } = useQuery({
    queryKey: ['transactions', { statut: StatutTransaction.LITIGE }],
    queryFn: () =>
      apiFetch<TransactionDto[]>(
        `/transactions?statut=${StatutTransaction.LITIGE}`,
      ),
  });

  const details = useQuery({
    queryKey: ['transactions', 'litige-detail', selected?.id],
    queryFn: () => apiFetch<TransactionDto>(`/transactions/${selected!.id}`),
    enabled: selected !== null,
  });

  const { internes, centrales } = useMemo(() => {
    const rows = litiges ?? [];
    return {
      internes: rows.filter(estLitigeInterne),
      centrales: rows.filter((t) => !estLitigeInterne(t)),
    };
  }, [litiges]);

  function peutAgir(t: TransactionDto): boolean {
    return estLitigeInterne(t) ? peutRegulariserInterne : peutRegulariserCentrale;
  }

  function renderTable(rows: TransactionDto[], emptyTitle: string) {
    if (rows.length === 0) {
      return (
        <EmptyState title={emptyTitle} description="Aucun litige dans cette catégorie." />
      );
    }
    return (
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
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{new Date(t.dateHeure).toLocaleString()}</td>
              <td>
                <span
                  className={
                    estLitigeInterne(t) ? 'badge badge-warning' : 'badge badge-critical'
                  }
                >
                  {estLitigeInterne(t) ? 'INTERNE' : 'CENTRALE'}
                </span>{' '}
                {t.type}
              </td>
              <td className="money">{t.montant} FCFA</td>
              <td>
                <span className="badge badge-critical">{t.statut}</span>{' '}
                <InfoTooltip insight={insightStatutTransaction(t.statut)} />
              </td>
              <td>
                <code>{t.caisseId.slice(0, 8)}…</code>
              </td>
              <td>
                {peutAgir(t) ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setSelected(t)}
                  >
                    Régulariser
                  </button>
                ) : (
                  <span className="lead">Lecture seule</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <PageHeader
        title="Litiges"
        subtitle="Internes (tiroir→magasin : Resp. boutique / DAF) · Centrale (§6.4 : Contrôle interne / DAF)"
      />

      {isLoading && <LoadingState label="Chargement des litiges..." />}
      {isError && <p role="alert">Erreur lors du chargement des litiges.</p>}

      {litiges && (
        <>
          <ListPanel title={`Litiges internes (${internes.length})`}>
            {renderTable(internes, 'Aucun litige interne')}
          </ListPanel>
          <ListPanel title={`Litiges centrale (§6.4) (${centrales.length})`}>
            {renderTable(centrales, 'Aucun litige centrale')}
          </ListPanel>
        </>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Régularisation du litige"
      >
        {selected && (
          <>
            {details.isLoading && <LoadingState label="Chargement du détail..." />}
            {!details.isLoading && (
              <RegulariserForm
                transaction={details.data ?? selected}
                onSuccess={() => setSelected(null)}
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
