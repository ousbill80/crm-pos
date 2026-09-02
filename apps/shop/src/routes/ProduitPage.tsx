import { useMemo, useState, useEffect, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  formatFcfa,
  shopFetch,
  type CatalogueResponse,
} from '../lib/api';
import { useCart } from '../lib/cart';
import { trackShopEvent, getShopSessionId } from '../lib/aarrr';
import { rememberInterest } from '../lib/interests';
import { TRUST } from '../lib/brand';
import { ProductCard } from '../components/ProductCard';
import { useSeo } from '../components/SeoHead';
import { seoForProduit, withBrand, DEFAULT_DESCRIPTION } from '../lib/seo';
import {
  buildVariantAxes,
  colorSwatch,
  findVariantForSelection,
  typeSpecificHighlights,
  type ProduitDetail,
} from '../lib/productPresentation';
import {
  libelleStock,
  quantiteMaxStock,
} from '../lib/stock';

type RecoItem = {
  id: string;
  slug: string | null;
  designation: string;
  prixAffiche: number;
  categorie: string | null;
  imageUrl?: string | null;
  badge?: string;
  raison?: string;
};

export default function ProduitPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { addProduit, panier } = useCart();
  const [qty, setQty] = useState(1);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [tab, setTab] = useState<'desc' | 'specs' | 'livraison' | 'garantie'>(
    'desc',
  );
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['produit', slug],
    queryFn: () => shopFetch<ProduitDetail>(`/shop/catalogue/produit/${slug}`),
    enabled: !!slug,
  });

  const seoPayload = useMemo(
    () =>
      data?.slug
        ? seoForProduit({
            designation: data.designation,
            description: data.description,
            categorie: data.categorie,
            slug: data.slug,
            prixAffiche: data.prixAffiche,
            imageUrl: data.imageUrl,
            stockDisponible: data.stockDisponible,
          })
        : {
            title: withBrand('Pièce automobile Abidjan'),
            description: DEFAULT_DESCRIPTION,
            path: slug ? `/produit/${slug}` : '/catalogue',
            robots: isError ? 'noindex, follow' : 'index, follow, noai, noimageai',
          },
    [data, isError, slug],
  );
  useSeo(seoPayload);

  useEffect(() => {
    if (!data?.id) return;
    trackShopEvent('VIEW_PDP', { produitId: data.id });
    rememberInterest({
      produitId: data.id,
      categorie: data.categorie,
      weight: 2,
    });
  }, [data?.id, data?.categorie]);

  const related = useQuery({
    queryKey: ['related', data?.categorie, data?.id],
    queryFn: () =>
      shopFetch<CatalogueResponse>(
        `/shop/catalogue?categorie=${encodeURIComponent(data!.categorie!)}&limit=8&tri=designation`,
      ),
    enabled: !!data?.categorie,
  });

  const personalized = useQuery({
    queryKey: ['shop-decouverte', 'pdp'],
    queryFn: () =>
      shopFetch<{ pourVous: RecoItem[] }>(
        `/shop/decouverte?sessionId=${encodeURIComponent(getShopSessionId())}`,
      ),
    staleTime: 30_000,
  });

  const variantes = data?.variantes ?? [];
  const axes = useMemo(
    () => (data ? buildVariantAxes(data, variantes) : []),
    [data, variantes],
  );
  const highlights = useMemo(
    () => (data ? typeSpecificHighlights(data) : []),
    [data],
  );

  const relatedItems = useMemo(() => {
    const perso = (personalized.data?.pourVous ?? []).filter(
      (p) => p.id !== data?.id,
    );
    if (perso.length >= 3) return perso.slice(0, 8);
    const cat = (related.data?.items ?? []).filter((p) => p.id !== data?.id);
    const seen = new Set(perso.map((p) => p.id));
    return [...perso, ...cat.filter((p) => !seen.has(p.id))].slice(0, 8);
  }, [personalized.data, related.data, data?.id]);

  const qtyInCart = useMemo(
    () =>
      panier?.lignes.find((l) => l.produitId === data?.id)?.quantite ?? 0,
    [panier, data?.id],
  );
  const maxQty = data
    ? quantiteMaxStock(data.stockDisponible, data.typeProduit, qtyInCart)
    : 0;
  const peutCommander = maxQty > 0;
  const stocksRetrait = data?.stocksRetrait ?? [];
  const retraitAvecStock = stocksRetrait.filter((b) => b.disponible > 0);
  const stockHintRetrait =
    data &&
    data.stockDisponible != null &&
    data.stockDisponible > 0 &&
    stocksRetrait.length > 0 &&
    retraitAvecStock.length > 0
      ? `Retrait aussi disponible : ${retraitAvecStock.map((b) => `${b.nom} (${b.disponible})`).join(' · ')}`
      : data &&
          stocksRetrait.length > 0 &&
          retraitAvecStock.length === 0
        ? `Retrait indisponible dans toutes les boutiques`
        : null;

  useEffect(() => {
    if (maxQty > 0 && qty > maxQty) setQty(maxQty);
  }, [maxQty, qty]);

  const galleryImages = useMemo(() => {
    if (!data) return [] as string[];
    const imgs: string[] = [];
    const push = (url: string | null | undefined) => {
      if (!url || url.startsWith('data:image/svg')) return;
      if (!imgs.includes(url)) imgs.push(url);
    };
    push(data.imageUrl);
    if (data.imagesUrls) {
      try {
        const extra = JSON.parse(data.imagesUrls) as unknown;
        if (Array.isArray(extra)) {
          for (const u of extra) {
            if (typeof u === 'string') push(u);
          }
        }
      } catch {
        /* ignore */
      }
    }
    for (const v of variantes) {
      push(v.imageUrl);
    }
    return imgs;
  }, [data, variantes]);

  async function handleAdd(goCheckout = false) {
    if (!data) return;
    setAdding(true);
    setErr(null);
    try {
      await addProduit(data.id, qty, { stockDisponible: data.stockDisponible });
      setAdded(true);
      if (goCheckout) nav('/checkout');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ajout impossible');
    } finally {
      setAdding(false);
    }
  }

  function selectVariant(axisKey: string, value: string) {
    if (!data) return;
    const next = findVariantForSelection(data, variantes, axisKey, value);
    if (next?.slug && next.slug !== data.slug) {
      nav(`/produit/${next.slug}`);
      setQty(1);
      setGalleryIdx(0);
      setAdded(false);
    }
  }

  if (isLoading) {
    return (
      <div className="section">
        <div className="pdp-skeleton">
          <div className="skel skel-media" />
          <div className="skel-lines">
            <div className="skel skel-line w40" />
            <div className="skel skel-line w80" />
            <div className="skel skel-line w30" />
            <div className="skel skel-line w60" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="section">
        <h1 className="page-title">Produit</h1>
        <p className="muted">Référence introuvable.</p>
        <Link className="btn" to="/catalogue" style={{ marginTop: '1rem' }}>
          Retour catalogue
        </Link>
      </div>
    );
  }

  const letter = (data.designation?.[0] ?? 'M').toUpperCase();
  const description =
    data.description?.trim() ||
    `${data.designation} — sélection MAJOR AUTO PARTS. Qualité showroom, stock réel et options de retrait ou livraison.`;

  const hasRealImage = galleryImages.length > 0;
  const activeImage = hasRealImage ? galleryImages[galleryIdx] : null;

  return (
    <>
      <div className="pdp-temu">
        <nav className="breadcrumb pdp-crumb" aria-label="Fil d’Ariane">
          <Link to="/">Accueil</Link>
          <span>/</span>
          <Link to="/catalogue">Catalogue</Link>
          {data.categorie && (
            <>
              <span>/</span>
              <Link to={`/catalogue/${encodeURIComponent(data.categorie)}`}>
                {data.categorie}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="current">{data.designation}</span>
        </nav>

        <div className="pdp-temu-grid">
          <div className="pdp-temu-gallery">
            <div className="pdp-temu-stage">
              {activeImage ? (
                <img src={activeImage} alt={data.designation} />
              ) : (
                <span className="pdp-letter" aria-hidden>
                  {letter}
                </span>
              )}
              {peutCommander ? (
                <span className="pdp-badge ok">En stock</span>
              ) : data.stockDisponible === 0 ? (
                <span className="pdp-badge out">Rupture</span>
              ) : (
                <span className="pdp-badge out">Stock épuisé</span>
              )}
              {data.typeProduit === 'PRESTATION' && (
                <span className="pdp-badge svc">Service</span>
              )}
            </div>
            {(hasRealImage ? galleryImages : [null, null, null]).length > 1 && (
              <div className="pdp-temu-thumbs" role="tablist" aria-label="Vues">
                {(hasRealImage ? galleryImages : [null, null, null]).map(
                  (src, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`pdp-temu-thumb${galleryIdx === i ? ' active' : ''}`}
                      onClick={() => setGalleryIdx(i)}
                      aria-label={`Vue ${i + 1}`}
                    >
                      {src ? (
                        <img src={src} alt="" />
                      ) : (
                        <span>{letter}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="pdp-temu-buybox">
            {data.categorie && (
              <Link
                className="pdp-cat"
                to={`/catalogue/${encodeURIComponent(data.categorie)}`}
              >
                {data.categorie}
              </Link>
            )}
            <h1 className="pdp-temu-title">{data.designation}</h1>
            {data.reference && (
              <p className="pdp-sku">Réf. {data.reference}</p>
            )}

            <div className="pdp-temu-price">
              <strong>{formatFcfa(data.prixAffiche)}</strong>
              <span>{data.modeAffichage === 'TTC' ? 'TTC' : 'HT'}</span>
            </div>

            <p className={`pdp-temu-stock${peutCommander ? '' : ' is-out'}`}>
              {libelleStock(data.typeProduit, data.stockDisponible)}
              {qtyInCart > 0 && maxQty > 0
                ? ` · ${qtyInCart} déjà au panier (max ${maxQty + qtyInCart})`
                : null}
            </p>
            {stockHintRetrait ? (
              <p className="pdp-temu-stock-hint">{stockHintRetrait}</p>
            ) : null}

            {axes.length > 0 && (
              <div className="pdp-variants" aria-label="Variantes">
                {axes.map((axis) => (
                  <div key={axis.key} className="pdp-variant-axis">
                    <div className="pdp-variant-label">
                      <span>{axis.label}</span>
                      <strong>
                        {axis.options.find((o) => o.selected)?.value ?? '—'}
                      </strong>
                    </div>
                    <div
                      className={`pdp-variant-options kind-${axis.kind}`}
                      role="listbox"
                      aria-label={axis.label}
                    >
                      {axis.options.map((opt) => {
                        const swatch =
                          axis.kind === 'swatch'
                            ? colorSwatch(opt.value)
                            : null;
                        return (
                          <button
                            key={`${axis.key}-${opt.value}`}
                            type="button"
                            role="option"
                            aria-selected={opt.selected}
                            disabled={!opt.available && !opt.selected}
                            className={`pdp-variant-opt${opt.selected ? ' selected' : ''}${!opt.available ? ' unavailable' : ''}`}
                            title={opt.value}
                            onClick={() => selectVariant(axis.key, opt.value)}
                            style={
                              swatch
                                ? ({
                                    '--swatch': swatch,
                                  } as CSSProperties)
                                : undefined
                            }
                          >
                            {axis.kind === 'swatch' && swatch ? (
                              <i className="pdp-swatch" aria-hidden />
                            ) : (
                              opt.value
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="pdp-lead">
              {description.slice(0, 160)}
              {description.length > 160 ? '…' : ''}
            </p>

            <div className="pdp-buy">
              <div className="qty" aria-label="Quantité">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Diminuer"
                  disabled={!peutCommander}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={qty}
                  onChange={(e) =>
                    setQty(
                      Math.min(
                        maxQty,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    )
                  }
                  disabled={!peutCommander}
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  aria-label="Augmenter"
                  disabled={!peutCommander || qty >= maxQty}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn pdp-atc"
                disabled={!peutCommander || adding}
                onClick={() => void handleAdd(false)}
              >
                {adding
                  ? 'Ajout…'
                  : peutCommander
                    ? 'Ajouter au panier'
                    : data.stockDisponible === 0
                      ? 'Rupture de stock'
                      : 'Stock épuisé'}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost pdp-buy-now"
              disabled={!peutCommander || adding}
              onClick={() => void handleAdd(true)}
            >
              Acheter maintenant
            </button>

            {added && (
              <p className="pdp-toast">
                Ajouté — <Link to="/panier">voir le panier</Link>
              </p>
            )}
            {err && <p className="pdp-error">{err}</p>}

            <ul className="pdp-perks">
              <li>Retrait showroom ou livraison</li>
              <li>Paiement carte · Orange Money · Wave</li>
              <li>Conseil montage atelier</li>
            </ul>
          </div>
        </div>

        <div className="pdp-temu-panels">
          <div className="pdp-highlights panel">
            <h2>Détails clés</h2>
            <dl className="pdp-hl-grid">
              {highlights.map((h) => (
                <div key={h.label}>
                  <dt>{h.label}</dt>
                  <dd>{h.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="pdp-tabs">
            <div className="pdp-tablist" role="tablist">
              {(
                [
                  ['desc', 'Description'],
                  ['specs', 'Spécifications'],
                  ['livraison', 'Livraison'],
                  ['garantie', 'Garantie'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pdp-tabpanel panel" role="tabpanel">
              {tab === 'desc' && <p>{description}</p>}
              {tab === 'specs' && (
                <ul className="pdp-specs">
                  {highlights.map((h) => (
                    <li key={`spec-${h.label}`}>
                      <span>{h.label}</span>
                      <strong>{h.value}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'livraison' && (
                <>
                  <p>
                    Livraison Abidjan / périphérie ou retrait showroom sous 24–48 h
                    après confirmation. Paiement au retrait selon paramètres boutique.
                  </p>
                  <Link
                    to="/retours"
                    className="section-link"
                    style={{ display: 'inline-block', marginTop: '1rem' }}
                  >
                    Politique de retours →
                  </Link>
                </>
              )}
              {tab === 'garantie' && (
                <p>
                  {data.typeProduit === 'PRESTATION'
                    ? 'Prestation réalisée par l’équipe showroom — reprise sous conditions si non conforme au devis.'
                    : 'Garantie constructeur / boutique selon famille de produit. Conservez la facture. Montage atelier disponible.'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="pdp-trust">
          {TRUST.map((t) => (
            <div key={t.title} className="pdp-trust-item">
              <strong>{t.title}</strong>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      </div>

      {relatedItems.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>Vous aimerez aussi</h2>
              <p>
                {personalized.data?.pourVous?.length
                  ? 'Selon vos centres d’intérêt'
                  : `Même rayon — ${data.categorie}`}
              </p>
            </div>
            {data.categorie && (
              <Link
                className="section-link"
                to={`/catalogue/${encodeURIComponent(data.categorie)}`}
              >
                Voir le rayon →
              </Link>
            )}
          </div>
          <div className="product-grid product-grid-dense">
            {relatedItems.map((p, i) => (
              <ProductCard
                key={p.id}
                p={p}
                index={i}
                dense
                badge={'badge' in p ? p.badge : undefined}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
