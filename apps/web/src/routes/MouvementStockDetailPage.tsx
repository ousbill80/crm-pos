import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import type { MouvementStockDto } from '../lib/types';

const ROLES_LECTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const TYPE_MOUVEMENT: Record<MouvementStockDto['type'], string> = {
  RECEPTION: 'Réception',
  VENTE: 'Vente',
  RETOUR: 'Retour',
  AJUSTEMENT: 'Ajustement',
  TRANSFERT_OUT: 'Transfert sortie',
  TRANSFERT_IN: 'Transfert entrée',
  SCRAP: 'Rebut',
};

const TYPE_SENS: Record<MouvementStockDto['type'], string> = {
  RECEPTION: 'Entrée — réception fournisseur',
  VENTE: 'Sortie — vente en caisse',
  RETOUR: 'Entrée — retour client',
  AJUSTEMENT: 'Écriture d’ajustement (inventaire ou correction SI)',
  TRANSFERT_OUT: 'Sortie — transfert vers un autre entrepôt',
  TRANSFERT_IN: 'Entrée — transfert depuis un autre entrepôt',
  SCRAP: 'Rebut — contrôle qualité ou mise au rebut',
};

export function MouvementStockDetailPage() {
  const { mouvementId } = useParams<{ mouvementId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stocks-mouvements', mouvementId],
    queryFn: () => apiFetch<MouvementStockDto>(`/stocks/mouvements/${mouvementId}`),
    enabled: peutLire && Boolean(mouvementId),
  });

  if (!mouvementId) return <p role="alert">Mouvement introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux stocks.</p>;
  if (isLoading) return <LoadingState label="Chargement du mouvement..." />;
  if (isError || !data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/stocks')}>
          ← Stocks
        </button>
        <p role="alert">Impossible de charger ce mouvement (introuvable ou hors périmètre).</p>
      </div>
    );
  }

  const stockAvant = data.stockApres - data.quantite;

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/stocks')}>
          ← Journal des stocks
        </button>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          {data.quantite > 0 ? '+' : '−'}
        </div>
        <div className="client-workspace-hero-main">
          <h1>{TYPE_MOUVEMENT[data.type]}</h1>
          <p className="client-workspace-hero-sub">
            {data.produit?.designation ?? data.produitId}
            {data.produit?.reference ? ` · ${data.produit.reference}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span
              className={
                data.type === 'VENTE' || data.type === 'TRANSFERT_OUT'
                  ? 'badge badge-neutral'
                  : data.type === 'AJUSTEMENT'
                    ? 'badge badge-warning'
                    : 'badge badge-ok'
              }
            >
              {TYPE_MOUVEMENT[data.type]}
            </span>
            <span className={data.quantite < 0 ? 'badge badge-critical' : 'badge badge-ok'}>
              {data.quantite > 0 ? `+${data.quantite}` : data.quantite} u.
            </span>
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Date</strong> {new Date(data.dateHeure).toLocaleString('fr-FR')}
            </span>
            <span>
              <strong>Par</strong>{' '}
              {data.utilisateur
                ? `${data.utilisateur.prenom} ${data.utilisateur.nom}`
                : '—'}
            </span>
          </div>
        </div>
      </header>

      <p className="lead">{TYPE_SENS[data.type]}</p>

      <dl className="clients-dl">
        <div>
          <dt>Produit</dt>
          <dd>
            <Link to={`/produits/${data.produitId}`}>
              {data.produit?.designation ?? data.produitId}
            </Link>
          </dd>
        </div>
        <div>
          <dt>Entrepôt</dt>
          <dd>
            {data.entrepotId ? (
              <Link to={`/stocks/entrepots/${data.entrepotId}`}>
                {data.entrepot
                  ? `${data.entrepot.code} — ${data.entrepot.nom}`
                  : data.entrepotId}
              </Link>
            ) : (
              'Non renseigné (mouvement historique)'
            )}
            {data.entrepot?.boutique?.nom ? (
              <div className="kpi-hint" style={{ margin: 0 }}>
                {data.entrepot.boutique.nom}
              </div>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Quantité avant</dt>
          <dd>{stockAvant}</dd>
        </div>
        <div>
          <dt>Mouvement</dt>
          <dd className={data.quantite < 0 ? 'stock-delta-neg' : 'stock-delta-pos'}>
            {data.quantite > 0 ? `+${data.quantite}` : data.quantite}
          </dd>
        </div>
        <div>
          <dt>Stock après (emplacement)</dt>
          <dd>{data.stockApres}</dd>
        </div>
        <div>
          <dt>Référence</dt>
          <dd>{data.reference ?? '—'}</dd>
        </div>
        <div>
          <dt>Opérateur</dt>
          <dd>
            {data.utilisateur
              ? `${data.utilisateur.prenom} ${data.utilisateur.nom}`
              : '—'}
            {data.utilisateur?.login ? (
              <div className="kpi-hint" style={{ margin: 0 }}>
                {data.utilisateur.login}
              </div>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Identifiant</dt>
          <dd>
            <code>{data.id}</code>
          </dd>
        </div>
      </dl>
    </div>
  );
}
