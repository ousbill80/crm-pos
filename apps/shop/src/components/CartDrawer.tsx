import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatFcfa, shopFetch, type PanierDto } from '../lib/api';
import { useCart } from '../lib/cart';

export function CartDrawer() {
  const { panier, drawerOpen, closeDrawer, setQuantite, removeProduit, isLoading } =
    useCart();

  // keep query warm
  useQuery({
    queryKey: ['panier'],
    queryFn: () => shopFetch<PanierDto>('/shop/panier'),
    retry: false,
    enabled: drawerOpen,
  });

  if (!drawerOpen) return null;

  const lignes = panier?.lignes ?? [];
  const total = panier?.montantTotal ?? 0;

  return (
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label="Panier">
      <button type="button" className="drawer-backdrop" aria-label="Fermer" onClick={closeDrawer} />
      <aside className="drawer-panel">
        <header className="drawer-head">
          <h2>Panier</h2>
          <button type="button" className="icon-btn" onClick={closeDrawer} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="drawer-body">
          {isLoading && <p className="muted">Chargement…</p>}
          {!isLoading && lignes.length === 0 && (
            <div className="drawer-empty">
              <p>Votre panier est vide.</p>
              <Link className="btn" to="/catalogue" onClick={closeDrawer}>
                Voir le catalogue
              </Link>
            </div>
          )}
          {lignes.map((l) => (
            <div key={l.produitId} className="drawer-line">
              <div className="drawer-line-media" aria-hidden>
                {(l.designation?.[0] ?? 'M').toUpperCase()}
              </div>
              <div className="drawer-line-info">
                <strong>{l.designation}</strong>
                <span className="muted">
                  {formatFcfa(
                    (panier?.modeAffichage === 'TTC'
                      ? l.prixUnitaireTtc
                      : l.prixUnitaireHt) * l.quantite,
                  )}
                </span>
                <div className="qty qty-sm">
                  <button
                    type="button"
                    onClick={() => void setQuantite(l.produitId, l.quantite - 1)}
                  >
                    −
                  </button>
                  <span>{l.quantite}</span>
                  <button
                    type="button"
                    onClick={() => void setQuantite(l.produitId, l.quantite + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="linkish"
                onClick={() => void removeProduit(l.produitId)}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>

        {lignes.length > 0 && (
          <footer className="drawer-foot">
            <div className="drawer-total">
              <span>Total</span>
              <strong>{formatFcfa(total)}</strong>
            </div>
            <Link className="btn" to="/checkout" onClick={closeDrawer}>
              Commander
            </Link>
            <Link className="btn btn-ghost" to="/panier" onClick={closeDrawer}>
              Voir le panier
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
