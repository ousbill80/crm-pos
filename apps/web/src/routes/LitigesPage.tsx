import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROLES_REGULARISATION_LITIGE,
  StatutTransaction,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightStatutTransaction } from '../lib/insights/transactions';
import type { TransactionDto } from '../lib/types';

function RegulariserForm({
  transaction,
  onSuccess,
}: {
  transaction: TransactionDto;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
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
        Montant déclaré : <strong className="money">{transaction.montant} FCFA</strong>
      </p>
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
  const peutRegulariser =
    user !== null && ROLES_REGULARISATION_LITIGE.includes(user.role);
  const [selected, setSelected] = useState<TransactionDto | null>(null);

  const { data: litiges, isLoading, isError } = useQuery({
    queryKey: ['transactions', { statut: StatutTransaction.LITIGE }],
    queryFn: () =>
      apiFetch<TransactionDto[]>(
        `/transactions?statut=${StatutTransaction.LITIGE}`,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Litiges"
        subtitle="Écarts de rapprochement bloqués jusqu’à régularisation (§6.4) — Contrôle interne / DAF"
      />

      {isLoading && <LoadingState label="Chargement des litiges..." />}
      {isError && <p role="alert">Erreur lors du chargement des litiges.</p>}

      {litiges && (
        <ListPanel title="Transactions en litige">
          {litiges.length === 0 ? (
            <EmptyState
              title="Aucun litige"
              description="Aucune transaction en LITIGE sur votre périmètre."
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
                {litiges.map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.dateHeure).toLocaleString()}</td>
                    <td>{t.type}</td>
                    <td className="money">{t.montant} FCFA</td>
                    <td>
                      <span className="badge badge-critical">{t.statut}</span>{' '}
                      <InfoTooltip insight={insightStatutTransaction(t.statut)} />
                    </td>
                    <td>
                      <code>{t.caisseId.slice(0, 8)}…</code>
                    </td>
                    <td>
                      {peutRegulariser ? (
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
          )}
        </ListPanel>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Régularisation du litige"
      >
        {selected && (
          <RegulariserForm
            transaction={selected}
            onSuccess={() => setSelected(null)}
          />
        )}
      </Modal>
    </div>
  );
}
