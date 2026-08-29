import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Printer } from 'lucide-react';
import {
  ROLES_MISE_EN_TRANSIT,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../../lib/api';
import { fmtDateHeure, fmtFcfa } from '../../lib/achats-ui';
import { enqueueTransactionInit } from '../../lib/offline/outbox';
import { montantPointJournee } from '../../lib/pos-journee-fermee';
import { useAuth } from '../../context/AuthContext';
import type { CaisseDto, SessionCaisseDto, TransactionDto } from '../../lib/types';
import { CircuitFondsStepper } from '../CircuitFondsStepper';
import { EtatCaissePrint } from './EtatCaissePrint';

const STATUT_LIBELLE: Record<string, string> = {
  [StatutTransaction.INITIEE]: 'Initiée — à mettre en transit',
  [StatutTransaction.EN_TRANSIT]: 'En transit — attente réception DAF / Caissier central',
  [StatutTransaction.RECEPTIONNEE]: 'Réceptionnée — à rapprocher',
  [StatutTransaction.VALIDEE]: 'Validée — fonds à la trésorerie principale',
  [StatutTransaction.LITIGE]: 'Litige — bloqué jusqu’à régularisation',
};

export function PosJourneeFermee({
  session,
  magasin,
  boutiqueNom,
  tiroirLabel,
  caissierLogin,
  peutInitierVersement,
  onOuvrirJournee,
}: {
  session: SessionCaisseDto;
  magasin: CaisseDto | undefined;
  boutiqueNom?: string;
  tiroirLabel: string;
  caissierLogin?: string;
  peutInitierVersement: boolean;
  onOuvrirJournee: () => void;
}) {
  const { user } = useAuth();
  const [vue, setVue] = useState<'accueil' | 'etat'>('accueil');
  const point = montantPointJournee(session);
  const sortieId = session.transactionSortieCentraleId ?? null;
  const peutTransit =
    user !== null && ROLES_MISE_EN_TRANSIT.includes(user.role);

  const sortie = useQuery({
    queryKey: ['transactions', sortieId],
    queryFn: () => apiFetch<TransactionDto>(`/transactions/${sortieId}`),
    enabled: Boolean(sortieId),
  });

  if (vue === 'etat') {
    return (
      <EtatCaissePrint
        sessionId={session.id}
        bordereauId={sortieId ?? session.transactionVersementId}
        onFermer={() => setVue('accueil')}
      />
    );
  }

  return (
    <div className="pos-gate">
      <div
        className="pos-gate-card pos-open-card pos-closed-card"
        data-testid="pos-journee-fermee"
      >
        <p className="pos-closed-badge">Journée clôturée · ventes fermées</p>
        <h1>Fonds du jour</h1>
        <p className="pos-gate-hint">
          {boutiqueNom ? `${boutiqueNom} · ` : ''}
          {tiroirLabel}
          {caissierLogin ? ` · ${caissierLogin}` : ''}
        </p>
        <p className="pos-open-help">
          Le point du jour (espèces comptées moins le fond d’ouverture) part
          vers la trésorerie principale. La boutique initie ; le DAF
          réceptionne et valide — jamais la boutique (§6.4).
        </p>

        {point > 0 || sortieId ? (
          <CircuitFondsStepper
            statutSortie={
              sortie.data?.statut ?? (sortieId ? 'INITIEE' : null)
            }
          />
        ) : null}

        <dl className="pos-closed-recap">
          <div>
            <dt>Clôturée</dt>
            <dd>{fmtDateHeure(session.clotureDateHeure)}</dd>
          </div>
          <div>
            <dt>Point du jour</dt>
            <dd>{fmtFcfa(point)}</dd>
          </div>
          <div>
            <dt>Fond compté</dt>
            <dd>{fmtFcfa(session.fondCompteCloture ?? '0')}</dd>
          </div>
          <div>
            <dt>Fond d’ouverture</dt>
            <dd>{fmtFcfa(session.fondInitial)}</dd>
          </div>
        </dl>

        <section className="pos-closed-treso" aria-label="Versement centrale">
          <h2>
            <Landmark size={16} aria-hidden /> Transfert vers la trésorerie
            principale
          </h2>
          {point <= 0 ? (
            <p className="pos-open-help">
              Aucune espèce nette à verser pour cette journée.
            </p>
          ) : sortieId && sortie.data ? (
            <VersementCentraleStatut
              transaction={sortie.data}
              peutTransit={peutTransit}
            />
          ) : sortieId && sortie.isLoading ? (
            <p className="pos-open-help">Chargement du bordereau…</p>
          ) : peutInitierVersement && magasin ? (
            <InitierVersementPos
              magasin={magasin}
              sessionId={session.id}
              montantPoint={point}
            />
          ) : (
            <p className="pos-closed-note">
              Le versement du point du jour n’est pas encore initié. Un
              caissier ou le responsable boutique peut le lancer depuis ce
              poste.
            </p>
          )}
        </section>

        <div className="pos-closed-actions">
          <button
            type="button"
            className="btn-secondary"
            data-testid="pos-etat-z-btn"
            onClick={() => setVue('etat')}
          >
            <Printer size={16} aria-hidden />
            Tirer l’état de clôture
          </button>
          {session.transactionVersementId ? (
            <Link
              to={`/transactions/${session.transactionVersementId}`}
              className="btn-ghost"
            >
              Transfert tiroir → magasin
            </Link>
          ) : null}
        </div>

        <div className="pos-open-actions">
          <button
            type="button"
            className="btn-secondary"
            data-testid="pos-ouvrir-nouvelle-journee"
            onClick={onOuvrirJournee}
          >
            Ouvrir une nouvelle journée
          </button>
        </div>
        <Link to="/dashboard" className="pos-back-link">
          ← Tableau de bord
        </Link>
      </div>
    </div>
  );
}

function VersementCentraleStatut({
  transaction,
  peutTransit,
}: {
  transaction: TransactionDto;
  peutTransit: boolean;
}) {
  const queryClient = useQueryClient();
  const transit = useMutation({
    mutationFn: () =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/transit`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['transactions', transaction.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  return (
    <div className="pos-closed-actions">
      <p className="pos-closed-montant">{fmtFcfa(transaction.montant)}</p>
      <p className="pos-open-help" data-testid="pos-sortie-statut">
        {STATUT_LIBELLE[transaction.statut] ?? transaction.statut}
      </p>
      {transaction.statut === StatutTransaction.INITIEE && peutTransit ? (
        <button
          type="button"
          className="pos-btn-primary"
          data-testid="pos-sortie-transit"
          disabled={transit.isPending}
          onClick={() => transit.mutate()}
        >
          {transit.isPending ? 'Mise en transit…' : 'Mettre en transit'}
        </button>
      ) : null}
      {transaction.statut === StatutTransaction.INITIEE && !peutTransit ? (
        <p className="pos-closed-note">
          Prochaine étape : le responsable boutique ou le convoyeur met le
          bordereau en transit. Ensuite le DAF (ou le caissier central)
          réceptionne.
        </p>
      ) : null}
      {transaction.statut === StatutTransaction.EN_TRANSIT ? (
        <p className="pos-closed-note">
          En route vers la centrale. Réception et rapprochement : DAF ou
          caissier central — jamais la boutique.
        </p>
      ) : null}
      <Link
        className="btn-secondary"
        to={`/transactions/${transaction.id}`}
        data-testid="pos-sortie-detail"
      >
        Voir le bordereau
      </Link>
    </div>
  );
}

function InitierVersementPos({
  magasin,
  sessionId,
  montantPoint,
}: {
  magasin: CaisseDto;
  sessionId: string;
  montantPoint: number;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (magasin.type !== TypeCaisse.MAGASIN) {
        throw new Error('Caisse magasin introuvable.');
      }
      const payload = {
        caisseId: magasin.id,
        type: TypeTransaction.SORTIE_FONDS as typeof TypeTransaction.SORTIE_FONDS,
        montant: montantPoint,
        sessionCaisseId: sessionId,
        clientOperationId: crypto.randomUUID(),
      };
      if (!navigator.onLine) {
        enqueueTransactionInit({
          caisseId: payload.caisseId,
          type: payload.type,
          montant: payload.montant,
          sessionCaisseId: sessionId,
        });
        return null;
      }
      return apiFetch<TransactionDto>('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['ventes-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: (err) => {
      enqueueTransactionInit({
        caisseId: magasin.id,
        type: TypeTransaction.SORTIE_FONDS,
        montant: montantPoint,
        sessionCaisseId: sessionId,
      });
      setError(
        messageDepuisApi(
          err,
          "Hors ligne ou erreur réseau — versement mis en file d'attente (§6.7).",
        ),
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="stack-form">
      <p className="pos-closed-montant">{fmtFcfa(montantPoint)}</p>
      <p className="lead">
        Montant verrouillé = point du jour. Magasin ·{' '}
        {magasin.libelle ?? magasin.id.slice(0, 8)}. Réception ensuite par le
        DAF (ou le caissier central).
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="submit"
        className="pos-btn-primary pos-btn-transfert"
        data-testid="pos-versement-centrale"
        disabled={mutation.isPending}
      >
        {mutation.isPending
          ? 'Initiation…'
          : 'Transférer vers la trésorerie principale'}
      </button>
    </form>
  );
}
