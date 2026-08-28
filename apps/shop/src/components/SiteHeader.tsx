import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { CATEGORIES } from '../lib/brand';
import {
  headerAccountLabel,
  readShopSession,
  SHOP_AUTH_EVENT,
} from '../lib/shopAuth';
import { shopFetch } from '../lib/api';

function Icon({
  children,
  size = 18,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="nav-icon"
    >
      {children}
    </svg>
  );
}

function IconGrid() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
    </Icon>
  );
}

function IconLayers() {
  return (
    <Icon>
      <path
        d="M12 3.5L3.5 8 12 12.5 20.5 8 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.5L12 17l8.5-4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 16.5L12 21l8.5-4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

function IconSearch() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  );
}

function IconUser() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5 19.2c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  );
}

function IconBag() {
  return (
    <Icon>
      <path
        d="M3.5 5.5h1.7l1.15 9.2a1.7 1.7 0 001.68 1.48h8.55a1.7 1.7 0 001.66-1.35L19.5 8H7.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.2" cy="19.2" r="1.35" fill="currentColor" />
      <circle cx="16.3" cy="19.2" r="1.35" fill="currentColor" />
    </Icon>
  );
}

function IconChevron({ open }: { open?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`nav-chevron${open ? ' is-open' : ''}`}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <Icon>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Icon>
  );
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  tuning: (
    <Icon size={16}>
      <path
        d="M4 16l4-8 4 4 4-6 4 10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  jantes: (
    <Icon size={16}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="currentColor" strokeWidth="1.5" />
    </Icon>
  ),
  phares: (
    <Icon size={16}>
      <path
        d="M5 12h7a5 5 0 010 0H5z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 7a5 5 0 010 10H8V7h4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M17 8l3-1M17 12h4M17 16l3 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  ),
  eclairage: (
    <Icon size={16}>
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 014 10c-.8.9-1.3 1.9-1.5 3H9.5c-.2-1.1-.7-2.1-1.5-3A6 6 0 0112 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  housses: (
    <Icon size={16}>
      <path
        d="M5 19V9.5L12 5l7 4.5V19H5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 5v14" stroke="currentColor" strokeWidth="1.5" />
    </Icon>
  ),
  electronique: (
    <Icon size={16}>
      <rect x="5" y="6" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 18v2M15 18v2M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  ),
  mecanique: (
    <Icon size={16}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Icon>
  ),
  accessoires: (
    <Icon size={16}>
      <path
        d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5L12 14.8 7.5 16.7l.9-5L4.8 8.2l5-.7L12 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Icon>
  ),
};

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
  const [badgePulse, setBadgePulse] = useState(false);
  const prevCount = useRef(count);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const megaTimer = useRef<number | null>(null);

  useEffect(() => {
    if (count > prevCount.current) {
      setBadgePulse(true);
      const t = window.setTimeout(() => setBadgePulse(false), 700);
      prevCount.current = count;
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

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

  const accountShort = accountLabel === 'Compte' ? 'Compte' : accountLabel;

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
          <NavLink to="/catalogue" className="nav-item desktop-only">
            <IconGrid />
            <span>Catalogue</span>
          </NavLink>
          <div
            className="nav-mega-wrap desktop-only"
            onMouseEnter={openMega}
            onMouseLeave={closeMegaDelayed}
          >
            <button
              type="button"
              className={`nav-item nav-mega-btn${megaOpen ? ' active' : ''}`}
              aria-expanded={megaOpen}
              onClick={() => setMegaOpen((v) => !v)}
            >
              <IconLayers />
              <span>Rayons</span>
              <IconChevron open={megaOpen} />
            </button>
          </div>
        </div>

        <BrandMark />

        <div className="header-right">
          <button
            type="button"
            className="nav-item nav-item-icon"
            aria-label="Rechercher"
            onClick={() => setSearchOpen(true)}
          >
            <IconSearch />
            <span className="desktop-only">Recherche</span>
          </button>
          <NavLink
            to="/compte"
            className="nav-item desktop-only"
            title={accountLabel === 'Compte' ? 'Mon compte' : `Compte — ${accountLabel}`}
          >
            <IconUser />
            <span className="nav-item-label">{accountShort}</span>
          </NavLink>
          <button
            type="button"
            className={`nav-cart${count > 0 ? ' has-items' : ''}`}
            onClick={() => openDrawer()}
            aria-label={`Panier${count ? `, ${count} articles` : ''}`}
          >
            <span className="nav-cart-icon-wrap">
              <IconBag />
              {count > 0 && (
                <span
                  className={`cart-badge${badgePulse ? ' is-pulse' : ''}`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className="nav-cart-label desktop-only">Panier</span>
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
                    <span className="mega-item-icon">
                      {CATEGORY_ICONS[c.slug] ?? <IconGrid />}
                    </span>
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
                <IconClose />
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
                <span className="mobile-nav-quick-icon">
                  <IconGrid />
                </span>
                <span>
                  <strong>Catalogue</strong>
                  <span>Tout le stock showroom</span>
                </span>
              </NavLink>
              <NavLink to="/compte" onClick={closeMobile}>
                <span className="mobile-nav-quick-icon">
                  <IconUser />
                </span>
                <span>
                  <strong>
                    {accountLabel === 'Compte' ? 'Mon compte' : accountLabel}
                  </strong>
                  <span>
                    {accountLabel === 'Compte'
                      ? 'Commandes & suivi'
                      : 'Espace client connecté'}
                  </span>
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
                <span className="mobile-nav-quick-icon">
                  <IconBag />
                </span>
                <span>
                  <strong>Panier{count > 0 ? ` (${count})` : ''}</strong>
                  <span>Finaliser ou modifier</span>
                </span>
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
                    <span className="mobile-nav-cat-icon">
                      {CATEGORY_ICONS[c.slug] ?? <IconGrid />}
                    </span>
                    <span>
                      <strong>{c.label}</strong>
                      <span>{c.hint}</span>
                    </span>
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
