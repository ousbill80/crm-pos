import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  formatFcfa,
  shopFetch,
  type PanierLigne,
} from '../lib/api';
import { PANIER_SEUIL_AVANTAGE } from '../lib/brand';
import { getShopSessionId } from '../lib/aarrr';
import { useCart } from '../lib/cart';
import { ProductMedia } from './ProductCard';

function ligneMontant(l: PanierLigne, mode?: string) {
  const unit = mode === 'HT' ? l.prixUnitaireHt : l.prixUnitaireTtc;
  return unit * l.quantite;
}

function ShippingBar({ sousTotal }: { sousTotal: number }) {
  const seuil = PANIER_SEUIL_AVANTAGE;
  const pct = Math.min(100, Math.round((sousTotal / seuil) * 100));
  const restant = Math.max(0, seuil - sousTotal);
  const ok = restant <= 0;

  return (
    <div className={`cart-ship${ok ? ' is-ok' : ''}`}>
      <div className="cart-ship-top">
        <span className="cart-ship-ico" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M3 7h11v8H3V7Zm13 2h3.2L22 12.5V15h-6V9Zm-1-2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12Z"
            />
          </svg>
        </span>
        {ok ? (
          <p>
            <strong>Avantage panier atteint</strong> — priorité préparation &amp;
            retrait showroom gratuit
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
      <p className="cart-ship-hint">
        Retrait showroom toujours gratuit · frais de zone au checkout
      </p>
    </div>
  );
}

function CartLine({
  l,
  mode,
  highlight,
  busy,
  onQty,
  onRemove,
  onNavigate,
}: {
  l: PanierLigne;
  mode?: string;
  highlight?: boolean;
  busy?: boolean;
  onQty: (q: number) => void;
  onRemove: () => void;
  onNavigate?: () => void;
}) {
  const stock = l.stockDisponible;
  const low =
    stock != null && stock > 0 && stock <= 3
      ? `Plus que ${stock}`
      : stock === 0
        ? 'Stock limité'
        : null;
  const unit = mode === 'HT' ? l.prixUnitaireHt : l.prixUnitaireTtc;
  const media = (
    <div className="cart-line-media">
      <ProductMedia designation={l.designation} imageUrl={l.imageUrl} />
    </div>
  );

  return (
    <article className={`cart-line${highlight ? ' is-flash' : ''}`}>
      {l.slug ? (
        <Link to={`/produit/${l.slug}`} onClick={onNavigate}>
          {media}
        </Link>
      ) : (
        media
      )}
      <div className="cart-line-body">
        {highlight && <span className="cart-just-added">Ajouté</span>}
        {l.slug ? (
          <Link
            className="cart-line-title"
            to={`/produit/${l.slug}`}
            onClick={onNavigate}
          >
            {l.designation}
          </Link>
        ) : (
          <strong className="cart-line-title">{l.designation}</strong>
        )}
        {l.reference && <span className="cart-line-ref">{l.reference}</span>}
        <div className="cart-line-price-row">
          <strong>{formatFcfa(ligneMontant(l, mode))}</strong>
          <span className="muted">{formatFcfa(unit)} / u</span>
        </div>
        {low && <span className="cart-line-stock">{low}</span>}
        <div className="cart-line-actions">
          <div className={`qty qty-sm${busy ? ' is-busy' : ''}`}>
            <button
              type="button"
              aria-label="Diminuer"
              disabled={busy}
              onClick={() => onQty(l.quantite - 1)}
            >
              −
            </button>
            <span>{l.quantite}</span>
            <button
              type="button"
              aria-label="Augmenter"
              disabled={busy || (stock != null && l.quantite >= stock)}
              onClick={() => onQty(l.quantite + 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="cart-line-remove"
            disabled={busy}
            onClick={onRemove}
          >
            Retirer
          </button>
        </div>
      </div>
    </article>
  );
}

function CartRecos({
  excludeIds,
  onClose,
}: {
  excludeIds: Set<string>;
  onClose: () => void;
}) {
  const { addProduit, isMutating } = useCart();
  const { data } = useQuery({
    queryKey: ['shop-decouverte', 'cart'],
    queryFn: () =>
      shopFetch<{
        pourVous: Array<{
          id: string;
          slug: string | null;
          designation: string;
          prixAffiche: number;
          imageUrl?: string | null;
          badge?: string;
        }>;
        profil?: { message: string; personnalise: boolean };
      }>(
        `/shop/decouverte?sessionId=${encodeURIComponent(getShopSessionId())}`,
      ),
    staleTime: 30_000,
  });

  const items = useMemo(
    () =>
      (data?.pourVous ?? [])
        .filter((p) => !excludeIds.has(p.id))
        .slice(0, 8),
    [data, excludeIds],
  );

  if (!items.length) return null;

  return (
    <section className="cart-recos" aria-label="Suggestions">
      <header className="cart-recos-head">
        <h3>
          {data?.profil?.personnalise
            ? 'Pour vous'
            : 'Vous aimerez aussi'}
        </h3>
        <Link to="/catalogue" onClick={onClose}>
          Voir tout
        </Link>
      </header>
      {data?.profil?.message && (
        <p className="cart-recos-hint">{data.profil.message}</p>
      )}
      <div className="cart-recos-rail">
        {items.map((p) => (
          <div key={p.id} className="cart-reco">
            <Link
              to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
              className="cart-reco-media"
              onClick={onClose}
            >
              <ProductMedia
                designation={p.designation}
                imageUrl={p.imageUrl}
              />
            </Link>
            <Link
              to={p.slug ? `/produit/${p.slug}` : '/catalogue'}
              className="cart-reco-title"
              onClick={onClose}
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
  );
}

export function CartDrawer() {
  const {
    panier,
    drawerOpen,
    closeDrawer,
    setQuantite,
    removeProduit,
    isLoading,
    isMutating,
    lastAddedId,
    count,
  } = useCart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (drawerOpen) setMounted(true);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, closeDrawer]);

  const lignes = panier?.lignes ?? [];
  const sousTotal =
    panier?.modeAffichage === 'HT'
      ? (panier?.montantArticlesHt ?? 0)
      : (panier?.montantArticlesTtc ?? panier?.montantTotal ?? 0);
  const excludeIds = useMemo(
    () => new Set(lignes.map((l) => l.produitId)),
    [lignes],
  );

  if (!mounted && !drawerOpen) return null;

  return (
    <div
      className={`drawer-root cart-drawer-temu${drawerOpen ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Panier"
      aria-hidden={!drawerOpen}
    >
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Fermer"
        onClick={closeDrawer}
      />
      <aside className="drawer-panel cart-panel">
        <header className="drawer-head cart-head">
          <div>
            <h2>Panier</h2>
            <p className="cart-head-meta">
              {count === 0
                ? 'Aucun article'
                : `${count} article${count > 1 ? 's' : ''}`}
              {panier?.ttlMinutes ? ` · réservé ${panier.ttlMinutes} min` : ''}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={closeDrawer}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        {lignes.length > 0 && <ShippingBar sousTotal={sousTotal} />}

        <div className="drawer-body cart-body">
          {isLoading && !panier && <p className="muted">Chargement…</p>}

          {!isLoading && lignes.length === 0 && (
            <div className="drawer-empty cart-empty">
              <div className="cart-empty-ico" aria-hidden>
                <svg viewBox="0 0 24 24" width="40" height="40">
                  <path
                    fill="currentColor"
                    d="M7 4h-2l-1 2v2h2l3.6 7.59-1.35 2.41A2 2 0 0 0 10 20h10v-2H10.42a.25.25 0 0 1-.22-.37L11.1 15h7.45a2 2 0 0 0 1.8-1.1L23 8H6.21l-.94-2H2V4h3.3L7 4Zm3 16a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
                  />
                </svg>
              </div>
              <p>Votre panier est vide</p>
              <span className="muted">
                Ajoutez des pièces — suggestions ci-dessous
              </span>
              <Link className="btn cart-cta" to="/catalogue" onClick={closeDrawer}>
                Parcourir le catalogue
              </Link>
            </div>
          )}

          <div className="cart-lines">
            {lignes.map((l) => (
              <CartLine
                key={l.produitId}
                l={l}
                mode={panier?.modeAffichage}
                highlight={l.produitId === lastAddedId}
                busy={isMutating}
                onQty={(q) => void setQuantite(l.produitId, q)}
                onRemove={() => void removeProduit(l.produitId)}
                onNavigate={closeDrawer}
              />
            ))}
          </div>

          <CartRecos excludeIds={excludeIds} onClose={closeDrawer} />
        </div>

        {lignes.length > 0 && (
          <footer className="drawer-foot cart-foot">
            <div className="cart-foot-rows">
              <div>
                <span>Sous-total</span>
                <strong>{formatFcfa(sousTotal)}</strong>
              </div>
              <div className="cart-foot-note">
                <span>Livraison</span>
                <em>Calculée au checkout</em>
              </div>
            </div>
            <Link
              className="btn cart-cta"
              to="/checkout"
              onClick={closeDrawer}
            >
              Commander · {formatFcfa(sousTotal)}
            </Link>
            <div className="cart-foot-links">
              <Link to="/panier" onClick={closeDrawer}>
                Voir le panier
              </Link>
              <button type="button" className="linkish" onClick={closeDrawer}>
                Continuer mes achats
              </button>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}
