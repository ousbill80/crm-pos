import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  formatFcfa,
  shopFetch,
  type CatalogueResponse,
} from '../lib/api';
import { PANIER_SEUIL_AVANTAGE } from '../lib/brand';
import { useCart } from '../lib/cart';
import { ProductCard, ProductMedia } from '../components/ProductCard';

export default function PanierPage() {
  const {
    panier,
    isLoading,
    isMutating,
    setQuantite,
    removeProduit,
    clear,
    count,
    lastAddedId,
    addProduit,
  } = useCart();

  const lignes = panier?.lignes ?? [];
  const sousTotal =
    panier?.modeAffichage === 'HT'
      ? (panier?.montantArticlesHt ?? 0)
      : (panier?.montantArticlesTtc ?? panier?.montantTotal ?? 0);
  const seuil = PANIER_SEUIL_AVANTAGE;
  const pct = Math.min(100, Math.round((sousTotal / seuil) * 100));
  const restant = Math.max(0, seuil - sousTotal);

  const excludeIds = useMemo(
    () => new Set(lignes.map((l) => l.produitId)),
    [lignes],
  );

  const { data: recos } = useQuery({
    queryKey: ['catalogue', 'panier-page-recos'],
    queryFn: () => shopFetch<CatalogueResponse>('/shop/catalogue?limit=16'),
    staleTime: 60_000,
  });

  const suggestions = useMemo(
    () =>
      (recos?.items ?? []).filter((p) => !excludeIds.has(p.id)).slice(0, 8),
    [recos, excludeIds],
  );

  if (isLoading && !panier) {
    return (
      <div className="section panier-temu">
        <p className="muted">Chargement du panier…</p>
      </div>
    );
  }

  if (!lignes.length) {
    return (
      <div className="section panier-temu">
        <header className="panier-page-head">
          <h1>Panier</h1>
          <p>Votre panier est vide — inspirez-vous des pièces populaires.</p>
        </header>
        <Link className="btn cart-cta" to="/catalogue">
          Continuer vos achats
        </Link>
        {suggestions.length > 0 && (
          <section className="panier-page-recos" style={{ marginTop: '2rem' }}>
            <h2>Populaires en ce moment</h2>
            <div className="product-grid product-grid-dense">
              {suggestions.map((p, i) => (
                <div key={p.id} className="panier-page-reco-card">
                  <ProductCard p={p} index={i} dense />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                    disabled={isMutating}
                    onClick={() => void addProduit(p.id, 1)}
                  >
                    Ajouter au panier
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="section panier-temu">
      <header className="panier-page-head">
        <div>
          <h1>Panier ({count})</h1>
          <p>Vérifiez vos articles — stock réservé {panier?.ttlMinutes ?? 30} min</p>
        </div>
        <button
          type="button"
          className="linkish"
          disabled={isMutating}
          onClick={() => {
            if (window.confirm('Vider le panier ?')) void clear();
          }}
        >
          Tout retirer
        </button>
      </header>

      <div className={`cart-ship${restant <= 0 ? ' is-ok' : ''}`}>
        <div className="cart-ship-top">
          <span className="cart-ship-ico" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="currentColor"
                d="M3 7h11v8H3V7Zm13 2h3.2L22 12.5V15h-6V9Z"
              />
            </svg>
          </span>
          {restant <= 0 ? (
            <p>
              <strong>Avantage panier atteint</strong> — priorité préparation
            </p>
          ) : (
            <p>
              Encore <strong>{formatFcfa(restant)}</strong> pour l&apos;avantage
              livraison / priorité atelier
            </p>
          )}
        </div>
        <div className="cart-ship-track" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="panier-page-grid">
        <div className="panier-page-lines">
          {lignes.map((l) => {
            const unit =
              panier?.modeAffichage === 'HT'
                ? l.prixUnitaireHt
                : l.prixUnitaireTtc;
            const line = unit * l.quantite;
            return (
              <article
                key={l.produitId}
                className={`cart-line panier-page-line${
                  l.produitId === lastAddedId ? ' is-flash' : ''
                }`}
              >
                <Link
                  to={l.slug ? `/produit/${l.slug}` : '/catalogue'}
                  className="cart-line-media"
                >
                  <ProductMedia
                    designation={l.designation}
                    imageUrl={l.imageUrl}
                  />
                </Link>
                <div className="cart-line-body">
                  <Link
                    className="cart-line-title"
                    to={l.slug ? `/produit/${l.slug}` : '/catalogue'}
                  >
                    {l.designation}
                  </Link>
                  {l.reference && (
                    <span className="cart-line-ref">{l.reference}</span>
                  )}
                  <div className="cart-line-price-row">
                    <strong>{formatFcfa(line)}</strong>
                    <span className="muted">{formatFcfa(unit)} / u</span>
                  </div>
                  <div className="cart-line-actions">
                    <div className={`qty qty-sm${isMutating ? ' is-busy' : ''}`}>
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => void setQuantite(l.produitId, l.quantite - 1)}
                      >
                        −
                      </button>
                      <span>{l.quantite}</span>
                      <button
                        type="button"
                        disabled={
                          isMutating ||
                          (l.stockDisponible != null &&
                            l.quantite >= l.stockDisponible)
                        }
                        onClick={() => void setQuantite(l.produitId, l.quantite + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="cart-line-remove"
                      disabled={isMutating}
                      onClick={() => void removeProduit(l.produitId)}
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="panier-page-summary">
          <div className="panier-summary-card">
            <h2>Récapitulatif</h2>
            <div className="panier-summary-row">
              <span>Articles ({count})</span>
              <strong>{formatFcfa(sousTotal)}</strong>
            </div>
            <div className="panier-summary-row muted">
              <span>Livraison</span>
              <em>Au checkout</em>
            </div>
            <div className="panier-summary-total">
              <span>Total estimé</span>
              <strong>{formatFcfa(sousTotal)}</strong>
            </div>
            <Link className="btn cart-cta" to="/checkout">
              Passer commande
            </Link>
            <Link className="btn btn-ghost" to="/catalogue">
              Continuer mes achats
            </Link>
            <p className="panier-summary-trust">
              Wave · Orange Money · Carte · Retrait showroom
            </p>
          </div>
        </aside>
      </div>

      {suggestions.length > 0 && (
        <section className="panier-page-recos">
          <h2>Complétez votre panier</h2>
          <div className="cart-recos-rail panier-page-rail">
            {suggestions.map((p) => (
              <div key={p.id} className="cart-reco">
                <Link
                  to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
                  className="cart-reco-media"
                >
                  <ProductMedia
                    designation={p.designation}
                    imageUrl={p.imageUrl}
                  />
                </Link>
                <Link
                  to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
                  className="cart-reco-title"
                >
                  {p.designation}
                </Link>
                <strong>{formatFcfa(p.prixAffiche)}</strong>
                <button
                  type="button"
                  className="cart-reco-add"
                  disabled={isMutating}
                  onClick={() => void addProduit(p.id, 1)}
                >
                  + Ajouter
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
