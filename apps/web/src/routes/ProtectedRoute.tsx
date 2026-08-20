import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  {
    group: 'Pilotage',
    items: [
      { to: '/dashboard', label: 'Tableau de bord' },
      { to: '/alertes', label: 'Alertes' },
    ],
  },
  {
    group: 'Trésorerie',
    items: [
      { to: '/transactions', label: 'Transactions' },
      { to: '/caisses', label: 'Caisses' },
    ],
  },
  {
    group: 'Opérations',
    items: [
      { to: '/pos', label: 'Point de vente' },
      { to: '/produits', label: 'Produits' },
      { to: '/stocks', label: 'Stocks' },
      { to: '/fournisseurs', label: 'Fournisseurs' },
    ],
  },
  {
    group: 'Relation client',
    items: [{ to: '/clients', label: 'Clients' }],
  },
  {
    group: 'Configuration',
    items: [{ to: '/entreprise', label: 'Entreprise' }],
  },
] as const;

export function ProtectedRoute() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const isPos = location.pathname.startsWith('/pos');

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">CaissePOS</span>
          <span className="app-brand-name">Caisses &amp; CRM</span>
        </div>

        <nav className="app-nav" aria-label="Navigation principale">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="app-nav-group">{section.group}</div>
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="user-meta">
            <strong>{user?.login}</strong>
            {user?.role}
          </div>
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <main className={isPos ? 'app-main pos-wide' : 'app-main'}>
        <Outlet />
      </main>
    </div>
  );
}
