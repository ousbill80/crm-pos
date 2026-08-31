import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Package,
  PackageX,
  Scale,
  Tag,
  Upload,
  Wallet,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { ImportCatalogueModal } from './ImportCatalogueModal';
import {
  EtiquettesModal,
  type ArticleEtiquetteSelection,
} from '../components/EtiquettesModal';
import { InfoTooltip } from '../components/InfoTooltip';
import { NouveauProduitForm } from '../components/NouveauProduitForm';
import { EntityFinderSelect } from '../components/EntityFinderSelect';
import { useCategoriesProduit } from '../hooks/useCategoriesProduit';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  statutStockDepuisQty,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  buildPrioritesCatalogue,
  insightCatalogueActif,
  insightDormant,
  insightMargeUnitaire,
  insightMeilleureVente,
  insightPrixSousCmp,
  insightRupturesCatalogue,
  insightSousSeuilCatalogue,
  insightValeurStockCatalogue,
} from '../lib/insights/produits';
import type {
  ProduitClassementDto,
  ProduitDto,
  ProduitsSyntheseDto,
  StatutStock,
  StockQuantDto,
} from '../lib/types';

const ROLES_ADMIN_STRUCTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_CATALOGUE_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
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
    placeholderData: keepPreviousData,
  });
}

function useSynthese(enabled: boolean) {
  return useQuery({
    queryKey: ['produits-synthese'],
    queryFn: () => apiFetch<ProduitsSyntheseDto>('/produits/synthese'),
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

export function ProduitsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const magasin = useFiltreMagasinSiege();
  const peutLire = user !== null && ROLES_LECTURE_STRUCTURE.includes(user.role);
  const peutGerer = user !== null && ROLES_CATALOGUE_ECRITURE.includes(user.role);
  const peutImporter = user !== null && ROLES_ADMIN_STRUCTURE.includes(user.role);

  const [recherche, setRecherche] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [categorie, setCategorie] = useState('');
  const [statutStock, setStatutStock] = useState('');
  const [actif, setActif] = useState('true');
  const [margeNegative, setMargeNegative] = useState(false);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [modeSelectionEtiquettes, setModeSelectionEtiquettes] = useState(false);
  const [selectionEtiquettes, setSelectionEtiquettes] = useState<
    Map<string, number>
  >(new Map());
  const [modalEtiquettes, setModalEtiquettes] = useState(false);
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
    statutStock: magasin.boutiqueId ? '' : statutStock,
    actif,
    margeNegative,
  };
  const { data: produits, isLoading, isError } = useProduits(peutLire, filters);
  const stocksMagasin = useQuery({
    queryKey: ['stocks'],
    queryFn: () => apiFetch<StockQuantDto[]>('/stocks'),
    enabled: peutLire && Boolean(magasin.boutiqueId),
  });
  const synthese = useSynthese(peutLire);
  const categories = useCategoriesProduit(null, peutLire);
  const classement = useClassement(peutLire);

  const produitsPerimetre = useMemo(() => {
    const list = produits ?? [];
    if (!magasin.boutiqueId) return list;
    const qty = new Map<string, number>();
    for (const q of stocksMagasin.data ?? []) {
      if (q.entrepot.boutiqueId !== magasin.boutiqueId) continue;
      qty.set(q.produitId, (qty.get(q.produitId) ?? 0) + q.quantite);
    }
    const overlay = list.map((p) => {
      const stock = qty.get(p.id) ?? 0;
      return {
        ...p,
        stock,
        statutStock: statutStockDepuisQty(stock, p.seuilReappro),
      };
    });
    if (!statutStock) return overlay;
    return overlay.filter((p) => p.statutStock === statutStock);
  }, [produits, magasin.boutiqueId, stocksMagasin.data, statutStock]);

  const filtresActifs =
    Boolean(recherche.trim()) ||
    Boolean(categorie) ||
    Boolean(statutStock) ||
    actif !== 'true' ||
    margeNegative;

  const produitsTries = useMemo(() => {
    const list = [...produitsPerimetre];
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
  }, [produitsPerimetre, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'designation' ? 'asc' : 'desc' },
    );
  }

  function toggleSelectionArticle(produitId: string) {
    setSelectionEtiquettes((prev) => {
      const next = new Map(prev);
      if (next.has(produitId)) {
        next.delete(produitId);
      } else {
        next.set(produitId, 1);
      }
      return next;
    });
  }

  function toggleToutSelectionner() {
    setSelectionEtiquettes((prev) => {
      const tousSelectionnes = produitsTries.every((p) => prev.has(p.id));
      if (tousSelectionnes) {
        return new Map();
      }
      const next = new Map(prev);
      for (const p of produitsTries) {
        if (!next.has(p.id)) next.set(p.id, 1);
      }
      return next;
    });
  }

  const articlesSelectionnes: ArticleEtiquetteSelection[] = useMemo(() => {
    const parId = new Map(produitsTries.map((p) => [p.id, p]));
    return Array.from(selectionEtiquettes.entries())
      .flatMap<ArticleEtiquetteSelection>(([produitId, quantite]) => {
        const produit = parId.get(produitId);
        if (!produit) return [];
        return [
          {
            produitId,
            designation: produit.designation,
            reference: produit.reference,
            codeBarres: produit.codeBarres ?? null,
            prixUnitaire: produit.prixUnitaire,
            quantite,
          },
        ];
      });
  }, [selectionEtiquettes, produitsTries]);

  function resetFiltres() {
    setRecherche('');
    setQDebounced('');
    setCategorie('');
    setStatutStock('');
    setActif('true');
    setMargeNegative(false);
  }

  const categoriesOptions = categories.options;

  const priorites = synthese.data ? buildPrioritesCatalogue(synthese.data) : [];

  if (!peutLire) {
    return <p>Vous n’avez pas accès au catalogue produit.</p>;
  }

  return (
    <div>
      <PageHeader
        title="Produits"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Catalogue réseau — prix communs ; le stock affiché est le réseau (filtre magasin = quantités du magasin)',
          texteBoutique: 'Catalogue réseau — stock affiché = magasin',
        })}
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
            {peutImporter ? (
              <button type="button" onClick={() => setModalImport(true)}>
                <Upload size={14} /> Importer
              </button>
            ) : null}
            {peutGerer ? (
              <button
                type="button"
                className={modeSelectionEtiquettes ? 'btn-primary' : undefined}
                aria-pressed={modeSelectionEtiquettes}
                onClick={() => {
                  if (modeSelectionEtiquettes) {
                    setModeSelectionEtiquettes(false);
                    setSelectionEtiquettes(new Map());
                    return;
                  }
                  setModeSelectionEtiquettes(true);
                  window.setTimeout(() => {
                    document.getElementById('produits-table')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }, 0);
                }}
              >
                <Tag size={14} />
                {modeSelectionEtiquettes
                  ? 'Annuler la sélection'
                  : 'Sélection pour étiquettes'}
              </button>
            ) : null}
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
          <article
            className="kpi-card dash-kpi"
            role="button"
            tabIndex={0}
            onClick={() => {
              setStatutStock('');
              setActif('true');
              setMargeNegative(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setStatutStock('');
                setActif('true');
                setMargeNegative(false);
              }
            }}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <Package size={16} />
              </span>
              <InfoTooltip insight={insightCatalogueActif(synthese.data.actifs, synthese.data.inactifs)} />
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
              <InfoTooltip insight={insightRupturesCatalogue(synthese.data.ruptures)} />
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
              <InfoTooltip insight={insightSousSeuilCatalogue(synthese.data.sousSeuil)} />
            </div>
            <div className="kpi-label">Sous le seuil</div>
            <div className="kpi-value">{synthese.data.sousSeuil}</div>
            <div className="kpi-hint">Alerte STOCK_BAS</div>
          </article>
          <a href="#produits-table" className="kpi-card dash-kpi">
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <Wallet size={16} />
              </span>
              <InfoTooltip
                insight={insightValeurStockCatalogue(synthese.data.valeurStock, synthese.data.actifs)}
              />
            </div>
            <div className="kpi-label">Valeur stock</div>
            <div className="kpi-value">{formatFcfa(synthese.data.valeurStock)}</div>
            <div className="kpi-hint">Valorisée au CMP</div>
          </a>
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
              <InfoTooltip insight={insightPrixSousCmp(synthese.data.margesNegatives)} />
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
                <ol className="dash-rank">
                  {(() => {
                    const max = Math.max(
                      ...classement.data.meilleuresVentes.map((r) => r.quantiteVendue),
                      1,
                    );
                    return classement.data.meilleuresVentes.map((row, i) => (
                      <li key={row.produit.id}>
                        <div className="dash-rank-row">
                          <span className="dash-rank-pos">{i + 1}</span>
                          <Link className="dash-rank-name" to={`/produits/${row.produit.id}`}>
                            {row.produit.designation}
                          </Link>
                          <span className="dash-taux">
                            {row.quantiteVendue} u. · {formatFcfa(row.chiffreAffaires)}
                          </span>
                          <InfoTooltip
                            insight={insightMeilleureVente(
                              row.quantiteVendue,
                              row.chiffreAffaires,
                            )}
                          />
                        </div>
                        <div className="dash-bar-track">
                          <div
                            className="dash-bar-fill"
                            style={{ width: `${(row.quantiteVendue / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    ));
                  })()}
                </ol>
              )}
            </section>
            <section className="panel">
              <h2>Dormants · stock sans vente 30 j</h2>
              {classement.data.dormants.length === 0 ? (
                <p className="lead">Aucun actif en stock n’est resté sans vente.</p>
              ) : (
                <ol className="dash-rank">
                  {(() => {
                    const max = Math.max(
                      ...classement.data.dormants.map((r) => Number(r.valeurStock)),
                      1,
                    );
                    return classement.data.dormants.map((row, i) => (
                      <li key={row.produit.id}>
                        <div className="dash-rank-row">
                          <span className="dash-rank-pos">{i + 1}</span>
                          <Link className="dash-rank-name" to={`/produits/${row.produit.id}`}>
                            {row.produit.designation}
                          </Link>
                          <span className="dash-taux">
                            {row.stock} u. · {formatFcfa(row.valeurStock)}
                          </span>
                          <InfoTooltip insight={insightDormant(row.stock, row.valeurStock)} />
                        </div>
                        <div className="dash-bar-track">
                          <div
                            className="dash-bar-fill"
                            style={{ width: `${(Number(row.valeurStock) / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    ));
                  })()}
                </ol>
              )}
            </section>
          </div>
        )}

      {isLoading && !produits && (
        <LoadingState label="Chargement des produits..." />
      )}
      {isError && <p role="alert">Erreur lors du chargement des produits.</p>}

      <div className="toolbar">
        <FiltreMagasinSiege id="prod-filtre-magasin" />
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
          <EntityFinderSelect
            id="filtre-categorie"
            value={categorie}
            onChange={setCategorie}
            options={categoriesOptions.map((c) => ({ value: c, label: c }))}
            allowEmpty
            emptyLabel="Toutes"
            placeholder="Filtrer par catégorie…"
            ariaLabel="Catégorie"
          />
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

      {produits && (
        <div>
            <ListPanel
              title={
                modeSelectionEtiquettes
                  ? `${produitsTries.length} produit(s) — cochez les articles à étiqueter`
                  : `${produitsTries.length} produit(s) — cliquez une ligne pour ouvrir la fiche`
              }
              id="produits-table"
            >
              {produitsTries.length === 0 ? (
                <EmptyState
                  title="Aucun produit"
                  description={
                    filtresActifs
                      ? 'Aucun produit ne correspond à ces filtres.'
                      : 'Le catalogue est vide. Créez un premier produit pour démarrer.'
                  }
                  action={
                    (peutGerer || peutImporter) && !recherche && !categorie ? (
                      <div className="table-actions">
                        {peutImporter ? (
                          <button type="button" onClick={() => setModalImport(true)}>
                            Importer CSV / Excel
                          </button>
                        ) : null}
                        {peutGerer ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setModalNouveau(true)}
                          >
                            Nouveau produit
                          </button>
                        ) : null}
                      </div>
                    ) : undefined
                  }
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      {modeSelectionEtiquettes && (
                        <th className="produit-col-check">
                          <input
                            type="checkbox"
                            aria-label="Tout sélectionner (résultats filtrés)"
                            checked={
                              produitsTries.length > 0 &&
                              produitsTries.every((p) => selectionEtiquettes.has(p.id))
                            }
                            onChange={toggleToutSelectionner}
                          />
                        </th>
                      )}
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
                          Stock{magasin.boutiqueId ? ' magasin' : ''} {sort.key === 'stock' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
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
                        className={
                          modeSelectionEtiquettes && selectionEtiquettes.has(p.id)
                            ? 'produit-row produit-row-selected'
                            : 'produit-row'
                        }
                        tabIndex={0}
                        role="link"
                        aria-label={`Ouvrir la fiche de ${p.designation}`}
                        onClick={() =>
                          modeSelectionEtiquettes
                            ? toggleSelectionArticle(p.id)
                            : navigate(`/produits/${p.id}`)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (modeSelectionEtiquettes) {
                              toggleSelectionArticle(p.id);
                            } else {
                              navigate(`/produits/${p.id}`);
                            }
                          }
                        }}
                      >
                        {modeSelectionEtiquettes && (
                          <td
                            className="produit-col-check"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Sélectionner ${p.designation}`}
                              checked={selectionEtiquettes.has(p.id)}
                              onChange={() => toggleSelectionArticle(p.id)}
                            />
                          </td>
                        )}
                        <td>
                          <div className="produit-cell-nom">
                            {p.imageUrl ? (
                              <img
                                className="produit-thumb"
                                src={p.imageUrl}
                                alt=""
                              />
                            ) : null}
                            <div>
                              <strong>{p.designation}</strong>
                              <div className="produit-ref">
                                {p.reference ?? '—'}
                                {p.typeProduit === 'PRESTATION' && (
                                  <span className="badge badge-neutral">Prestation</span>
                                )}
                                {!p.actif && (
                                  <span className="badge badge-neutral">Inactif</span>
                                )}
                              </div>
                            </div>
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

      {modeSelectionEtiquettes && (
        <div className="selection-toolbar" role="toolbar" aria-label="Sélection étiquettes">
          <span>
            {selectionEtiquettes.size === 0
              ? 'Cochez les articles dans le tableau ci-dessus, puis imprimez.'
              : `${selectionEtiquettes.size} article(s) sélectionné(s)`}
          </span>
          <div className="selection-toolbar-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSelectionEtiquettes(new Map());
                setModeSelectionEtiquettes(false);
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={selectionEtiquettes.size === 0}
              onClick={() => setModalEtiquettes(true)}
            >
              <Tag size={14} /> Imprimer les étiquettes
            </button>
          </div>
        </div>
      )}

      {peutGerer && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouveau produit"
          size="xl"
          description="Catalogue magasin et publication e-commerce (photos, caractéristiques, variantes)."
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
      {peutImporter && (
        <ImportCatalogueModal
          open={modalImport}
          onClose={() => setModalImport(false)}
        />
      )}
      {peutGerer && (
        <EtiquettesModal
          open={modalEtiquettes}
          onClose={() => setModalEtiquettes(false)}
          articles={articlesSelectionnes}
          boutiqueIdDefaut={magasin.boutiqueId}
          onQuantiteChange={(produitId, quantite) =>
            setSelectionEtiquettes((prev) => {
              const next = new Map(prev);
              next.set(produitId, quantite);
              return next;
            })
          }
          onRemove={(produitId) =>
            setSelectionEtiquettes((prev) => {
              const next = new Map(prev);
              next.delete(produitId);
              return next;
            })
          }
          onImprime={() => {
            setSelectionEtiquettes(new Map());
            setModeSelectionEtiquettes(false);
            setModalEtiquettes(false);
          }}
        />
      )}
    </div>
  );
}
