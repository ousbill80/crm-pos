import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatFcfa, shopFetch } from '../lib/api';

export default function PanierPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['panier'],
    queryFn: () =>
      shopFetch<{
        lignes: Array<{
          designation: string;
          quantite: number;
          montantLigne?: number;
        }>;
        montantTotal: number;
      }>('/shop/panier'),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="section">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  if (isError || !data?.lignes?.length) {
    return (
      <div className="section">
        <h1 className="page-title">PANIER</h1>
        <p className="page-lead">Votre panier est vide.</p>
        <Link className="btn" to="/catalogue">
          Continuer vos achats
        </Link>
      </div>
    );
  }

  return (
    <div className="section" style={{ maxWidth: 760 }}>
      <h1 className="page-title">PANIER</h1>
      <p className="page-lead">Vérifiez vos articles avant commande</p>
      <div className="panel">
        <ul className="stack-list">
          {data.lignes.map((l, i) => (
            <li key={i}>
              <span>
                {l.designation} × {l.quantite}
              </span>
              {l.montantLigne != null && (
                <strong>{formatFcfa(l.montantLigne)}</strong>
              )}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: '1.25rem', marginBottom: '1.35rem' }}>
          <strong>Total : {formatFcfa(data.montantTotal)}</strong>
        </p>
        <Link className="btn" to="/checkout">
          Passer commande
        </Link>
      </div>
    </div>
  );
}
