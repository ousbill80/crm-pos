import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RoleLibelle,
  ROLES_VALIDATION_CAISSE_CENTRALE,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { CaisseDto, TransactionDto } from '../lib/types';

const ROLES_INITIATION: RoleLibelle[] = [
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: () => apiFetch<TransactionDto[]>('/transactions'),
  });
}

function useCaisses(enabled: boolean) {
  return useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
    enabled,
  });
}

function NouvelleTransactionForm({ caisses }: { caisses: CaisseDto[] }) {
  const queryClient = useQueryClient();
  const auxiliaires = caisses.filter((c) => c.type === TypeCaisse.AUXILIAIRE);
  const [caisseId, setCaisseId] = useState(auxiliaires[0]?.id ?? '');
  const [type, setType] = useState<TypeTransaction>(TypeTransaction.VENTE);
  const [montant, setMontant] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<TransactionDto>('/transactions', {
        method: 'POST',
        body: JSON.stringify({ caisseId, type, montant: Number(montant) }),
      }),
    onSuccess: () => {
      setMontant('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => setError("Échec de l'initiation de la transaction."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (auxiliaires.length === 0) {
    return <p>Aucune caisse auxiliaire disponible pour initier une transaction.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Nouvelle transaction</h2>
      <label htmlFor="caisseId">Caisse</label>
      <select id="caisseId" value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
        {auxiliaires.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id}
          </option>
        ))}
      </select>
      <label htmlFor="type">Type</label>
      <select id="type" value={type} onChange={(e) => setType(e.target.value as TypeTransaction)}>
        <option value={TypeTransaction.VENTE}>Versement (vente)</option>
        <option value={TypeTransaction.SORTIE_FONDS}>Sortie de fonds</option>
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
      <button type="submit" disabled={mutation.isPending}>
        Initier
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function TransactionActions({ transaction }: { transaction: TransactionDto }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const transition = useMutation({
    mutationFn: (path: string) =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/${path}`, {
        method: 'PATCH',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const rapprocher = useMutation({
    mutationFn: (montantRecu: number) =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/rapprocher`, {
        method: 'PATCH',
        body: JSON.stringify({ montantRecu }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  if (!user) {
    return null;
  }

  const actions: ReactNode[] = [];

  // §6.4 : transitions visibles seulement pour les rôles habilités côté
  // serveur — l'UI ne fait que refléter le RBAC déjà appliqué par l'API.
  if (
    transaction.statut === StatutTransaction.INITIEE &&
    user.role === RoleLibelle.RESPONSABLE_BOUTIQUE
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
    ROLES_VALIDATION_CAISSE_CENTRALE.includes(user.role)
  ) {
    actions.push(
      <button
        key="rapprocher"
        type="button"
        onClick={() => {
          const saisie = window.prompt('Montant reçu ?', transaction.montant);
          if (saisie === null) return;
          const montantRecu = Number(saisie);
          if (Number.isNaN(montantRecu)) return;
          rapprocher.mutate(montantRecu);
        }}
      >
        Rapprocher
      </button>,
    );
  }

  return <div className="table-actions">{actions}</div>;
}

function badgeStatut(statut: string) {
  if (statut === StatutTransaction.VALIDEE) return 'badge badge-ok';
  if (statut === StatutTransaction.LITIGE) return 'badge badge-critical';
  if (statut === StatutTransaction.EN_TRANSIT) return 'badge badge-warning';
  if (statut === StatutTransaction.RECEPTIONNEE) return 'badge badge-info';
  return 'badge badge-neutral';
}

export function TransactionsPage() {
  const { user } = useAuth();
  const { data: transactions, isLoading, isError } = useTransactions();
  const peutInitier = user !== null && ROLES_INITIATION.includes(user.role);
  const { data: caisses } = useCaisses(peutInitier);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Transactions</h1>
          <p className="lead">
            Circuit INITIÉE → EN_TRANSIT → RÉCEPTIONNÉE → VALIDÉE | LITIGE
          </p>
        </div>
      </header>

      {peutInitier && caisses && <NouvelleTransactionForm caisses={caisses} />}

      {isLoading && <p>Chargement des transactions...</p>}
      {isError && <p role="alert">Erreur lors du chargement des transactions.</p>}

      {transactions && (
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
                <td>{new Date(t.dateHeure).toLocaleString()}</td>
                <td>{t.type}</td>
                <td className="money">{t.montant} FCFA</td>
                <td>
                  <span className={badgeStatut(t.statut)}>{t.statut}</span>
                </td>
                <td>
                  <code style={{ fontSize: 12 }}>{t.caisseId.slice(0, 8)}…</code>
                </td>
                <td>
                  <TransactionActions transaction={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
