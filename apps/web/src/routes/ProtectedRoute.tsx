import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return (
    <div>
      <header className="app-header">
        <nav className="app-nav">
          <NavLink to="/dashboard">Tableau de bord</NavLink>
          <NavLink to="/alertes">Alertes</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/caisses">Caisses</NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/produits">Produits</NavLink>
          <NavLink to="/fournisseurs">Fournisseurs</NavLink>
          <NavLink to="/pos">Point de vente</NavLink>
        </nav>
        <div className="app-user">
          <span>{user?.login} — {user?.role}</span>
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
