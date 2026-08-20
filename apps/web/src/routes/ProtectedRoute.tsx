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
      <header>
        <nav>
          <NavLink to="/dashboard">Tableau de bord</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
        </nav>
        <span>{user?.login} — {user?.role}</span>
        <button type="button" onClick={logout}>
          Déconnexion
        </button>
      </header>
      <Outlet />
    </div>
  );
}
