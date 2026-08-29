import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatFcfa, shopFetch } from '../lib/api';
import {
  buildTimeline,
  formatDateFr,
  labelFulfillment,
  labelReglement,
  labelStatut,
  prochainGeste,
} from '../lib/commandeLabels';

type SuiviPayload = {
  id: string;
  reference: string;
  statut: string;
  modeFulfillment: string;
  modeReglement: string;
  providerPsp?: string | null;
  montantArticlesTtc: number;
  fraisLivraison: number;
  montantTotal: number;
  numeroSuivi: string | null;
  boutiqueRetrait: { nom: string; adresse: string | null } | null;
  zoneLivraison: { libelle: string; tarif: number } | null;
  adresseLivraison: {
    ligne1: string | null;
    ville: string | null;
    telephone: string | null;
  } | null;
  lignes: Array<{
    designation: string;
    reference: string | null;
    quantite: number;
    prixUnitaireTtc: number;
    montantLigne: number;
  }>;
  createdAt: string;
  payeeAt: string | null;
};

const IN_PROGRESS = new Set([
  'EN_ATTENTE_PAIEMENT',
  'PAYEE',
  'PREPARATION',
  'PRETE',
  'EXPEDIEE',
]);

export default function SuiviPage() {
  const { token } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['suivi', token],
    queryFn: () => shopFetch<SuiviPayload>(`/shop/suivi/${token}`),
    enabled: !!token,
    refetchInterval: (q) => {
      const s = q.state.data?.statut;
      return s && IN_PROGRESS.has(s) ? 4000 : false;
    },
  });

  const payer = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('Commande introuvable');
      const pay = await shopFetch<{ authorizationUrl?: string }>(
        `/shop/commandes/${data.id}/payer`,
        {
          method: 'POST',
          body: JSON.stringify({
            provider: data.providerPsp ?? 'PAYSTACK',
          }),
        },
      );
      if (!pay.authorizationUrl) {
        throw new Error('Impossible d’ouvrir le paiement.');
      }
      window.location.href = pay.authorizationUrl;
    },
  });

  if (isLoading) {
    return (
      <div className="section suivi-page">
        <p className="muted">Chargement du suivi…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="section suivi-page">
        <p className="suivi-kicker">Suivi commande</p>
        <h1 className="page-title">Lien invalide</h1>
        <p className="page-lead">
          Cette commande est introuvable. Vérifiez le lien reçu par e-mail.
        </p>
      </div>
    );
  }

  const steps = buildTimeline(
    data.statut,
    data.modeFulfillment,
    data.modeReglement,
  );
  const geste = prochainGeste(
    data.statut,
    data.modeFulfillment,
    data.modeReglement,
  );
  const lieu =
    data.modeFulfillment === 'RETRAIT_BOUTIQUE'
      ? [data.boutiqueRetrait?.nom, data.boutiqueRetrait?.adresse]
          .filter(Boolean)
          .join(' — ')
      : [
          data.adresseLivraison?.ligne1,
          data.adresseLivraison?.ville,
          data.zoneLivraison?.libelle,
        ]
          .filter(Boolean)
          .join(', ');

  return (
    <div className="section suivi-page">
      <p className="suivi-kicker">Suivi commande · Réf. {data.reference}</p>
      <div className="suivi-head">
        <h1 className="page-title">{geste.titre}</h1>
        <span className={`statut-pill statut-${data.statut}`}>
          {labelStatut(data.statut)}
        </span>
      </div>
      <p className="page-lead">{geste.detail}</p>

      <div className={`suivi-next suivi-next--${geste.variant}`}>
        <p>
          <strong>{labelReglement(data.modeReglement)}</strong>
          <span> · {labelFulfillment(data.modeFulfillment)}</span>
        </p>
        {geste.variant === 'payer' && (
          <button
            type="button"
            className="btn"
            disabled={payer.isPending}
            onClick={() => payer.mutate()}
          >
            {payer.isPending ? 'Ouverture…' : 'Payer maintenant'}
          </button>
        )}
        {payer.isError && (
          <p className="checkout-error" role="alert">
            {(payer.error as Error).message}
          </p>
        )}
      </div>

      <ol className="suivi-timeline" aria-label="Étapes de la commande">
        {steps.map((step) => (
          <li key={step.id} className={`suivi-step is-${step.state}`}>
            <span className="suivi-step-dot" aria-hidden />
            <span className="suivi-step-label">{step.label}</span>
          </li>
        ))}
      </ol>

      {lieu && (
        <div className="panel suivi-lieu">
          <h2>
            {data.modeFulfillment === 'RETRAIT_BOUTIQUE'
              ? 'Retrait'
              : 'Livraison'}
          </h2>
          <p>{lieu}</p>
          {data.numeroSuivi && (
            <p>
              N° colis : <strong>{data.numeroSuivi}</strong>
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <h2 className="suivi-articles-title">Articles</h2>
        <ul className="stack-list">
          {data.lignes.map((l, i) => (
            <li key={`${l.designation}-${i}`}>
              <span>
                {l.designation} × {l.quantite}
              </span>
              <strong>{formatFcfa(l.montantLigne)}</strong>
            </li>
          ))}
        </ul>
        <dl className="suivi-totals">
          <div>
            <dt>Articles</dt>
            <dd>{formatFcfa(data.montantArticlesTtc)}</dd>
          </div>
          <div>
            <dt>Livraison</dt>
            <dd>
              {data.modeFulfillment === 'RETRAIT_BOUTIQUE'
                ? 'Gratuit'
                : formatFcfa(data.fraisLivraison)}
            </dd>
          </div>
          <div className="suivi-total">
            <dt>Total</dt>
            <dd>{formatFcfa(data.montantTotal)}</dd>
          </div>
        </dl>
        <p className="muted suivi-date">
          Commande du {formatDateFr(data.createdAt)}
          {data.payeeAt ? ` · payée le ${formatDateFr(data.payeeAt)}` : ''}
        </p>
      </div>
    </div>
  );
}
