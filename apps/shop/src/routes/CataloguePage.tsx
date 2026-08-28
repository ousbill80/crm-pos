import { FormEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { shopFetch } from '../lib/api';
import { CATEGORIES, MARQUES } from '../lib/brand';
import { ProductCard, type ProductCardItem } from '../components/ProductCard';

const PAGE_SIZE = 24;

type Tri = 'designation' | 'prix_asc' | 'prix_desc';

interface CatalogueResponse {
  items: ProductCardItem[];
  interpreted?: {
    marque: string | null;
    tokens: string[];
    categorieSuggeree: string | null;
    aliasesMarque: string[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pageCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

function decodeCat(raw?: string) {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function formatInt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function buildCataloguePath(opts: {
  categorie?: string;
  q?: string;
  marque?: string;
  page?: number;
  tri?: Tri;
}) {
  const base = opts.categorie
    ? `/catalogue/${encodeURIComponent(opts.categorie)}`
    : '/catalogue';
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.marque) sp.set('marque', opts.marque);
  if (opts.tri && opts.tri !== 'designation') sp.set('tri', opts.tri);
  if (opts.page && opts.page > 1) sp.set('page', String(opts.page));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function CataloguePage() {
  const { categorie: categorieParam } = useParams();
  const [params, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const categorie = decodeCat(categorieParam);
  const recherche = params.get('q')?.trim() || undefined;
  const marqueParam = params.get('marque')?.trim() || undefined;
  const tri = (params.get('tri') as Tri | null) ?? 'designation';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [searchDraft, setSearchDraft] = useState(recherche ?? '');

  useEffect(() => {
    setSearchDraft(recherche ?? '');
  }, [recherche]);

  const activeCat = CATEGORIES.find((c) => c.label === categorie);
  const qs = new URLSearchParams();
  if (categorie) qs.set('categorie', categorie);
  if (recherche) qs.set('recherche', recherche);
  if (marqueParam) qs.set('marque', marqueParam);
  qs.set('tri', tri);
  qs.set('page', String(page));
  qs.set('limit', String(PAGE_SIZE));

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['catalogue', categorie, recherche, marqueParam, tri, page],
    queryFn: () => shopFetch<CatalogueResponse>(`/shop/catalogue?${qs}`),
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const interpreted = data?.interpreted;
  const activeMarque = interpreted?.marque ?? marqueParam ?? null;
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;
  const pageCount = pagination?.pageCount ?? 1;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasFilters = Boolean(categorie || recherche || marqueParam);

  const title = recherche
    ? 'Recherche'
    : activeMarque && !activeCat
      ? activeMarque
      : activeCat
        ? activeCat.label
        : 'Catalogue';
  const lead = recherche
    ? activeMarque
      ? `Pièces ${activeMarque} — « ${recherche} »`
      : `Résultats pour « ${recherche} »`
    : activeMarque && activeCat
      ? `${activeCat.hint} · compatible ${activeMarque}`
      : activeMarque
        ? `Pièces et accessoires compatibles ${activeMarque}`
        : activeCat
          ? activeCat.hint
          : 'Pièces et accessoires — stock réseau MAJOR AUTO PARTS';

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchDraft.trim();
    navigate(
      buildCataloguePath({
        categorie,
        q: q || undefined,
        marque: marqueParam,
        tri,
        page: 1,
      }),
    );
  }

  function setTri(next: Tri) {
    const sp = new URLSearchParams(params);
    if (next === 'designation') sp.delete('tri');
    else sp.set('tri', next);
    sp.delete('page');
    setSearchParams(sp, { replace: true });
  }

  function goPage(next: number) {
    const sp = new URLSearchParams(params);
    if (next <= 1) sp.delete('page');
    else sp.set('page', String(next));
    setSearchParams(sp);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="section catalogue-page flash">
      <header className="catalogue-intro">
        <p className="catalogue-kicker">
          <span className="catalogue-kicker-brand">MAJOR</span>
          <span aria-hidden>·</span>
          <span>Boutique en ligne</span>
        </p>
        <h1 className="page-title">{title}</h1>
        <p className="page-lead catalogue-lead">{lead}</p>
        {hasFilters && (
          <nav className="catalogue-crumbs" aria-label="Fil d’Ariane">
            <Link to="/catalogue">Catalogue</Link>
            {activeMarque && (
              <>
                <span aria-hidden>/</span>
                <span>{activeMarque}</span>
              </>
            )}
            {categorie && (
              <>
                <span aria-hidden>/</span>
                <span>{categorie}</span>
              </>
            )}
            {recherche && (
              <>
                <span aria-hidden>/</span>
                <span>« {recherche} »</span>
              </>
            )}
          </nav>
        )}

        <div className="catalogue-intro-tools">
          <form className="catalogue-search" onSubmit={submitSearch} role="search">
            <label className="sr-only" htmlFor="catalogue-q">
              Rechercher une pièce
            </label>
            <input
              id="catalogue-q"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Ex. freins mercedes, jante BMW, VW…"
              autoComplete="off"
            />
            <button type="submit" className="btn">
              Rechercher
            </button>
          </form>

          <label className="catalogue-sort">
            <span>Trier</span>
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value as Tri)}
              aria-label="Trier le catalogue"
            >
              <option value="designation">Nom A–Z</option>
              <option value="prix_asc">Prix croissant</option>
              <option value="prix_desc">Prix décroissant</option>
            </select>
          </label>
        </div>

        <nav className="catalogue-marques" aria-label="Filtrer par marque">
          {MARQUES.map((m) => {
            const active =
              activeMarque?.toLocaleUpperCase('fr-FR') ===
              m.toLocaleUpperCase('fr-FR');
            return (
              <Link
                key={m}
                to={buildCataloguePath({
                  categorie,
                  q: recherche,
                  marque: active ? undefined : m,
                  tri,
                })}
                className={`catalogue-marque${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={
                  active
                    ? `Retirer le filtre ${m}`
                    : `Pièces compatibles ${m}`
                }
              >
                {m}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="catalogue-layout">
        <aside className="catalogue-nav" aria-label="Rayons">
          <p className="catalogue-nav-label">Rayons</p>
          <nav className="catalogue-nav-list">
            <Link
              to={buildCataloguePath({
                q: recherche,
                marque: marqueParam,
                tri,
              })}
              className={`catalogue-nav-link${!categorie ? ' is-active' : ''}`}
            >
              <span>Tous les rayons</span>
            </Link>
            {CATEGORIES.map((c) => {
              const active = categorie === c.label;
              return (
                <Link
                  key={c.slug}
                  to={buildCataloguePath({
                    categorie: c.label,
                    q: recherche,
                    marque: marqueParam,
                    tri,
                  })}
                  className={`catalogue-nav-link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span>{c.label}</span>
                  <em>{c.hint}</em>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className={`catalogue-main${isFetching ? ' is-fetching' : ''}`}>
          <div className="catalogue-toolbar">
            <p aria-live="polite">
              {!isLoading && !isError
                ? total === 0
                  ? 'Aucune référence'
                  : `${formatInt(total)} référence${total > 1 ? 's' : ''} · ${formatInt(from)}–${formatInt(to)}`
                : 'Chargement…'}
              {activeMarque && !isLoading ? ` · ${activeMarque}` : ''}
              {categorie && !isLoading ? ` · ${categorie}` : ''}
              {recherche && !isLoading ? ` · « ${recherche} »` : ''}
            </p>
            {hasFilters && (
              <Link to="/catalogue" className="section-link">
                Tout effacer →
              </Link>
            )}
          </div>

          {!isLoading &&
            !isError &&
            interpreted?.categorieSuggeree &&
            !categorie && (
              <p className="catalogue-hint">
                Rayon probable :{' '}
                <Link
                  to={buildCataloguePath({
                    categorie: interpreted.categorieSuggeree,
                    q: recherche,
                    marque: activeMarque ?? undefined,
                    tri,
                  })}
                >
                  {interpreted.categorieSuggeree}
                </Link>
              </p>
            )}

          {isLoading && (
            <div className="product-grid" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="product product-skeleton" />
              ))}
            </div>
          )}

          {isError && (
            <div className="catalogue-empty">
              <strong>Catalogue indisponible</strong>
              <p>Impossible de charger les produits. Vérifiez la connexion API.</p>
            </div>
          )}

          {!isLoading && !isError && total === 0 && (
            <div className="catalogue-empty">
              <strong>Aucune référence</strong>
              <p>
                {recherche || activeMarque
                  ? 'Aucun produit ne correspond. Essayez un alias (VW, Mercedes-Benz…) ou un autre rayon.'
                  : 'Ce rayon est vide pour le moment.'}
              </p>
              <Link className="btn" to="/catalogue">
                Voir tout le catalogue
              </Link>
            </div>
          )}

          {!isLoading && !isError && items.length > 0 && (
            <>
              <div className="product-grid">
                {items.map((p, i) => (
                  <ProductCard key={p.id} p={p} index={i} />
                ))}
              </div>

              {pageCount > 1 && (
                <nav className="catalogue-pager" aria-label="Pagination">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!pagination?.hasPrev}
                    onClick={() => goPage(page - 1)}
                  >
                    Précédent
                  </button>
                  <p className="catalogue-pager-status">
                    Page <strong>{page}</strong> / {formatInt(pageCount)}
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!pagination?.hasNext}
                    onClick={() => goPage(page + 1)}
                  >
                    Suivant
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
