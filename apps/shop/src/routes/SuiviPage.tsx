import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { shopFetch } from '../lib/api';

export default function SuiviPage() {
  const { token } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['suivi', token],
    queryFn: () =>
      shopFetch<{
        statut: string;
        lignes: Array<{ designation: string; quantite: number }>;
      }>(`/shop/suivi/${token}`),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="section">
        <p className="muted">Chargement du suivi…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="section">
        <h1 className="page-title">SUIVI</h1>
        <p className="muted">Commande introuvable.</p>
      </div>
    );
  }

  return (
    <div className="section" style={{ maxWidth: 640 }}>
      <h1 className="page-title">SUIVI</h1>
      <p className="page-lead">Statut : {data.statut}</p>
      <div className="panel">
        <ul className="stack-list">
          {data.lignes.map((l, i) => (
            <li key={i}>
              <span>{l.designation}</span>
              <strong>× {l.quantite}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
