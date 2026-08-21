import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { RoleLibelle } from '@caisse-crm/shared';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

// Raccourcis DEV uniquement — comptes seedés en local (seed-pos-demo).
const COMPTES_DEMO = [
  { login: 'demo-pos-caissier', libelle: 'Caissier (POS)' },
  { login: 'demo-pos-temoin', libelle: 'Responsable magasin (témoin)' },
  { login: 'demo-respsi', libelle: 'Admin catalogue / Achats' },
  { login: 'demo-daf', libelle: 'DAF (Finance / factures)' },
  { login: 'demo-central', libelle: 'Caissier central (paiements)' },
];
const MOT_DE_PASSE_DEMO = 'MotDePasse!123';

const ROLES_LANDING_FINANCE: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
];

function homeForRole(role: RoleLibelle): string {
  if (ROLES_LANDING_FINANCE.includes(role)) return '/finance';
  if (role === RoleLibelle.CAISSIER_BOUTIQUE) return '/pos';
  return '/dashboard';
}

export function LoginPage() {
  const { isAuthenticated, user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const forceSwitch =
    new URLSearchParams(location.search).get('switch') === '1' ||
    Boolean(
      (location.state as { switchAccount?: boolean } | null)?.switchAccount,
    );

  useEffect(() => {
    if (forceSwitch && isAuthenticated) {
      logout();
      navigate('/login', { replace: true, state: { from: '/pos' } });
    }
  }, [forceSwitch, isAuthenticated, logout, navigate]);

  if (isAuthenticated && user && !forceSwitch) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? homeForRole(user.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const next = await login(loginValue, password);
      navigate(homeForRole(next.role), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Identifiants invalides.'
          : 'Impossible de contacter le serveur.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">CaissePOS</div>
          <h1>Connexion</h1>
          <p className="lead" style={{ color: 'var(--text-muted)', margin: 0 }}>
            Point de vente, stocks, clients et trésorerie
          </p>
        </div>
        <div>
          <label htmlFor="login">Identifiant</label>
          <input
            id="login"
            data-testid="login-identifiant"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          className="btn-primary"
          data-testid="login-submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>

        {import.meta.env.DEV && (
          <div className="login-demo">
            <p>Comptes démo — mot de passe {MOT_DE_PASSE_DEMO}</p>
            {COMPTES_DEMO.map((compte) => (
              <button
                key={compte.login}
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setLoginValue(compte.login);
                  setPassword(MOT_DE_PASSE_DEMO);
                  setError(null);
                  setIsSubmitting(true);
                  void login(compte.login, MOT_DE_PASSE_DEMO)
                    .then((next) => {
                      navigate(homeForRole(next.role), { replace: true });
                    })
                    .catch((err) => {
                      setError(
                        err instanceof ApiError
                          ? 'Identifiants invalides.'
                          : 'Impossible de contacter le serveur.',
                      );
                    })
                    .finally(() => setIsSubmitting(false));
                }}
              >
                {compte.libelle}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
