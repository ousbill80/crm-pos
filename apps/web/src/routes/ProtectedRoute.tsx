import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Grid2x2,
  LayoutDashboard,
  Package,
  PieChart,
  Settings,
  ShoppingCart,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import {
  accueilApp,
  homeForRole,
  menuAutorise,
  RoleLibelle,
  ROLES_VALIDATION_CAISSE_CENTRALE,
  rolesPourApp,
  rolesPourMenu,
  type AppProfilId,
} from '@caisse-crm/shared';
import { useAuth } from '../context/AuthContext';
import { TopbarSystray, TopbarUserMenu } from '../components/Topbar';
import { useTresorerieRealtime } from '../lib/tresorerie-realtime';

type AppMenu = { to: string; label: string; roles?: RoleLibelle[] };

type AppDef = {
  id: AppProfilId;
  name: string;
  color: string;
  icon: LucideIcon;
  home: string;
  match: string[];
  menus: AppMenu[];
  roles: RoleLibelle[];
};

/**
 * Navigation façon Odoo. Visibilité = catalogue profils §4 / §6.2
 * (`packages/shared/src/profils.ts`). L’API refuse déjà les écritures hors rôle.
 */
const APPS: AppDef[] = [
  {
    id: 'pos',
    name: 'Point de Vente',
    color: '#0f766e',
    icon: ShoppingCart,
    home: '/pos',
    match: ['/pos'],
    roles: rolesPourApp('pos'),
    menus: [],
  },
  {
    id: 'ventes',
    name: 'Ventes',
    color: '#875A7B',
    icon: ShoppingBag,
    home: '/ventes',
    match: ['/ventes'],
    roles: rolesPourApp('ventes'),
    menus: [
      { to: '/ventes', label: 'Vue d’ensemble' },
      { to: '/ventes/tickets', label: 'Journal des tickets' },
      { to: '/ventes/reporting', label: 'Reporting' },
      {
        to: '/ventes/devis',
        label: 'Devis clients',
        roles: rolesPourMenu('ventes', '/ventes/devis'),
      },
      {
        to: '/pos',
        label: 'Point de vente',
        roles: rolesPourMenu('pos', '/pos'),
      },
    ],
  },
  {
    id: 'produits',
    name: 'Produits',
    color: '#714B67',
    icon: Package,
    home: '/produits',
    match: ['/produits'],
    roles: rolesPourApp('produits'),
    menus: [{ to: '/produits', label: 'Catalogue' }],
  },
  {
    id: 'inventory',
    name: 'Stocks',
    color: '#00A09D',
    icon: Warehouse,
    home: '/stocks',
    match: ['/stocks', '/inventaires'],
    roles: rolesPourApp('inventory'),
    menus: [
      { to: '/stocks', label: 'Stocks', roles: rolesPourMenu('inventory', '/stocks') },
      {
        to: '/stocks/operations',
        label: 'Opérations',
        roles: rolesPourMenu('inventory', '/stocks/operations'),
      },
      {
        to: '/stocks/emplacements',
        label: 'Emplacements',
        roles: rolesPourMenu('inventory', '/stocks/emplacements'),
      },
      {
        to: '/stocks/reappro',
        label: 'Réappro',
        roles: rolesPourMenu('inventory', '/stocks/reappro'),
      },
      {
        to: '/inventaires',
        label: 'Inventaires physiques',
        roles: rolesPourMenu('inventory', '/inventaires'),
      },
    ],
  },
  {
    id: 'purchase',
    name: 'Achats',
    color: '#C45100',
    icon: Truck,
    home: '/fournisseurs',
    match: ['/fournisseurs', '/achats/commandes', '/achats/factures'],
    roles: rolesPourApp('purchase'),
    menus: [
      { to: '/fournisseurs', label: 'Fournisseurs' },
      { to: '/achats/commandes', label: 'Commandes' },
      { to: '/achats/factures', label: 'Factures' },
    ],
  },
  {
    id: 'contacts',
    name: 'CRM',
    color: '#5B6ABF',
    icon: Users,
    home: '/clients',
    match: ['/clients', '/campagnes'],
    roles: rolesPourApp('contacts'),
    menus: [
      { to: '/clients', label: 'Clients', roles: rolesPourMenu('contacts', '/clients') },
      {
        to: '/clients/pilotage',
        label: 'Pilotage',
        roles: rolesPourMenu('contacts', '/clients/pilotage'),
      },
      {
        to: '/clients/fidelite',
        label: 'Fidélité',
        roles: rolesPourMenu('contacts', '/clients/fidelite'),
      },
      {
        to: '/clients/segmentation',
        label: 'Segmentation',
        roles: rolesPourMenu('contacts', '/clients/segmentation'),
      },
      {
        to: '/clients/interactions',
        label: 'Interactions',
        roles: rolesPourMenu('contacts', '/clients/interactions'),
      },
      {
        to: '/campagnes',
        label: 'Campagnes',
        roles: rolesPourMenu('contacts', '/campagnes'),
      },
      {
        to: '/clients/parametres',
        label: 'Paramètres',
        roles: rolesPourMenu('contacts', '/clients/parametres'),
      },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    color: '#1B4F72',
    icon: PieChart,
    home: '/finance',
    match: ['/finance'],
    roles: rolesPourApp('finance'),
    menus: [
      { to: '/finance', label: 'Vue DAF' },
      { to: '/finance?tab=resultat', label: 'Résultat ventes' },
      { to: '/finance?tab=stocks', label: 'Stocks & valorisation' },
      { to: '/finance?tab=tresorerie', label: 'Trésorerie' },
    ],
  },
  {
    id: 'treasury',
    name: 'Trésorerie',
    color: '#017E84',
    icon: Wallet,
    home: '/tresorerie',
    match: ['/tresorerie', '/transactions', '/caisses', '/litiges'],
    roles: rolesPourApp('treasury'),
    menus: [
      {
        to: '/tresorerie',
        label: 'Vue d’ensemble',
        roles: rolesPourMenu('treasury', '/tresorerie'),
      },
      {
        to: '/tresorerie/bordereaux',
        label: 'Bordereaux',
        roles: rolesPourMenu('treasury', '/tresorerie'),
      },
      {
        to: '/tresorerie/reception',
        label: 'Réception centrale',
        roles: ROLES_VALIDATION_CAISSE_CENTRALE,
      },
      {
        to: '/transactions',
        label: 'Transactions',
        roles: rolesPourMenu('treasury', '/transactions'),
      },
      { to: '/caisses', label: 'Caisses', roles: rolesPourMenu('treasury', '/caisses') },
      { to: '/litiges', label: 'Litiges', roles: rolesPourMenu('treasury', '/litiges') },
    ],
  },
  {
    id: 'dashboard',
    name: 'Tableau de bord',
    color: '#5D8DA8',
    icon: LayoutDashboard,
    home: '/dashboard',
    match: ['/dashboard', '/alertes'],
    roles: rolesPourApp('dashboard'),
    menus: [
      { to: '/dashboard', label: 'Vue d’ensemble' },
      { to: '/alertes', label: 'Alertes' },
    ],
  },
  {
    id: 'settings',
    name: 'Configuration',
    color: '#6C757D',
    icon: Settings,
    home: '/utilisateurs',
    match: ['/entreprise', '/utilisateurs', '/audit', '/profils'],
    roles: rolesPourApp('settings'),
    menus: [
      {
        to: '/utilisateurs',
        label: 'Utilisateurs',
        roles: rolesPourMenu('settings', '/utilisateurs'),
      },
      {
        to: '/profils',
        label: 'Profils',
        roles: rolesPourMenu('settings', '/profils'),
      },
      {
        to: '/entreprise',
        label: 'Entreprise',
        roles: rolesPourMenu('settings', '/entreprise'),
      },
      {
        to: '/entreprise?tab=zones',
        label: 'Zones',
        roles: rolesPourMenu('settings', '/entreprise'),
      },
      {
        to: '/entreprise?tab=magasins',
        label: 'Magasins',
        roles: rolesPourMenu('settings', '/entreprise'),
      },
      {
        to: '/entreprise?tab=caisses',
        label: 'Caisses (structure)',
        roles: rolesPourMenu('settings', '/entreprise'),
      },
      {
        to: '/audit',
        label: "Journal d'audit",
        roles: rolesPourMenu('settings', '/audit'),
      },
    ],
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

function appHome(app: AppDef, role: RoleLibelle): string {
  return accueilApp(role, app.id, app.home);
}

function pathAllowed(pathname: string, role: RoleLibelle): boolean {
  const app = resolveApp(pathname);
  if (!app.roles.includes(role)) return false;
  if (!menuAutorise(role, app.id, pathname)) return false;
  const matches = app.menus
    .map((menu) => ({ menu, base: menu.to.split('?')[0] }))
    .filter(
      ({ base }) => pathname === base || pathname.startsWith(`${base}/`),
    )
    .sort((a, b) => b.base.length - a.base.length);
  const menu = matches[0]?.menu;
  if (menu?.roles && !menu.roles.includes(role)) return false;
  return true;
}

export function ProtectedRoute() {
  const { isAuthenticated, user, mustChangePassword, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [appsOpen, setAppsOpen] = useState(false);
  const appsRef = useRef<HTMLDivElement>(null);
  const role = user?.role as RoleLibelle | undefined;

  useTresorerieRealtime(user !== null);

  const currentApp = useMemo(
    () => resolveApp(location.pathname),
    [location.pathname],
  );
  const visibleApps = useMemo(() => {
    return APPS.filter(
      (app) => !app.roles || (role !== undefined && app.roles.includes(role)),
    );
  }, [role]);
  const visibleMenus = useMemo(() => {
    return currentApp.menus.filter((menu) => {
      if (role === undefined) return false;
      if (menu.roles && !menu.roles.includes(role)) return false;
      return menuAutorise(role, currentApp.id, menu.to);
    });
  }, [currentApp, role]);
  const isPos = location.pathname.startsWith('/pos');

  useEffect(() => {
    setAppsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!appsOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (appsOpen && appsRef.current && !appsRef.current.contains(target)) {
        setAppsOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [appsOpen]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (location.pathname === '/changer-mot-de-passe') {
    return <Outlet />;
  }

  if (mustChangePassword) {
    return <Navigate to="/changer-mot-de-passe" replace />;
  }

  if (role && !pathAllowed(location.pathname, role)) {
    return <Navigate to={homeForRole(role)} replace />;
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
                setAppsOpen((v) => !v);
              }}
            >
              <Grid2x2 size={18} strokeWidth={2} />
            </button>

            {appsOpen && (
              <div className="odoo-apps-menu" role="dialog" aria-label="Applications">
                <div className="odoo-apps-menu-title">Applications</div>
                <div className="odoo-apps-grid">
                  {visibleApps.map((app) => {
                    const Icon = app.icon;
                    const active = app.id === currentApp.id;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        className={active ? 'odoo-app-tile actif' : 'odoo-app-tile'}
                        onClick={() => {
                          setAppsOpen(false);
                          navigate(role ? appHome(app, role) : app.home);
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
            onClick={() =>
              navigate(role ? appHome(currentApp, role) : currentApp.home)
            }
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

          {visibleMenus.length > 0 && (
            <nav className="odoo-menus" aria-label={`Menus ${currentApp.name}`}>
              {visibleMenus.map((menu) => (
                <NavLink
                  key={menu.to}
                  to={menu.to}
                  end={
                    menu.to === currentApp.home &&
                    !['/produits', '/clients', '/stocks', '/fournisseurs'].includes(
                      menu.to,
                    )
                  }
                >
                  {menu.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="odoo-navbar-right">
          <TopbarSystray />
          {user && (
            <TopbarUserMenu
              user={user}
              onLogout={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            />
          )}
        </div>
      </header>

      <main className="app-main odoo-main">
        <Outlet />
      </main>
    </div>
  );
}
