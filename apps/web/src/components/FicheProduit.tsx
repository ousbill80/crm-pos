import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LoadingState } from './LoadingState';
import { InfoTooltip } from './InfoTooltip';
import {
  insightCouverture,
  insightMargeUnitaire,
  insightStatutProduit,
  insightSuggestionReappro,
} from '../lib/insights/produits';
import type {
  MouvementStockDto,
  ProduitAnalyseDto,
  ProduitDto,
  ProduitVenteDto,
  StatutStock,
} from '../lib/types';

type OngletFiche = 'apercu' | 'identite' | 'stock' | 'ventes' | 'mouvements';

const CATEGORIES_SUGGEREES = [
  'Protection',
  'Charge',
  'Audio',
  'Câbles',
  'Accessoires',
  'Café-Market',
  'Autre',
];

const STATUT_LABEL: Record<StatutStock, string> = {
  RUPTURE: 'Rupture',
  SOUS_SEUIL: 'Sous seuil',
  OK: 'OK',
};

const STATUT_BADGE: Record<StatutStock, string> = {
  RUPTURE: 'badge badge-critical',
  SOUS_SEUIL: 'badge badge-warning',
  OK: 'badge badge-ok',
};

const MOUVEMENT_LABEL: Record<MouvementStockDto['type'], string> = {
  RECEPTION: 'Réception',
  VENTE: 'Vente',
  RETOUR: 'Retour',
  AJUSTEMENT: 'Ajustement',
  TRANSFERT_OUT: 'Transfert sortant',
  TRANSFERT_IN: 'Transfert entrant',
};

function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function useAnalyse(produitId: string) {
  return useQuery({
    queryKey: ['produits', produitId, 'analyse'],
    queryFn: () => apiFetch<ProduitAnalyseDto>(`/produits/${produitId}/analyse`),
  });
}

function useVentes(produitId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['produits', produitId, 'ventes'],
    queryFn: () => apiFetch<ProduitVenteDto[]>(`/produits/${produitId}/ventes`),
    enabled,
  });
}

function useMouvements(produitId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['produits', produitId, 'mouvements'],
    queryFn: () => apiFetch<MouvementStockDto[]>(`/produits/${produitId}/mouvements`),
    enabled,
  });
}

function IdentiteForm({
  produit,
  onDone,
}: {
  produit: ProduitDto;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [designation, setDesignation] = useState(produit.designation);
  const [reference, setReference] = useState(produit.reference ?? '');
  const [categorie, setCategorie] = useState(produit.categorie ?? '');
  const [description, setDescription] = useState(produit.description ?? '');
  const [prixUnitaire, setPrixUnitaire] = useState(String(Number(produit.prixUnitaire)));
  const [seuilReappro, setSeuilReappro] = useState(
    produit.seuilReappro !== null ? String(produit.seuilReappro) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>(`/produits/${produit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          designation,
          reference: reference.trim() === '' ? null : reference.trim(),
          categorie: categorie.trim() === '' ? null : categorie.trim(),
          description: description.trim() === '' ? null : description.trim(),
          prixUnitaire: Number(prixUnitaire),
          seuilReappro: seuilReappro === '' ? null : Number(seuilReappro),
        }),
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-synthese'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-categories'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-classement'] });
      onDone();
    },
    onError: () => setError('Échec de la mise à jour du produit.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="client-fiche-form" onSubmit={handleSubmit}>
      <datalist id="categories-suggerees-fiche">
        {CATEGORIES_SUGGEREES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <label htmlFor="fiche-designation">Désignation</label>
      <input
        id="fiche-designation"
        value={designation}
        onChange={(e) => setDesignation(e.target.value)}
        required
      />
      <label htmlFor="fiche-reference">Référence / SKU</label>
      <input
        id="fiche-reference"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="COQ-IP-SIL"
      />
      <label htmlFor="fiche-categorie">Catégorie</label>
      <input
        id="fiche-categorie"
        list="categories-suggerees-fiche"
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
      />
      <label htmlFor="fiche-description">Description</label>
      <textarea
        id="fiche-description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label htmlFor="fiche-prix">Prix unitaire (FCFA)</label>
      <input
        id="fiche-prix"
        type="number"
        min="0.01"
        step="0.01"
        value={prixUnitaire}
        onChange={(e) => setPrixUnitaire(e.target.value)}
        required
      />
      <p className="lead">
        Le stock ne s’édite pas ici — passer par <Link to="/stocks">Stocks</Link> ou{' '}
        <Link to="/fournisseurs">Fournisseurs</Link>.
      </p>
      <label htmlFor="fiche-seuil">Seuil de réapprovisionnement</label>
      <input
        id="fiche-seuil"
        type="number"
        min="0"
        step="1"
        value={seuilReappro}
        onChange={(e) => setSeuilReappro(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <div className="table-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function VentesSection({ produitId }: { produitId: string }) {
  const { data: ventes, isLoading, isError } = useVentes(produitId, true);
  if (isLoading) return <LoadingState label="Chargement des ventes..." />;
  if (isError) return <p role="alert">Erreur lors du chargement des ventes.</p>;
  if (!ventes || ventes.length === 0) {
    return <p className="lead">Aucune vente enregistrée pour ce produit.</p>;
  }
  return (
    <div className="clients-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Boutique</th>
            <th>Qté</th>
            <th>Prix</th>
            <th>Montant</th>
          </tr>
        </thead>
        <tbody>
          {ventes.map((v) => (
            <tr key={v.ligneId}>
              <td>{new Date(v.dateVente).toLocaleString('fr-FR')}</td>
              <td>{v.boutique ?? '—'}</td>
              <td>{v.quantite}</td>
              <td className="money">{formatFcfa(v.prixUnitaire)}</td>
              <td className="money">{formatFcfa(v.montant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MouvementsSection({ produitId }: { produitId: string }) {
  const { data: mouvements, isLoading, isError } = useMouvements(produitId, true);
  if (isLoading) return <LoadingState label="Chargement des mouvements..." />;
  if (isError) return <p role="alert">Erreur lors du chargement des mouvements.</p>;
  if (!mouvements || mouvements.length === 0) {
    return <p className="lead">Aucun mouvement de stock enregistré.</p>;
  }
  return (
    <div className="clients-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Entrepôt</th>
            <th>Quantité</th>
            <th>Stock après</th>
          </tr>
        </thead>
        <tbody>
          {mouvements.map((m) => (
            <tr key={m.id}>
              <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
              <td>{MOUVEMENT_LABEL[m.type] ?? m.type}</td>
              <td>{m.entrepot?.nom ?? '—'}</td>
              <td>{m.quantite}</td>
              <td>{m.stockApres}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FicheProduit({
  produitId,
  peutGerer,
  onBack,
}: {
  produitId: string;
  peutGerer: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAnalyse(produitId);
  const [onglet, setOnglet] = useState<OngletFiche>('apercu');
  const [edition, setEdition] = useState(false);

  const toggleActif = useMutation({
    mutationFn: (actif: boolean) =>
      apiFetch<ProduitDto>(`/produits/${produitId}`, {
        method: 'PATCH',
        body: JSON.stringify({ actif }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-synthese'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-classement'] });
    },
  });

  if (isLoading) return <LoadingState label="Chargement de la fiche..." />;
  if (isError || !data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Retour au catalogue
        </button>
        <p role="alert">Impossible de charger la fiche produit.</p>
      </div>
    );
  }

  const { produit, repartitionStock, performance30j, suggestionReappro } = data;
  const initiales = produit.designation.slice(0, 2).toUpperCase();

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Catalogue
        </button>
        <div className="client-workspace-toolbar-actions">
          {peutGerer && (
            <>
              {onglet === 'identite' && !edition && (
                <button type="button" className="btn-primary" onClick={() => setEdition(true)}>
                  Modifier
                </button>
              )}
              <button
                type="button"
                disabled={toggleActif.isPending}
                onClick={() => toggleActif.mutate(!produit.actif)}
              >
                {produit.actif ? 'Désactiver' : 'Réactiver'}
              </button>
            </>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          {initiales || <Package size={28} />}
        </div>
        <div className="client-workspace-hero-main">
          <h1>{produit.designation}</h1>
          <p className="client-workspace-hero-sub">
            {produit.reference ?? 'Sans référence'}
            {produit.categorie ? ` · ${produit.categorie}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={STATUT_BADGE[produit.statutStock]}>
              {STATUT_LABEL[produit.statutStock]}
            </span>
            <InfoTooltip
              insight={insightStatutProduit(
                produit.stock,
                produit.seuilReappro,
                produit.actif,
              )}
            />
            {!produit.actif && <span className="badge badge-neutral">Inactif</span>}
            {produit.categorie && (
              <span className="badge badge-neutral">{produit.categorie}</span>
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Prix</strong> {formatFcfa(produit.prixUnitaire)}
            </span>
            <span>
              <strong>Stock réseau</strong> {produit.stock}
              {produit.seuilReappro !== null ? ` (seuil ${produit.seuilReappro})` : ''}
            </span>
            <span>
              <strong>Marge</strong> {produit.tauxMarge} %
            </span>
          </div>
        </div>
      </header>

      <nav className="client-workspace-tabs" aria-label="Sections fiche produit">
        {(
          [
            ['apercu', "Vue d'ensemble"],
            ['identite', 'Fiche'],
            ['stock', 'Stock'],
            ['ventes', 'Ventes'],
            ['mouvements', 'Mouvements'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={onglet === id ? 'actif' : ''}
            onClick={() => {
              setOnglet(id);
              setEdition(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="client-workspace-panel" aria-live="polite">
        {onglet === 'apercu' && (
          <div className="client-workspace-section">
            <h2>Indicateurs</h2>
            <div className="client-kpi-grid">
              <article className="client-kpi-card">
                <div className="client-kpi-label">Prix de vente</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {formatFcfa(produit.prixUnitaire)}
                </div>
                <div className="client-kpi-hint">catalogue</div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">
                  Marge unitaire
                  <InfoTooltip
                    insight={insightMargeUnitaire(
                      produit.margeUnitaire,
                      produit.tauxMarge,
                      produit.coutMoyenPondere,
                    )}
                  />
                </div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {formatFcfa(produit.margeUnitaire)}
                </div>
                <div className="client-kpi-hint">{produit.tauxMarge} % · CMP {formatFcfa(produit.coutMoyenPondere)}</div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">Stock réseau</div>
                <div className="client-kpi-value">{produit.stock}</div>
                <div className="client-kpi-hint">{formatFcfa(produit.valeurStock)} au CMP</div>
              </article>
              <article className="client-kpi-card">
                <div className="client-kpi-label">
                  Couverture
                  <InfoTooltip
                    insight={insightCouverture(
                      performance30j.joursCouverture,
                      performance30j.quantiteVendue,
                    )}
                  />
                </div>
                <div className="client-kpi-value client-kpi-value-sm">
                  {performance30j.joursCouverture !== null
                    ? `${performance30j.joursCouverture} j`
                    : '—'}
                </div>
                <div className="client-kpi-hint">
                  {performance30j.quantiteVendue} u. vendues / 30 j
                </div>
              </article>
            </div>

            {suggestionReappro.necessaire && (
              <div className="produits-callout" style={{ marginTop: 16 }}>
                <strong>Réappro : {suggestionReappro.quantiteSuggeree} unité(s)</strong>
                <InfoTooltip insight={insightSuggestionReappro(suggestionReappro)} />
                <p>{suggestionReappro.motif}</p>
                <div className="table-actions">
                  <Link to="/fournisseurs">Réception fournisseur</Link>
                  <Link to="/stocks">Transfert / stocks</Link>
                </div>
              </div>
            )}

            <div className="client-workspace-split">
              <div className="panel client-workspace-card">
                <h3>Performance 30 jours</h3>
                <dl className="clients-dl">
                  <div>
                    <dt>Quantité nette</dt>
                    <dd>{performance30j.quantiteVendue}</dd>
                  </div>
                  <div>
                    <dt>CA net</dt>
                    <dd className="money">{formatFcfa(performance30j.chiffreAffaires)}</dd>
                  </div>
                  <div>
                    <dt>Coût des ventes</dt>
                    <dd className="money">{formatFcfa(performance30j.coutDesVentes)}</dd>
                  </div>
                  <div>
                    <dt>Marge brute</dt>
                    <dd className="money">{formatFcfa(performance30j.margeBrute)}</dd>
                  </div>
                </dl>
              </div>
              <div className="panel client-workspace-card">
                <h3>Répartition stock</h3>
                {repartitionStock.length === 0 ? (
                  <p className="lead">Aucune quantité affectée à un entrepôt.</p>
                ) : (
                  <ul className="produits-repartition">
                    {repartitionStock.map((q) => (
                      <li key={q.entrepotId}>
                        <span>
                          {q.nom} <small>{q.code}</small>
                        </span>
                        <strong>{q.quantite}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {onglet === 'identite' && (
          <div className="client-workspace-section">
            <h2>Fiche catalogue</h2>
            {edition && peutGerer ? (
              <IdentiteForm produit={produit} onDone={() => setEdition(false)} />
            ) : (
              <>
                {produit.description && <p>{produit.description}</p>}
                <dl className="clients-dl">
                  <div>
                    <dt>Désignation</dt>
                    <dd>{produit.designation}</dd>
                  </div>
                  <div>
                    <dt>Référence</dt>
                    <dd>{produit.reference ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Catégorie</dt>
                    <dd>{produit.categorie ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>État</dt>
                    <dd>{produit.actif ? 'Actif' : 'Inactif'}</dd>
                  </div>
                  <div>
                    <dt>Prix de vente</dt>
                    <dd className="money">{formatFcfa(produit.prixUnitaire)}</dd>
                  </div>
                  <div>
                    <dt>CMP</dt>
                    <dd className="money">{formatFcfa(produit.coutMoyenPondere)}</dd>
                  </div>
                  <div>
                    <dt>Seuil réappro</dt>
                    <dd>{produit.seuilReappro ?? 'Non défini'}</dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        )}

        {onglet === 'stock' && (
          <div className="client-workspace-section">
            <h2>Stock par entrepôt</h2>
            {suggestionReappro.necessaire && (
              <div className="produits-callout">
                <strong>Réappro : {suggestionReappro.quantiteSuggeree} unité(s)</strong>
                <InfoTooltip insight={insightSuggestionReappro(suggestionReappro)} />
                <p>{suggestionReappro.motif}</p>
                <div className="table-actions">
                  <Link to="/fournisseurs">Réception fournisseur</Link>
                  <Link to="/stocks">Transfert / stocks</Link>
                </div>
              </div>
            )}
            {repartitionStock.length === 0 ? (
              <p className="lead">Aucune quantité affectée à un entrepôt.</p>
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entrepôt</th>
                      <th>Code</th>
                      <th>Quantité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repartitionStock.map((q) => (
                      <tr key={q.entrepotId}>
                        <td>{q.nom}</td>
                        <td>{q.code}</td>
                        <td>{q.quantite}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="lead" style={{ marginTop: 12 }}>
              Total réseau : {produit.stock} · valeur {formatFcfa(produit.valeurStock)} (CMP)
            </p>
          </div>
        )}

        {onglet === 'ventes' && (
          <div className="client-workspace-section">
            <h2>Historique des ventes</h2>
            <VentesSection produitId={produit.id} />
          </div>
        )}

        {onglet === 'mouvements' && (
          <div className="client-workspace-section">
            <h2>Grand livre stock</h2>
            <MouvementsSection produitId={produit.id} />
          </div>
        )}
      </section>
    </div>
  );
}
