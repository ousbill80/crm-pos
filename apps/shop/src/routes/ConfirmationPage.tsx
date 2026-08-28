import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatFcfa, shopFetch } from '../lib/api';
import { labelStatut } from '../lib/commandeLabels';

type StatutPayload = {
  id: string;
  reference?: string;
  statut: string;
  montantTotal?: number;
  suiviToken?: string | null;
  modeReglement?: string;
};

const PAYE_OU_PLUS = new Set([
  'PAYEE',
  'PREPARATION',
  'PRETE',
  'EXPEDIEE',
  'LIVREE',
  'REMISE',
]);

export default function ConfirmationPage() {
  const [params] = useSearchParams();
  const commandeId = params.get('commandeId');
  const ref = params.get('ref');
  const tokenParam = params.get('token');
  const sandbox = params.get('sandbox') === '1';
  const lookup = commandeId || ref;
  const sandboxTried = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!sandbox || !lookup || sandboxTried.current) return;
    sandboxTried.current = true;
    void shopFetch(`/shop/commandes/${lookup}/sandbox-confirmer`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
      .then(() => qc.invalidateQueries({ queryKey: ['statut', lookup] }))
      .catch(() => undefined);
  }, [sandbox, lookup, qc]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['statut', lookup],
    queryFn: () =>
      shopFetch<StatutPayload>(`/shop/commandes/${lookup}/statut`),
    enabled: !!lookup,
    refetchInterval: (q) => {
      const s = q.state.data?.statut;
      if (!s || s === 'EN_ATTENTE_PAIEMENT') return 2500;
      return false;
    },
  });

  const statut = data?.statut;
  const suiviToken = tokenParam || data?.suiviToken || '';
  const waitingPay =
    !statut ||
    statut === 'EN_ATTENTE_PAIEMENT' ||
    (isLoading && !!lookup);
  const confirmed = statut ? PAYE_OU_PLUS.has(statut) : false;
  const failed =
    statut === 'ANNULEE' || statut === 'REMBOURSEE' || statut === 'LITIGE';
  const deferredOk =
    statut === 'PREPARATION' && data?.modeReglement !== 'PREPAYE_PSP';

  let kicker = 'Commande';
  let title = 'Traitement en cours…';
  let lead = 'Nous vérifions l’état de votre commande.';
  let hint =
    'Cette page se met à jour automatiquement. Ne fermez pas tout de suite si vous revenez d’un paiement en ligne.';

  if (isError) {
    title = 'Commande introuvable';
    lead = 'Le lien de confirmation est invalide ou expiré.';
    hint = 'Retrouvez vos commandes dans Mon compte ou contactez le support.';
  } else if (failed) {
    kicker = 'Attention';
    title =
      statut === 'REMBOURSEE' ? 'Commande remboursée' : 'Commande annulée';
    lead = `Statut : ${labelStatut(statut!)}`;
    hint = 'Aucun débit ne sera conservé pour cette commande.';
  } else if (waitingPay && !deferredOk) {
    kicker = 'Paiement';
    title = 'Paiement en cours…';
    lead =
      'Votre commande est enregistrée. Le paiement n’est pas encore confirmé par le prestataire.';
    hint =
      'Dès que le statut passe à « Payée », vous recevrez un e-mail de confirmation et de remerciement. Cette page se rafraîchit automatiquement.';
  } else if (confirmed || deferredOk) {
    kicker = 'Merci';
    title = 'Votre commande est confirmée';
    lead = `Statut : ${labelStatut(statut!)}${
      data?.reference ? ` · Réf. ${data.reference}` : ''
    }${
      data?.montantTotal != null
        ? ` · ${formatFcfa(data.montantTotal)}`
        : ''
    }`;
    hint =
      'Un e-mail de confirmation vous a été envoyé. Merci pour votre confiance — nous vous tiendrons informé jusqu’à la livraison.';
  }

  return (
    <div className="checkout-shell">
      <header className="checkout-top">
        <Link to="/" className="checkout-brand" aria-label="MAJOR AUTO PARTS">
          <span className="brand-major">MAJOR</span>
          <span className="brand-auto">AUTO PARTS</span>
        </Link>
        <p className="checkout-secure">
          {waitingPay && !failed ? 'Paiement sécurisé' : 'Commande enregistrée'}
        </p>
      </header>

      <div
        className={`checkout-confirm ${waitingPay && !failed ? 'is-pending' : ''} ${confirmed || deferredOk ? 'is-ok' : ''}`}
      >
        <div
          className={`checkout-confirm-icon ${waitingPay && !failed ? 'is-spin' : ''}`}
          aria-hidden
        >
          {failed ? '!' : confirmed || deferredOk ? '✓' : '…'}
        </div>
        <p className="checkout-confirm-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="checkout-confirm-lead">{lead}</p>
        <p className="muted">{hint}</p>
        <div className="checkout-confirm-actions">
          {suiviToken && (confirmed || deferredOk) && (
            <Link className="btn" to={`/suivi/${suiviToken}`}>
              Suivre ma commande
            </Link>
          )}
          <Link className="btn btn-ghost" to="/catalogue">
            Continuer vos achats
          </Link>
        </div>
      </div>
    </div>
  );
}
