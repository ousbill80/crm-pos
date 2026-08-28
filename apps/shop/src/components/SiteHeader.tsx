import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { CATEGORIES } from '../lib/brand';
import {
  headerAccountLabel,
  readShopSession,
  SHOP_AUTH_EVENT,
} from '../lib/shopAuth';
import { shopFetch } from '../lib/api';

function BrandMark() {
  return (
    <Link to="/" className="brand" aria-label="MAJOR AUTO PARTS — Accueil">
      <span className="brand-major">MAJOR</span>
      <span className="brand-auto">AUTO PARTS</span>
    </Link>
  );
}

export function AnnouncementBar() {
  const message =
    'Livraison partout en CIV · Retrait showroom · Wave / Orange Money / Carte';
  const loop = Array.from({ length: 6 }, (_, i) => (
    <span key={i} className="announce-item">
      {message}
    </span>
  ));

  return (
    <div className="announce" role="region" aria-label="Annonces">
      <div className="announce-track">
        {loop}
        {loop}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { count, openDrawer } = useCart();
  const nav = useNavigate();
  const menuId = useId();
  const [megaOpen, setMegaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState('');
  const [mobileQ, setMobileQ] = useState('');
  const [accountLabel, setAccountLabel] = useState('Compte');
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const megaTimer = useRef<number | null>(null);

  useEffect(() => {
    function syncLabel() {
      const { token, email, displayName } = readShopSession();
      if (!token) {
        setAccountLabel('Compte');
        return;
      }
      setAccountLabel(headerAccountLabel(displayName, email));
    }
    syncLabel();
    window.addEventListener(SHOP_AUTH_EVENT, syncLabel);
    window.addEventListener('storage', syncLabel);
    return () => {
      window.removeEventListener(SHOP_AUTH_EVENT, syncLabel);
      window.removeEventListener('storage', syncLabel);
    };
  }, []);

  useEffect(() => {
    const { token, displayName } = readShopSession();
    if (!token || displayName) return;
    void shopFetch<{ displayName: string; email: string; prenom: string; nom: string }>(
      '/shop/compte/moi',
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((moi) => {
        localStorage.setItem('shop_display_name', moi.displayName);
        localStorage.setItem('shop_email', moi.email);
        if (moi.prenom) localStorage.setItem('shop_prenom', moi.prenom);
        if (moi.nom) localStorage.setItem('shop_nom', moi.nom);
        window.dispatchEvent(new Event(SHOP_AUTH_EVENT));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('mobile-menu-open');
    const t = window.setTimeout(() => mobileSearchRef.current?.focus(), 180);
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove('mobile-menu-open');
      window.clearTimeout(t);
    };
  }, [mobileOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMegaOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function openMega() {
    if (megaTimer.current) window.clearTimeout(megaTimer.current);
    setMegaOpen(true);
  }

  function closeMegaDelayed() {
    megaTimer.current = window.setTimeout(() => setMegaOpen(false), 160);
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  function submitSearch(e: FormEvent, termSource: string) {
    e.preventDefault();
    const term = termSource.trim();
    setSearchOpen(false);
    setMobileOpen(false);
    setQ('');
    setMobileQ('');
    nav(term ? `/catalogue?q=${encodeURIComponent(term)}` : '/catalogue');
  }

  return (
    <>
      <AnnouncementBar />
      <header className={`site-header${megaOpen ? ' mega-open' : ''}`}>
        <div className="header-left">
          <button
            type="button"
            className={`nav-burger${mobileOpen ? ' is-open' : ''}`}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
            aria-controls={menuId}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          <NavLink to="/catalogue" className="nav-link desktop-only">
            Catalogue
          </NavLink>
          <div
            className="nav-mega-wrap desktop-only"
            onMouseEnter={openMega}
            onMouseLeave={closeMegaDelayed}
          >
            <button
              type="button"
              className={`nav-link nav-mega-btn${megaOpen ? ' active' : ''}`}
              aria-expanded={megaOpen}
              onClick={() => setMegaOpen((v) => !v)}
            >
              Rayons
            </button>
          </div>
        </div>

        <BrandMark />

        <div className="header-right">
          <button
            type="button"
            className="icon-btn"
            aria-label="Rechercher"
            onClick={() => setSearchOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <NavLink
            to="/compte"
            className="nav-link desktop-only nav-compte"
            title={accountLabel === 'Compte' ? 'Mon compte' : `Compte — ${accountLabel}`}
          >
            {accountLabel}
          </NavLink>
          <button
            type="button"
            className="pill-cart"
            onClick={() => openDrawer()}
            aria-label={`Panier${count ? `, ${count} articles` : ''}`}
          >
            Panier
            {count > 0 && (
              <span className="cart-badge">{count > 99 ? '99+' : count}</span>
            )}
          </button>
        </div>

        {megaOpen && (
          <div
            className="mega-panel"
            onMouseEnter={openMega}
            onMouseLeave={closeMegaDelayed}
          >
            <div className="mega-inner">
              <div className="mega-intro">
                <h3>Univers showroom</h3>
                <p>Tuning, jantes, phares, mécanique et finitions premium.</p>
                <Link
                  to="/catalogue"
                  className="section-link"
                  onClick={() => setMegaOpen(false)}
                >
                  Tout le catalogue →
                </Link>
              </div>
              <div className="mega-grid">
                {CATEGORIES.map((c) => (
                  <Link
                    key={c.slug}
                    to={`/catalogue/${encodeURIComponent(c.label)}`}
                    className="mega-item"
                    onClick={() => setMegaOpen(false)}
                  >
                    <strong>{c.label}</strong>
                    <span>{c.hint}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {mobileOpen && (
        <div className="mobile-nav-root" role="presentation">
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Fermer le menu"
            onClick={closeMobile}
          />
          <nav
            id={menuId}
            className="mobile-nav"
            aria-label="Navigation boutique"
          >
            <div className="mobile-nav-head">
              <p className="mobile-nav-title">Explorer la boutique</p>
              <button
                type="button"
                className="icon-btn"
                aria-label="Fermer"
                onClick={closeMobile}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <form
              className="mobile-nav-search"
              onSubmit={(e) => submitSearch(e, mobileQ)}
            >
              <input
                ref={mobileSearchRef}
                value={mobileQ}
                onChange={(e) => setMobileQ(e.target.value)}
                placeholder="Référence, pièce, marque…"
                aria-label="Rechercher dans le catalogue"
              />
              <button type="submit" className="btn btn-sm">
                Chercher
              </button>
            </form>

            <div className="mobile-nav-quick">
              <NavLink to="/catalogue" onClick={closeMobile}>
                <strong>Catalogue</strong>
                <span>Tout le stock showroom</span>
              </NavLink>
              <NavLink to="/compte" onClick={closeMobile}>
                <strong>
                  {accountLabel === 'Compte' ? 'Mon compte' : accountLabel}
                </strong>
                <span>
                  {accountLabel === 'Compte'
                    ? 'Commandes & suivi'
                    : 'Espace client connecté'}
                </span>
              </NavLink>
              <button
                type="button"
                className="mobile-nav-quick-btn"
                onClick={() => {
                  closeMobile();
                  openDrawer();
                }}
              >
                <strong>Panier{count > 0 ? ` (${count})` : ''}</strong>
                <span>Finaliser ou modifier</span>
              </button>
            </div>

            <div className="mobile-nav-section">
              <p className="mobile-nav-label">Rayons</p>
              <div className="mobile-nav-cats">
                {CATEGORIES.map((c, i) => (
                  <Link
                    key={c.slug}
                    to={`/catalogue/${encodeURIComponent(c.label)}`}
                    className="mobile-nav-cat"
                    style={{ animationDelay: `${0.04 + i * 0.03}s` }}
                    onClick={closeMobile}
                  >
                    <strong>{c.label}</strong>
                    <span>{c.hint}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mobile-nav-foot">
              <p>Livraison Abidjan · Retrait showroom</p>
              <p>Wave · Orange Money · Carte</p>
              <Link to="/catalogue" className="section-link" onClick={closeMobile}>
                Voir tout le catalogue →
              </Link>
            </div>
          </nav>
        </div>
      )}

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true">
          <form className="search-box" onSubmit={(e) => submitSearch(e, q)}>
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une pièce, une référence…"
              aria-label="Recherche"
            />
            <button type="submit" className="btn">
              Chercher
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSearchOpen(false)}
            >
              Fermer
            </button>
          </form>
        </div>
      )}
    </>
  );
}
