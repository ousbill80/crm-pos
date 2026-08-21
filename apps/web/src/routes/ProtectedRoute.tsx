import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Grid2x2,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TopbarSystray } from '../components/Topbar';

type AppMenu = { to: string; label: string };

type AppDef = {
  id: string;
  name: string;
  color: string;
  icon: LucideIcon;
  home: string;
  match: string[];
  menus: AppMenu[];
};

/**
 * Navigation façon Odoo : switcher d’applications + menus de l’app active.
 * (pas de sidebar avec groupes Pilotage / Trésorerie / Opérations)
 */
const APPS: AppDef[] = [
  {
    id: 'pos',
    name: 'Point de Vente',
    color: '#0f766e',
    icon: ShoppingCart,
    home: '/pos',
    match: ['/pos'],
    menus: [],
  },
  {
    id: 'produits',
    name: 'Produits',
    color: '#714B67',
    icon: Package,
    home: '/produits',
    match: ['/produits'],
    menus: [{ to: '/produits', label: 'Catalogue' }],
  },
  {
    id: 'inventory',
    name: 'Stocks',
    color: '#00A09D',
    icon: Warehouse,
    home: '/stocks',
    match: ['/stocks', '/inventaires'],
    menus: [
      { to: '/stocks', label: 'Stocks' },
      { to: '/inventaires', label: 'Inventaires physiques' },
    ],
  },
  {
    id: 'purchase',
    name: 'Achats',
    color: '#C45100',
    icon: Truck,
    home: '/fournisseurs',
    match: ['/fournisseurs', '/achats/commandes', '/achats/factures'],
    menus: [
      { to: '/fournisseurs', label: 'Fournisseurs' },
      { to: '/achats/commandes', label: 'Commandes' },
      { to: '/achats/factures', label: 'Factures' },
    ],
  },
  {
    id: 'contacts',
    name: 'Contacts',
    color: '#875A7B',
    icon: Users,
    home: '/clients',
    match: ['/clients'],
    menus: [{ to: '/clients', label: 'Clients' }],
  },
  {
    id: 'treasury',
    name: 'Trésorerie',
    color: '#017E84',
    icon: Wallet,
    home: '/tresorerie',
    match: ['/tresorerie', '/transactions', '/caisses', '/litiges'],
    menus: [
      { to: '/tresorerie', label: 'Vue d’ensemble' },
      { to: '/transactions', label: 'Transactions' },
      { to: '/caisses', label: 'Caisses' },
      { to: '/litiges', label: 'Litiges' },
    ],
  },
  {
    id: 'dashboard',
    name: 'Tableau de bord',
    color: '#5D8DA8',
    icon: LayoutDashboard,
    home: '/dashboard',
    match: ['/dashboard', '/alertes'],
    menus: [
      { to: '/dashboard', label: 'Vue d’ensemble' },
      { to: '/alertes', label: 'Alertes' },
    ],
  },
  {
    id: 'settings',
    name: 'Configuration',
    color: '#6C757D',
    icon: Building2,
    home: '/entreprise',
    match: ['/entreprise'],
    menus: [{ to: '/entreprise', label: 'Entreprise' }],
  },
];

function resolveApp(pathname: string): AppDef {
  const found = APPS.find((app) =>
    app.match.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ),
  );
  return found ?? APPS.find((a) => a.id === 'dashboard')!;
}

export function ProtectedRoute() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [appsOpen, setAppsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const appsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const currentApp = useMemo(
    () => resolveApp(location.pathname),
    [location.pathname],
  );
  const isPos = location.pathname.startsWith('/pos');

  useEffect(() => {
    setAppsOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!appsOpen && !userOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (appsOpen && appsRef.current && !appsRef.current.contains(target)) {
        setAppsOpen(false);
      }
      if (userOpen && userRef.current && !userRef.current.contains(target)) {
        setUserOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [appsOpen, userOpen]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (isPos) {
    return (
      <div className="app-shell pos-mode">
        <main className="app-main pos-wide">
          <Outlet />
        </main>
      </div>
    );
  }

  const AppIcon = currentApp.icon;

  return (
    <div className="app-shell odoo-shell">
      <header className="odoo-navbar">
        <div className="odoo-navbar-left">
          <div className="odoo-apps" ref={appsRef}>
            <button
              type="button"
              className={appsOpen ? 'odoo-apps-btn actif' : 'odoo-apps-btn'}
              aria-expanded={appsOpen}
              aria-haspopup="dialog"
              aria-label="Applications"
              onClick={() => {
                setUserOpen(false);
                setAppsOpen((v) => !v);
              }}
            >
              <Grid2x2 size={18} strokeWidth={2} />
            </button>

            {appsOpen && (
              <div className="odoo-apps-menu" role="dialog" aria-label="Applications">
                <div className="odoo-apps-menu-title">Applications</div>
                <div className="odoo-apps-grid">
                  {APPS.map((app) => {
                    const Icon = app.icon;
                    const active = app.id === currentApp.id;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        className={active ? 'odoo-app-tile actif' : 'odoo-app-tile'}
                        onClick={() => {
                          setAppsOpen(false);
                          navigate(app.home);
                        }}
                      >
                        <span
                          className="odoo-app-tile-icon"
                          style={{ background: app.color }}
                        >
                          <Icon size={22} strokeWidth={2} />
                        </span>
                        <span className="odoo-app-tile-name">{app.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="odoo-current-app"
            onClick={() => navigate(currentApp.home)}
            title={currentApp.name}
          >
            <span
              className="odoo-current-app-dot"
              style={{ background: currentApp.color }}
            >
              <AppIcon size={14} strokeWidth={2.25} />
            </span>
            <span>{currentApp.name}</span>
          </button>

          {currentApp.menus.length > 0 && (
            <nav className="odoo-menus" aria-label={`Menus ${currentApp.name}`}>
              {currentApp.menus.map((menu) => (
                <NavLink
                  key={menu.to}
                  to={menu.to}
                  end={menu.to === currentApp.home && !['/produits', '/clients'].includes(menu.to)}
                >
                  {menu.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="odoo-navbar-right">
          <TopbarSystray />
          <div className="odoo-user" ref={userRef}>
            <button
              type="button"
              className="odoo-user-btn"
              aria-expanded={userOpen}
              aria-haspopup="menu"
              onClick={() => {
                setAppsOpen(false);
                setUserOpen((v) => !v);
              }}
            >
              <span className="odoo-user-avatar">
                {(user?.login ?? '?').slice(0, 2).toUpperCase()}
              </span>
            </button>
            {userOpen && (
              <div className="odoo-user-menu" role="menu">
                <div className="odoo-user-menu-meta">
                  <strong>{user?.login}</strong>
                  <span>{user?.role}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={15} />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main odoo-main">
        <Outlet />
      </main>
    </div>
  );
}
