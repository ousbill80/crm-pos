import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { shopFetch } from '../lib/api';

type AvisPayload = {
  token: string;
  note: number | null;
  commentaire: string | null;
  dejaSoumis: boolean;
  commande: { reference: string; statut: string };
};

export default function AvisPage() {
  const { token } = useParams();
  const [note, setNote] = useState(5);
  const [commentaire, setCommentaire] = useState('');
  const [done, setDone] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['avis', token],
    queryFn: () => shopFetch<AvisPayload>(`/shop/avis/${token}`),
    enabled: !!token,
  });

  const submit = useMutation({
    mutationFn: () =>
      shopFetch(`/shop/avis/${token}`, {
        method: 'POST',
        body: JSON.stringify({ note, commentaire: commentaire || undefined }),
      }),
    onSuccess: () => setDone(true),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  if (isLoading) {
    return (
      <div className="section" style={{ maxWidth: 480 }}>
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="section" style={{ maxWidth: 480 }}>
        <h1 className="page-title">Avis</h1>
        <p className="muted">Lien d’avis invalide ou expiré.</p>
        <Link className="btn" to="/">
          Accueil
        </Link>
      </div>
    );
  }

  if (done || data.dejaSoumis) {
    return (
      <div className="section" style={{ maxWidth: 480 }}>
        <h1 className="page-title">Merci</h1>
        <p className="page-lead">
          Votre avis sur la commande <strong>{data.commande.reference}</strong>{' '}
          a bien été enregistré. À bientôt chez MAJOR AUTO PARTS.
        </p>
        <Link className="btn" to="/catalogue">
          Continuer vos achats
        </Link>
      </div>
    );
  }

  return (
    <div className="section" style={{ maxWidth: 480 }}>
      <h1 className="page-title">Votre avis</h1>
      <p className="page-lead">
        Commande <strong>{data.commande.reference}</strong> — notez notre
        service (1 à 5).
      </p>
      <form className="panel stack" onSubmit={onSubmit}>
        <div className="avis-stars" role="radiogroup" aria-label="Note">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`avis-star ${note >= n ? 'is-on' : ''}`}
              onClick={() => setNote(n)}
              aria-pressed={note === n}
            >
              {n}
            </button>
          ))}
        </div>
        <label className="checkout-field">
          <span>Commentaire (optionnel)</span>
          <textarea
            rows={3}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Livraison, accueil, qualité…"
          />
        </label>
        {submit.isError && (
          <p className="checkout-error" role="alert">
            {(submit.error as Error).message}
          </p>
        )}
        <button type="submit" className="btn" disabled={submit.isPending}>
          {submit.isPending ? 'Envoi…' : 'Envoyer mon avis'}
        </button>
      </form>
    </div>
  );
}
