import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightCouvertureJours,
  insightSanteStock,
  insightStockQuantite,
  insightValeurInventaire,
} from '../lib/insights/stocks';
import type {
  EntrepotDto,
  InventairePrioriteDto,
  MouvementStockDto,
  StatutStockLigne,
  StockSyntheseDto,
} from '../lib/types';

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

const STATUT_LABEL: Record<StatutStockLigne, string> = {
  RUPTURE: 'Rupture',
  SOUS_SEUIL: 'Sous seuil',
  OK: 'OK',
};

function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

export function EntrepotDetailPage() {
  const { entrepotId } = useParams<{ entrepotId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);

  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const synthese = useQuery({
    queryKey: ['stocks-synthese', entrepotId],
    queryFn: () =>
      apiFetch<StockSyntheseDto>(`/stocks/synthese?entrepotId=${entrepotId}`),
    enabled: peutLire && Boolean(entrepotId),
  });
  const mouvements = useQuery({
    queryKey: ['stocks-mouvements', entrepotId],
    queryFn: () =>
      apiFetch<MouvementStockDto[]>(`/stocks/mouvements?entrepotId=${entrepotId}`),
    enabled: peutLire && Boolean(entrepotId),
  });
  const priorites = useQuery({
    queryKey: ['inventaires-priorites'],
    queryFn: () => apiFetch<InventairePrioriteDto[]>('/inventaires/priorites'),
    enabled: peutLire,
  });

  const entrepot = useMemo(
    () => (entrepots.data ?? []).find((e) => e.id === entrepotId),
    [entrepots.data, entrepotId],
  );
  const stats = synthese.data?.parEntrepot.find((e) => e.entrepotId === entrepotId);
  const priorite = (priorites.data ?? []).find((p) => p.entrepotId === entrepotId);
  const lignes = synthese.data?.lignes ?? [];

  if (!entrepotId) {
    return <p role="alert">Entrepôt introuvable.</p>;
  }
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux stocks.</p>;
  if (entrepots.isLoading || synthese.isLoading) {
    return <LoadingState label="Chargement de l’entrepôt..." />;
  }
  if (!entrepot) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/stocks')}>
          ← Stocks
        </button>
        <p role="alert">Entrepôt hors périmètre ou introuvable.</p>
      </div>
    );
  }

  const sante = synthese.data?.sante ?? 'OK';

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/stocks')}>
          ← Stocks
        </button>
        <div className="client-workspace-toolbar-actions">
          <Link
            to={`/inventaires?ouvrir=1&entrepotId=${entrepotId}`}
            className="stock-row-link"
          >
            Inventaire physique
          </Link>
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          {entrepot.code.slice(0, 2).toUpperCase()}
        </div>
        <div className="client-workspace-hero-main">
          <h1>{entrepot.nom}</h1>
          <p className="client-workspace-hero-sub">
            {entrepot.code} · {entrepot.boutique?.nom ?? '—'}
          </p>
          <div className="client-workspace-chips">
            <span className="badge badge-neutral">
              {entrepot.type === 'PRINCIPAL' ? 'Principal' : 'Secondaire'}
            </span>
            {entrepot.actif ? (
              <span className="badge badge-ok">Actif</span>
            ) : (
              <span className="badge badge-neutral">Inactif</span>
            )}
            {priorite?.aInventorier ? (
              <span className="badge badge-warning">À inventorier</span>
            ) : (
              <span className="badge badge-ok">Inventaire à jour</span>
            )}
            {synthese.data && (
              <InfoTooltip
                insight={insightSanteStock(
                  sante,
                  synthese.data.kpis.ruptures,
                  synthese.data.kpis.sousSeuil,
                )}
              />
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Valeur CMP</strong> {formatFcfa(stats?.valeur ?? 0)}
            </span>
            <span>
              <strong>Unités</strong> {stats?.unites ?? 0}
            </span>
            {priorite?.dernierInventaireAt ? (
              <span>
                <strong>Dernier inventaire</strong>{' '}
                {new Date(priorite.dernierInventaireAt).toLocaleDateString('fr-FR')}
                {priorite.joursDepuis !== null ? ` (${priorite.joursDepuis} j)` : ''}
              </span>
            ) : (
              <span>
                <strong>Dernier inventaire</strong> jamais
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Valeur
            {synthese.data && (
              <InfoTooltip
                insight={insightValeurInventaire(
                  synthese.data.kpis.valeurStock,
                  synthese.data.kpis.unitesTotales,
                  synthese.data.kpis.skuDistincts,
                )}
              />
            )}
          </div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {formatFcfa(stats?.valeur ?? 0)}
          </div>
          <div className="client-kpi-hint">{synthese.data?.kpis.skuDistincts ?? 0} SKU</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Ruptures</div>
          <div className="client-kpi-value">{stats?.ruptures ?? 0}</div>
          <div className="client-kpi-hint">emplacements à 0</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Sous le seuil</div>
          <div className="client-kpi-value">{stats?.sousSeuil ?? 0}</div>
          <div className="client-kpi-hint">réappro à planifier</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Couverture
            {synthese.data && (
              <InfoTooltip
                insight={insightCouvertureJours(
                  synthese.data.kpis.couvertureJoursMediane,
                  synthese.data.fenetreVentesJours,
                )}
              />
            )}
          </div>
          <div className="client-kpi-value client-kpi-value-sm">
            {synthese.data?.kpis.couvertureJoursMediane == null
              ? '—'
              : `${synthese.data.kpis.couvertureJoursMediane} j`}
          </div>
          <div className="client-kpi-hint">médiane {synthese.data?.fenetreVentesJours ?? 14} j</div>
        </article>
      </div>

      <section className="client-workspace-section">
        <h2>Niveaux dans cet entrepôt</h2>
        {lignes.length === 0 ? (
          <p className="lead">Aucun produit affecté à cet entrepôt.</p>
        ) : (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Statut</th>
                  <th>Qté</th>
                  <th>Seuil</th>
                  <th>Valeur</th>
                  <th>Couverture</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const cell = l.parEntrepot.find((c) => c.entrepotId === entrepotId);
                  return (
                    <tr
                      key={l.produitId}
                      className="produit-row"
                      tabIndex={0}
                      role="link"
                      onClick={() => navigate(`/produits/${l.produitId}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/produits/${l.produitId}`);
                        }
                      }}
                    >
                      <td>
                        <strong>{l.designation}</strong>
                        <div className="kpi-hint" style={{ margin: 0 }}>
                          {l.reference ?? 'Sans réf.'}
                          {l.categorie ? ` · ${l.categorie}` : ''}
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            (cell?.statut ?? l.statut) === 'RUPTURE'
                              ? 'badge badge-critical'
                              : (cell?.statut ?? l.statut) === 'SOUS_SEUIL'
                                ? 'badge badge-warning'
                                : 'badge badge-ok'
                          }
                        >
                          {STATUT_LABEL[cell?.statut ?? l.statut]}
                        </span>
                      </td>
                      <td>
                        {cell?.quantite ?? 0}
                        <InfoTooltip
                          insight={insightStockQuantite(
                            cell?.quantite ?? 0,
                            l.seuilReappro,
                          )}
                        />
                      </td>
                      <td>{l.seuilReappro ?? '—'}</td>
                      <td className="money">{formatFcfa(l.valeur)}</td>
                      <td>
                        {l.couvertureJours === null ? '—' : `${l.couvertureJours} j`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="client-workspace-section">
        <h2>Mouvements récents</h2>
        {mouvements.isLoading && <LoadingState label="Chargement des mouvements..." />}
        {mouvements.data && mouvements.data.length === 0 && (
          <p className="lead">Aucun mouvement sur cet entrepôt.</p>
        )}
        {mouvements.data && mouvements.data.length > 0 && (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Produit</th>
                  <th>Δ</th>
                  <th>Après</th>
                  <th>Par</th>
                </tr>
              </thead>
              <tbody>
                {mouvements.data.slice(0, 30).map((m) => (
                  <tr
                    key={m.id}
                    className="produit-row"
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/stocks/mouvements/${m.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/stocks/mouvements/${m.id}`);
                      }
                    }}
                  >
                    <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
                    <td>{TYPE_MOUVEMENT[m.type]}</td>
                    <td>{m.produit?.designation ?? m.produitId.slice(0, 8)}</td>
                    <td className={m.quantite < 0 ? 'stock-delta-neg' : 'stock-delta-pos'}>
                      {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                    </td>
                    <td>{m.stockApres}</td>
                    <td>
                      {m.utilisateur
                        ? `${m.utilisateur.prenom} ${m.utilisateur.nom}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
