import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

// Raccourcis DEV uniquement — comptes seedés en local (seed-pos-demo).
const COMPTES_DEMO = [
  { login: 'demo-pos-caissier', libelle: 'Caissier (POS)' },
  { login: 'demo-pos-temoin', libelle: 'Responsable magasin (témoin)' },
  { login: 'demo-respsi', libelle: 'Admin catalogue / Achats' },
  { login: 'demo-daf', libelle: 'DAF (factures / paiements)' },
  { login: 'demo-central', libelle: 'Caissier central (paiements)' },
];
const MOT_DE_PASSE_DEMO = 'MotDePasse!123';

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(loginValue, password);
      navigate('/dashboard', { replace: true });
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
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>

        {import.meta.env.DEV && (
          <div className="login-demo">
            <p>Comptes démo — mot de passe {MOT_DE_PASSE_DEMO}</p>
            {COMPTES_DEMO.map((compte) => (
              <button
                key={compte.login}
                type="button"
                onClick={() => {
                  setLoginValue(compte.login);
                  setPassword(MOT_DE_PASSE_DEMO);
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
