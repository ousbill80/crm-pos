import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  formatFcfa,
  shopFetch,
  type CatalogueItem,
  type CatalogueResponse,
} from '../lib/api';
import { useCart } from '../lib/cart';
import { TRUST } from '../lib/brand';

type ProduitDetail = CatalogueItem & {
  prixUnitaireHt?: number;
  prixUnitaireTtc?: number;
  modeAffichage?: string;
};

const GALLERY_TONES = [
  'radial-gradient(circle at 30% 20%, rgba(201,162,39,.35), transparent 50%), linear-gradient(160deg,#2a3344,#0a0c10)',
  'radial-gradient(circle at 70% 30%, rgba(224,193,90,.22), transparent 45%), linear-gradient(200deg,#1a2230,#07080b)',
  'radial-gradient(circle at 40% 70%, rgba(61,186,139,.18), transparent 50%), linear-gradient(140deg,#222937,#0b0e14)',
  'radial-gradient(circle at 50% 40%, rgba(244,241,234,.12), transparent 55%), linear-gradient(180deg,#171c26,#050608)',
];

export default function ProduitPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { addProduit } = useCart();
  const [qty, setQty] = useState(1);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [tab, setTab] = useState<'desc' | 'livraison' | 'compat'>('desc');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['produit', slug],
    queryFn: () => shopFetch<ProduitDetail>(`/shop/catalogue/produit/${slug}`),
    enabled: !!slug,
  });

  const related = useQuery({
    queryKey: ['related', data?.categorie, data?.id],
    queryFn: () =>
      shopFetch<CatalogueResponse>(
        `/shop/catalogue?categorie=${encodeURIComponent(data!.categorie!)}&tri=designation`,
      ),
    enabled: !!data?.categorie,
  });

  const relatedItems = useMemo(
    () =>
      (related.data?.items ?? [])
        .filter((p) => p.id !== data?.id)
        .slice(0, 4),
    [related.data, data?.id],
  );

  const stockOk =
    data?.stockDisponible == null || data.stockDisponible > 0;
  const maxQty = Math.min(
    20,
    data?.stockDisponible != null && data.stockDisponible > 0
      ? data.stockDisponible
      : 20,
  );

  async function handleAdd(goCheckout = false) {
    if (!data) return;
    setAdding(true);
    setErr(null);
    try {
      await addProduit(data.id, qty);
      setAdded(true);
      if (goCheckout) nav('/checkout');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ajout impossible');
    } finally {
      setAdding(false);
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
    `${data.designation} — pièce / accessoire véhicule sélectionné par MAJOR AUTO PARTS. Compatible multi-marques selon montage. Qualité premium, stock showroom et livraison.`;

  return (
    <>
      <div className="section pdp flash">
        <nav className="breadcrumb" aria-label="Fil d’Ariane">
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

        <div className="product-detail pdp-grid">
          <div className="pdp-gallery">
            <div
              className="pdp-stage"
              style={{ background: GALLERY_TONES[galleryIdx] }}
            >
              {data.imageUrl && !data.imageUrl.startsWith('data:image/svg') ? (
                <img src={data.imageUrl} alt={data.designation} />
              ) : (
                <span className="pdp-letter" aria-hidden>
                  {letter}
                </span>
              )}
              {stockOk ? (
                <span className="pdp-badge ok">En stock</span>
              ) : (
                <span className="pdp-badge out">Rupture</span>
              )}
            </div>
            <div className="pdp-thumbs" role="tablist" aria-label="Vues produit">
              {GALLERY_TONES.map((tone, i) => (
                <button
                  key={i}
                  type="button"
                  className={`pdp-thumb${galleryIdx === i ? ' active' : ''}`}
                  style={{ background: tone }}
                  onClick={() => setGalleryIdx(i)}
                  aria-label={`Vue ${i + 1}`}
                >
                  <span>{letter}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pdp-info">
            {data.categorie && (
              <Link
                className="pdp-cat"
                to={`/catalogue/${encodeURIComponent(data.categorie)}`}
              >
                {data.categorie}
              </Link>
            )}
            <h1 className="page-title pdp-title">{data.designation}</h1>
            {data.reference && (
              <p className="pdp-sku">Réf. {data.reference}</p>
            )}

            <div className="pdp-price-block">
              <p className="pdp-price">{formatFcfa(data.prixAffiche)}</p>
              <p className="muted pdp-tax">
                Prix affiché{' '}
                {data.modeAffichage === 'TTC' ? 'TTC' : 'HT'}
                {data.prixUnitaireHt != null &&
                  data.prixUnitaireTtc != null &&
                  data.modeAffichage !== 'TTC' &&
                  ` · TTC ${formatFcfa(data.prixUnitaireTtc)}`}
              </p>
            </div>

            <p className="pdp-stock">
              {data.stockDisponible == null
                ? 'Disponibilité sur demande — contactez le showroom'
                : data.stockDisponible > 0
                  ? `${data.stockDisponible} unités disponibles`
                  : 'Temporairement indisponible'}
            </p>

            <p className="pdp-lead">{description.slice(0, 180)}{description.length > 180 ? '…' : ''}</p>

            <div className="pdp-buy">
              <div className="qty" aria-label="Quantité">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Diminuer"
                  disabled={!stockOk}
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
                  disabled={!stockOk}
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  aria-label="Augmenter"
                  disabled={!stockOk}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn pdp-atc"
                disabled={!stockOk || adding}
                onClick={() => void handleAdd(false)}
              >
                {adding ? 'Ajout…' : 'Ajouter au panier'}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost pdp-buy-now"
              disabled={!stockOk || adding}
              onClick={() => void handleAdd(true)}
            >
              Acheter maintenant
            </button>

            {added && (
              <p className="pdp-toast">
                Ajouté au panier — <Link to="/panier">voir le panier</Link>
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

        <div className="pdp-tabs">
          <div className="pdp-tablist" role="tablist">
            {(
              [
                ['desc', 'Description'],
                ['livraison', 'Livraison & retours'],
                ['compat', 'Compatibilité'],
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
            {tab === 'desc' && (
              <>
                <p>{description}</p>
                <ul className="pdp-specs">
                  <li>
                    <span>Catégorie</span>
                    <strong>{data.categorie ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Référence</span>
                    <strong>{data.reference ?? '—'}</strong>
                  </li>
                  <li>
                    <span>Marque boutique</span>
                    <strong>MAJOR AUTO PARTS</strong>
                  </li>
                </ul>
              </>
            )}
            {tab === 'livraison' && (
              <>
                <p>
                  Livraison selon zone (Abidjan et périphérie) ou retrait en boutique
                  sous 24–48 h après confirmation. Paiement au retrait possible
                  selon paramètres boutique.
                </p>
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  Retours sous 7 jours si produit non monté, emballage d’origine.
                  Voir les conditions de retour.
                </p>
                <Link to="/retours" className="section-link" style={{ display: 'inline-block', marginTop: '1rem' }}>
                  Politique de retours →
                </Link>
              </>
            )}
            {tab === 'compat' && (
              <p>
                Compatible véhicules tous modèles / toutes marques selon référence
                constructeur. Pour Mercedes, Toyota, BMW, Audi, Hyundai et autres —
                vérifiez l’adaptation au showroom ou contactez notre atelier avant
                montage.
              </p>
            )}
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
              <p>Même rayon — {data.categorie}</p>
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
          <div className="product-grid">
            {relatedItems.map((p) => (
              <Link
                key={p.id}
                to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
                className="product"
              >
                <div className="product-media">
                  {(p.designation?.[0] ?? 'M').toUpperCase()}
                </div>
                <div className="product-body">
                  {p.categorie && <span className="meta">{p.categorie}</span>}
                  <h3>{p.designation}</h3>
                  <span className="price">{formatFcfa(p.prixAffiche)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
