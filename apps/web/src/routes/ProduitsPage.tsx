import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Package,
  PackageX,
  Scale,
  Wallet,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  buildPrioritesCatalogue,
  insightDormant,
  insightMargeUnitaire,
  insightMeilleureVente,
} from '../lib/insights/produits';
import type {
  ProduitClassementDto,
  ProduitDto,
  ProduitsSyntheseDto,
  StatutStock,
} from '../lib/types';

const ROLES_ADMIN_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_LECTURE_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

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

function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function buildQuery(params: {
  q: string;
  categorie: string;
  statutStock: string;
  actif: string;
  margeNegative: boolean;
}): string {
  const search = new URLSearchParams();
  if (params.q.trim()) search.set('q', params.q.trim());
  if (params.categorie) search.set('categorie', params.categorie);
  if (params.statutStock) search.set('statutStock', params.statutStock);
  if (params.actif) search.set('actif', params.actif);
  if (params.margeNegative) search.set('margeNegative', 'true');
  const qs = search.toString();
  return qs ? `/produits?${qs}` : '/produits';
}

type SortKey = 'designation' | 'prixUnitaire' | 'tauxMarge' | 'stock';

function useProduits(
  enabled: boolean,
  filters: {
    q: string;
    categorie: string;
    statutStock: string;
    actif: string;
    margeNegative: boolean;
  },
) {
  return useQuery({
    queryKey: ['produits', filters],
    queryFn: () => apiFetch<ProduitDto[]>(buildQuery(filters)),
    enabled,
  });
}

function useSynthese(enabled: boolean) {
  return useQuery({
    queryKey: ['produits-synthese'],
    queryFn: () => apiFetch<ProduitsSyntheseDto>('/produits/synthese'),
    enabled,
  });
}

function useCategories(enabled: boolean) {
  return useQuery({
    queryKey: ['produits-categories'],
    queryFn: () => apiFetch<string[]>('/produits/categories'),
    enabled,
  });
}

function useClassement(enabled: boolean) {
  return useQuery({
    queryKey: ['produits-classement'],
    queryFn: () => apiFetch<ProduitClassementDto>('/produits/classement'),
    enabled,
  });
}

function NouveauProduitForm({
  designationsExistantes,
  onSuccess,
}: {
  designationsExistantes: string[];
  onSuccess?: (produit: ProduitDto) => void;
}) {
  const queryClient = useQueryClient();
  const [designation, setDesignation] = useState('');
  const [reference, setReference] = useState('');
  const [categorie, setCategorie] = useState('');
  const [description, setDescription] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('');
  const [stock, setStock] = useState('0');
  const [seuilReappro, setSeuilReappro] = useState('');
  const [error, setError] = useState<string | null>(null);

  const doublon = designationsExistantes.some(
    (d) => d.trim().toLowerCase() === designation.trim().toLowerCase(),
  );

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ProduitDto>('/produits', {
        method: 'POST',
        body: JSON.stringify({
          designation,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(categorie.trim() ? { categorie: categorie.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          prixUnitaire: Number(prixUnitaire),
          stock: Number(stock),
          ...(seuilReappro ? { seuilReappro: Number(seuilReappro) } : {}),
        }),
      }),
    onSuccess: (created) => {
      setDesignation('');
      setReference('');
      setCategorie('');
      setDescription('');
      setPrixUnitaire('');
      setStock('0');
      setSeuilReappro('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-synthese'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-categories'] });
      void queryClient.invalidateQueries({ queryKey: ['produits-classement'] });
      onSuccess?.(created);
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409
          ? 'Cette référence est déjà attribuée à un autre produit.'
          : 'Échec de la création du produit.';
      setError(message);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="modal-form" onSubmit={handleSubmit}>
      <label htmlFor="designation">Désignation</label>
      <input
        id="designation"
        value={designation}
        onChange={(e) => setDesignation(e.target.value)}
        required
      />
      {doublon && (
        <p className="form-hint-warning">
          Un produit porte déjà cette désignation. Vérifiez qu’il ne s’agit pas d’un doublon.
        </p>
      )}
      <label htmlFor="reference">Référence / SKU (optionnel, unique)</label>
      <input
        id="reference"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="COQ-IP-SIL"
      />
      <label htmlFor="categorie">Catégorie</label>
      <input
        id="categorie"
        list="categories-suggerees"
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
        placeholder="Protection, Charge, Audio…"
      />
      <label htmlFor="description">Description (optionnel)</label>
      <textarea
        id="description"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label htmlFor="prixUnitaire">Prix unitaire (FCFA)</label>
      <input
        id="prixUnitaire"
        type="number"
        min="0.01"
        step="0.01"
        value={prixUnitaire}
        onChange={(e) => setPrixUnitaire(e.target.value)}
        required
      />
      <label htmlFor="stock">Stock initial (déposé sur l’entrepôt PRINCIPAL)</label>
      <input
        id="stock"
        type="number"
        min="0"
        step="1"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        required
      />
      <label htmlFor="seuilReappro">Seuil de réapprovisionnement (optionnel)</label>
      <input
        id="seuilReappro"
        type="number"
        min="0"
        step="1"
        value={seuilReappro}
        onChange={(e) => setSeuilReappro(e.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        Créer
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function ProduitsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const peutLire = user !== null && ROLES_LECTURE_STRUCTURE.includes(user.role);
  const peutGerer = user !== null && ROLES_ADMIN_STRUCTURE.includes(user.role);

  const [recherche, setRecherche] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [categorie, setCategorie] = useState('');
  const [statutStock, setStatutStock] = useState('');
  const [actif, setActif] = useState('true');
  const [margeNegative, setMargeNegative] = useState(false);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'designation',
    dir: 'asc',
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setQDebounced(recherche), 300);
    return () => window.clearTimeout(timer);
  }, [recherche]);

  const filters = {
    q: qDebounced,
    categorie,
    statutStock,
    actif,
    margeNegative,
  };
  const { data: produits, isLoading, isError } = useProduits(peutLire, filters);
  const synthese = useSynthese(peutLire);
  const categories = useCategories(peutLire);
  const classement = useClassement(peutLire);

  const filtresActifs =
    Boolean(recherche.trim()) ||
    Boolean(categorie) ||
    Boolean(statutStock) ||
    actif !== 'true' ||
    margeNegative;

  const produitsTries = useMemo(() => {
    const list = [...(produits ?? [])];
    list.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'designation') {
        return dir * a.designation.localeCompare(b.designation, 'fr');
      }
      if (sort.key === 'prixUnitaire') {
        return dir * (Number(a.prixUnitaire) - Number(b.prixUnitaire));
      }
      if (sort.key === 'tauxMarge') {
        return dir * (Number(a.tauxMarge) - Number(b.tauxMarge));
      }
      return dir * (a.stock - b.stock);
    });
    return list;
  }, [produits, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'designation' ? 'asc' : 'desc' },
    );
  }

  function resetFiltres() {
    setRecherche('');
    setQDebounced('');
    setCategorie('');
    setStatutStock('');
    setActif('true');
    setMargeNegative(false);
  }

  const categoriesOptions = useMemo(() => {
    const fromApi = categories.data ?? [];
    return Array.from(new Set([...fromApi, ...CATEGORIES_SUGGEREES])).sort((a, b) =>
      a.localeCompare(b, 'fr'),
    );
  }, [categories.data]);

  const priorites = synthese.data ? buildPrioritesCatalogue(synthese.data) : [];

  if (!peutLire) {
    return <p>Vous n’avez pas accès au catalogue produit.</p>;
  }

  return (
    <div>
      <datalist id="categories-suggerees">
        {categoriesOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <PageHeader
        title="Produits"
        subtitle="Catalogue réseau — stock, marge (prix − CMP) et alertes de réapprovisionnement"
        actions={
          <>
            <button
              type="button"
              onClick={() =>
                void apiDownload(buildQuery(filters).replace('/produits', '/produits/export.csv'), 'catalogue-produits.csv')
              }
            >
              <Download size={14} /> Exporter CSV
            </button>
            {peutGerer ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setModalNouveau(true)}
              >
                Nouveau produit
              </button>
            ) : null}
          </>
        }
      />

      {synthese.data && (
        <div className="kpi-grid dash-kpi-grid">
          <article className="kpi-card dash-kpi">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <Package size={16} />
              </span>
            </div>
            <div className="kpi-label">Catalogue actif</div>
            <div className="kpi-value">{synthese.data.actifs}</div>
            <div className="kpi-hint">{synthese.data.inactifs} inactif(s)</div>
          </article>
          <article
            className={
              synthese.data.ruptures > 0 ? 'kpi-card dash-kpi kpi-danger' : 'kpi-card dash-kpi'
            }
            role="button"
            tabIndex={0}
            onClick={() => {
              setStatutStock('RUPTURE');
              setActif('true');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setStatutStock('RUPTURE');
                setActif('true');
              }
            }}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <PackageX size={16} />
              </span>
            </div>
            <div className="kpi-label">Ruptures</div>
            <div className="kpi-value">{synthese.data.ruptures}</div>
            <div className="kpi-hint">Stock réseau à 0</div>
          </article>
          <article
            className={
              synthese.data.sousSeuil > 0 ? 'kpi-card dash-kpi kpi-warning' : 'kpi-card dash-kpi'
            }
            role="button"
            tabIndex={0}
            onClick={() => {
              setStatutStock('SOUS_SEUIL');
              setActif('true');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setStatutStock('SOUS_SEUIL');
                setActif('true');
              }
            }}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <AlertTriangle size={16} />
              </span>
            </div>
            <div className="kpi-label">Sous le seuil</div>
            <div className="kpi-value">{synthese.data.sousSeuil}</div>
            <div className="kpi-hint">Alerte STOCK_BAS</div>
          </article>
          <article className="kpi-card dash-kpi">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <Wallet size={16} />
              </span>
            </div>
            <div className="kpi-label">Valeur stock</div>
            <div className="kpi-value">{formatFcfa(synthese.data.valeurStock)}</div>
            <div className="kpi-hint">Valorisée au CMP</div>
          </article>
          <article
            className={
              synthese.data.margesNegatives > 0
                ? 'kpi-card dash-kpi kpi-danger'
                : 'kpi-card dash-kpi'
            }
            role="button"
            tabIndex={0}
            onClick={() => {
              setMargeNegative(true);
              setStatutStock('');
              setActif('true');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setMargeNegative(true);
                setStatutStock('');
                setActif('true');
              }
            }}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <Scale size={16} />
              </span>
            </div>
            <div className="kpi-label">Prix &lt; CMP</div>
            <div className="kpi-value">{synthese.data.margesNegatives}</div>
            <div className="kpi-hint">Marge unitaire négative</div>
          </article>
        </div>
      )}

      {priorites.length > 0 && (
        <section className="dash-priorites">
          <h2>Priorités catalogue</h2>
          <div className="dash-priorites-grid">
            {priorites.map((p) => (
              <article
                key={p.id}
                className={`dash-priorite dash-priorite-${p.severity}`}
              >
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.detail}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStatutStock(p.filtre.statutStock ?? '');
                      setActif(p.filtre.actif ?? 'true');
                      setMargeNegative(Boolean(p.filtre.margeNegative));
                    }}
                  >
                    Filtrer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {classement.data &&
        (classement.data.meilleuresVentes.length > 0 ||
          classement.data.dormants.length > 0) && (
          <div className="panel-grid-2">
            <section className="panel">
              <h2>Meilleures ventes · 30 j</h2>
              {classement.data.meilleuresVentes.length === 0 ? (
                <p className="lead">Aucune vente nette sur 30 jours.</p>
              ) : (
                <ol className="produits-classement">
                  {classement.data.meilleuresVentes.map((row) => (
                    <li key={row.produit.id}>
                      <Link className="link-button" to={`/produits/${row.produit.id}`}>
                        {row.produit.designation}
                      </Link>
                      <span>
                        {row.quantiteVendue} u. · {formatFcfa(row.chiffreAffaires)}
                        <InfoTooltip
                          insight={insightMeilleureVente(
                            row.quantiteVendue,
                            row.chiffreAffaires,
                          )}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="panel">
              <h2>Dormants · stock sans vente 30 j</h2>
              {classement.data.dormants.length === 0 ? (
                <p className="lead">Aucun actif en stock n’est resté sans vente.</p>
              ) : (
                <ol className="produits-classement">
                  {classement.data.dormants.map((row) => (
                    <li key={row.produit.id}>
                      <Link className="link-button" to={`/produits/${row.produit.id}`}>
                        {row.produit.designation}
                      </Link>
                      <span>
                        {row.stock} u. · {formatFcfa(row.valeurStock)}
                        <InfoTooltip
                          insight={insightDormant(row.stock, row.valeurStock)}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}

      {isLoading && <LoadingState label="Chargement des produits..." />}
      {isError && <p role="alert">Erreur lors du chargement des produits.</p>}

      {produits && (
        <div>
            <div className="toolbar">
              <div>
                <label htmlFor="filtre-produit">Rechercher</label>
                <input
                  id="filtre-produit"
                  type="search"
                  placeholder="Désignation ou référence…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="filtre-categorie">Catégorie</label>
                <select
                  id="filtre-categorie"
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                >
                  <option value="">Toutes</option>
                  {categoriesOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filtre-statut">Statut stock</label>
                <select
                  id="filtre-statut"
                  value={statutStock}
                  onChange={(e) => setStatutStock(e.target.value)}
                >
                  <option value="">Tous</option>
                  <option value="RUPTURE">Rupture</option>
                  <option value="SOUS_SEUIL">Sous seuil</option>
                  <option value="OK">OK</option>
                </select>
              </div>
              <div>
                <label htmlFor="filtre-actif">État</label>
                <select
                  id="filtre-actif"
                  value={actif}
                  onChange={(e) => setActif(e.target.value)}
                >
                  <option value="true">Actifs</option>
                  <option value="false">Inactifs</option>
                  <option value="">Tous</option>
                </select>
              </div>
              {filtresActifs && (
                <div>
                  <label htmlFor="reset-filtres">Filtres</label>
                  <button type="button" id="reset-filtres" onClick={resetFiltres}>
                    Réinitialiser
                  </button>
                </div>
              )}
            </div>

            <ListPanel title={`${produitsTries.length} produit(s) — cliquez une ligne pour ouvrir la fiche`}>
              {produitsTries.length === 0 ? (
                <EmptyState
                  title="Aucun produit"
                  description={
                    filtresActifs
                      ? 'Aucun produit ne correspond à ces filtres.'
                      : 'Le catalogue est vide. Créez un premier produit pour démarrer.'
                  }
                  action={
                    peutGerer && !recherche && !categorie ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setModalNouveau(true)}
                      >
                        Nouveau produit
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>
                        <button
                          type="button"
                          className="th-sort"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSort('designation');
                          }}
                        >
                          Produit {sort.key === 'designation' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                        </button>
                      </th>
                      <th>Catégorie</th>
                      <th>
                        <button type="button" className="th-sort" onClick={() => toggleSort('prixUnitaire')}>
                          Prix {sort.key === 'prixUnitaire' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="th-sort" onClick={() => toggleSort('tauxMarge')}>
                          Marge {sort.key === 'tauxMarge' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="th-sort" onClick={() => toggleSort('stock')}>
                          Stock {sort.key === 'stock' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                        </button>
                      </th>
                      <th>Statut</th>
                      <th aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {produitsTries.map((p) => (
                      <tr
                        key={p.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        aria-label={`Ouvrir la fiche de ${p.designation}`}
                        onClick={() => navigate(`/produits/${p.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/produits/${p.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{p.designation}</strong>
                          <div className="produit-ref">
                            {p.reference ?? '—'}
                            {!p.actif && (
                              <span className="badge badge-neutral">Inactif</span>
                            )}
                          </div>
                        </td>
                        <td>{p.categorie ?? '—'}</td>
                        <td className="money">{formatFcfa(p.prixUnitaire)}</td>
                        <td className="money">
                          {p.tauxMarge} %
                          <InfoTooltip
                            insight={insightMargeUnitaire(
                              p.margeUnitaire,
                              p.tauxMarge,
                              p.coutMoyenPondere,
                            )}
                          />
                        </td>
                        <td>{p.stock}</td>
                        <td>
                          <span className={STATUT_BADGE[p.statutStock]}>
                            {STATUT_LABEL[p.statutStock]}
                          </span>
                        </td>
                        <td className="produit-row-chevron">
                          <ChevronRight size={16} aria-hidden />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ListPanel>
        </div>
      )}

      {peutGerer && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouveau produit"
        >
          <NouveauProduitForm
            designationsExistantes={(produits ?? []).map((p) => p.designation)}
            onSuccess={(created) => {
              setModalNouveau(false);
              navigate(`/produits/${created.id}`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
