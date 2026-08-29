import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RoleLibelle,
  ROLES_MISE_EN_TRANSIT,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
  ROLES_VALIDATION_CAISSE_CENTRALE,
  StatutTransaction,
  TypeTransaction,
} from '@caisse-crm/shared';
import { Printer } from 'lucide-react';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightStatutTransaction } from '../lib/insights/transactions';
import { CircuitFondsStepper } from '../components/CircuitFondsStepper';
import type { TransactionDto } from '../lib/types';

function labelType(type: string) {
  if (type === TypeTransaction.VENTE) return 'Encaissement (vente)';
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

function estLitigeInterne(t: TransactionDto): boolean {
  return t.type === TypeTransaction.TRANSFERT_INTERNE;
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
        {' '}— réception DAF / Caissier central, puis rapprochement.
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

function RegulariserForm({ transaction }: { transaction: TransactionDto }) {
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
    },
    onError: () => setError('Échec de la régularisation.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <h2>Régularisation</h2>
      <p className="lead">
        {interne
          ? 'Litige interne tiroir → magasin (Resp. boutique / DAF).'
          : 'Litige §6.4 magasin → centrale (Contrôle interne / DAF).'}
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

function TransactionActions({
  transaction,
  onRapprocher,
}: {
  transaction: TransactionDto;
  onRapprocher: () => void;
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
      <button
        key="receptionner"
        type="button"
        className="btn-primary"
        onClick={() => transition.mutate('receptionner')}
      >
        Réceptionner (DAF / Caissier central)
      </button>,
    );
  }

  if (
    transaction.statut === StatutTransaction.RECEPTIONNEE &&
    (ROLES_VALIDATION_CAISSE_CENTRALE.includes(user.role) ||
      user.role === RoleLibelle.DIRECTION_GENERALE)
  ) {
    actions.push(
      <button key="rapprocher" type="button" className="btn-primary" onClick={onRapprocher}>
        Rapprocher
      </button>,
    );
  }

  if (actions.length === 0) return null;
  return <div className="client-workspace-toolbar-actions">{actions}</div>;
}

export function TransactionDetailPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rapprocher, setRapprocher] = useState(false);

  const detail = useQuery({
    queryKey: ['transactions', transactionId],
    queryFn: () => apiFetch<TransactionDto>(`/transactions/${transactionId}`),
    enabled: Boolean(transactionId),
  });

  const t = detail.data;
  const peutRegulariser =
    t !== undefined &&
    t.statut === StatutTransaction.LITIGE &&
    user !== null &&
    (estLitigeInterne(t)
      ? ROLES_REGULARISATION_LITIGE_INTERNE.includes(user.role)
      : ROLES_REGULARISATION_LITIGE.includes(user.role));

  if (!transactionId) return <p role="alert">Transaction introuvable.</p>;
  if (detail.isLoading) return <LoadingState label="Chargement de la transaction..." />;
  if (detail.isError || !t) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/transactions')}>
          ← Transactions
        </button>
        <p role="alert">Impossible de charger cette transaction (introuvable ou hors périmètre).</p>
      </div>
    );
  }

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            navigate(t.statut === StatutTransaction.LITIGE ? '/litiges' : '/transactions')
          }
        >
          ← {t.statut === StatutTransaction.LITIGE ? 'Litiges' : 'Transactions'}
        </button>
        <TransactionActions transaction={t} onRapprocher={() => setRapprocher(true)} />
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          TX
        </div>
        <div className="client-workspace-hero-main">
          <h1>
            {t.type === TypeTransaction.SORTIE_FONDS
              ? 'Versement vers la trésorerie principale'
              : labelType(t.type)}
          </h1>
          <p className="client-workspace-hero-sub">
            {new Date(t.dateHeure).toLocaleString('fr-FR')}
            {t.caisse?.boutique?.nom ? ` · ${t.caisse.boutique.nom}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={badgeStatut(t.statut)}>{t.statut}</span>
            <InfoTooltip insight={insightStatutTransaction(t.statut)} />
          </div>
        </div>
      </header>

      {t.type === TypeTransaction.SORTIE_FONDS ? (
        <div className="circuit-fonds-wrap">
          <CircuitFondsStepper statutSortie={t.statut} />
          {t.statut === StatutTransaction.EN_TRANSIT &&
          user &&
          ROLES_VALIDATION_CAISSE_CENTRALE.includes(user.role) ? (
            <p className="circuit-fonds-banner" data-testid="daf-reception-banner">
              À réceptionner par le DAF ou le Caissier central — {t.montant} FCFA.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">Montant</div>
          <div className="client-kpi-value client-kpi-value-sm money">{t.montant} FCFA</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Caisse</div>
          <div className="client-kpi-value client-kpi-value-sm">
            {t.caisse ? (
              <Link to={`/caisses/${t.caisseId}`}>{t.caisse.libelle ?? t.caisseId.slice(0, 8)}</Link>
            ) : (
              t.caisseId.slice(0, 8)
            )}
          </div>
          <div className="client-kpi-hint">{t.caisse?.boutique?.nom ?? '—'}</div>
        </article>
      </div>

      {t.bordereau && (
        <section className="client-workspace-section">
          <div className="client-workspace-section-header">
            <h2>Bordereau</h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                void apiDownload(
                  `/transactions/${t.id}/bordereau/pdf`,
                  `bordereau-versement-${t.id}.pdf`,
                )
              }
            >
              <Printer size={14} /> Imprimer le bordereau
            </button>
          </div>
          <dl className="clients-dl">
            <div>
              <dt>Déclaré</dt>
              <dd className="money">{t.bordereau.montantDeclare} FCFA</dd>
            </div>
            <div>
              <dt>Émis</dt>
              <dd>{new Date(t.bordereau.dateEmission).toLocaleString('fr-FR')}</dd>
            </div>
            {t.bordereau.reception ? (
              <>
                <div>
                  <dt>Reçu</dt>
                  <dd className="money">{t.bordereau.reception.montantRecu} FCFA</dd>
                </div>
                <div>
                  <dt>Écart</dt>
                  <dd className="money">{t.bordereau.reception.ecart} FCFA</dd>
                </div>
                <div>
                  <dt>Statut final</dt>
                  <dd>{t.bordereau.reception.statutFinal}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>
      )}

      {t.contreparties && t.contreparties.length > 0 && (
        <section className="client-workspace-section">
          <h2>Contrepartie centrale</h2>
          <ul>
            {t.contreparties.map((c) => (
              <li key={c.id}>
                <Link to={`/transactions/${c.id}`}>
                  {c.montant} FCFA · {c.statut}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {t.regularisation && (
        <section className="client-workspace-section">
          <h2>Régularisation</h2>
          <dl className="clients-dl">
            <div>
              <dt>Montant retenu</dt>
              <dd className="money">{t.regularisation.montantRetenu} FCFA</dd>
            </div>
            <div>
              <dt>Motif</dt>
              <dd>{t.regularisation.motif}</dd>
            </div>
            <div>
              <dt>Régularisée le</dt>
              <dd>{new Date(t.regularisation.dateRegularisation).toLocaleString('fr-FR')}</dd>
            </div>
          </dl>
        </section>
      )}

      {peutRegulariser ? <RegulariserForm transaction={t} /> : null}

      <Modal open={rapprocher} onClose={() => setRapprocher(false)} title="Rapprochement">
        <RapprocherForm transaction={t} onSuccess={() => setRapprocher(false)} />
      </Modal>
    </div>
  );
}
