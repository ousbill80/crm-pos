import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import {
  comptesDemoParFamille,
  homeForRole,
  labelProfil,
  type CompteDemo,
} from '@caisse-crm/shared';
import { useAuth } from '../context/AuthContext';
import { ApiError, messageDepuisApi } from '../lib/api';
import {
  TurnstileWidget,
  resetTurnstile,
  turnstileSiteKey,
} from '../components/TurnstileWidget';
import { MajorBrandMark } from '../components/MajorBrandMark';

/** Mot de passe unique des comptes seed — jamais exposé hors DEV. */
const MOT_DE_PASSE_DEMO = 'MotDePasse!123';

// Un 429 (rate limiting anti-brute-force, §6.7) n'est pas un identifiant
// invalide : l'annoncer comme tel induirait l'utilisateur en erreur sur ses
// propres identifiants alors que le compte est simplement temporairement
// throttlé (ou verrouillé après échecs répétés, cf. AuthService).
function messageDeConnexion(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Impossible de contacter le serveur.';
  }
  if (err.status === 429) {
    return 'Trop de tentatives de connexion. Réessayez dans une minute.';
  }
  if (err.status === 403) {
    return messageDepuisApi(
      err,
      'Vérification anti-bot requise. Rechargez la page.',
    );
  }
  const message = messageDepuisApi(err, 'Identifiants invalides.');
  if (message.toLowerCase().includes('verrouill')) {
    return message;
  }
  return 'Identifiants invalides.';
}

export function LoginPage() {
  const { isAuthenticated, user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [voirMdp, setVoirMdp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRequired = Boolean(turnstileSiteKey());

  const onTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

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
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (turnstileRequired && !turnstileToken) {
      setError('Validez la vérification anti-bot avant de vous connecter.');
      return;
    }
    setIsSubmitting(true);
    try {
      const next = await login(
        loginValue,
        password,
        turnstileToken ?? undefined,
      );
      navigate(homeForRole(next.role), { replace: true });
    } catch (err) {
      setError(messageDeConnexion(err));
      resetTurnstile();
      setTurnstileToken(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function connexionDemo(compte: CompteDemo) {
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
          err instanceof ApiError && err.status !== 429
            ? 'Identifiants invalides (seed manquant ?).'
            : messageDeConnexion(err),
        );
      })
      .finally(() => setIsSubmitting(false));
  }

  const famillesDemo = import.meta.env.DEV ? comptesDemoParFamille() : [];

  return (
    <div className="login-screen">
      <aside className="login-hero">
        <div className="login-hero-media" aria-hidden />
        <div className="login-hero-shade" aria-hidden />
        <div className="login-hero-glow" aria-hidden />
        <div className="login-hero-content">
          <p className="login-hero-kicker">Showroom Abidjan · Côte d’Ivoire</p>
          <MajorBrandMark variant="hero" />
          <h1 className="login-hero-title">
            Caisses &amp; CRM
            <span>pour le réseau boutique</span>
          </h1>
        </div>
        <ul className="login-hero-pills" aria-label="Modules">
          <li>POS</li>
          <li>CRM</li>
          <li>Stock</li>
          <li>Trésorerie</li>
        </ul>
      </aside>

      <main className="login-panel">
        <form onSubmit={handleSubmit} className="login-card">
          <header className="login-brand">
            <div className="login-brand-mark">
              <MajorBrandMark variant="login" />
            </div>
            <h2>Connexion</h2>
            <p className="login-brand-sub">
              Identifiant personnel — actions tracées.
            </p>
          </header>

          <div className="login-fields">
            <div className="login-field">
              <label htmlFor="login">Identifiant</label>
              <input
                id="login"
                data-testid="login-identifiant"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                placeholder="votre.identifiant"
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Mot de passe</label>
              <div className="login-password-wrap">
                <input
                  id="password"
                  data-testid="login-password"
                  type={voirMdp ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setVoirMdp((v) => !v)}
                  aria-label={
                    voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
                >
                  {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <TurnstileWidget onToken={onTurnstileToken} />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary login-submit"
            data-testid="login-submit"
            disabled={isSubmitting || (turnstileRequired && !turnstileToken)}
          >
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>

          {famillesDemo.length > 0 && (
            <div className="login-demo">
              <p className="login-demo-head">
                10 profils démo (local) · mdp {MOT_DE_PASSE_DEMO}
              </p>
              <p className="login-demo-note">
                Les droits sont appliqués côté API (403 + audit). Un caissier
                ne peut pas valider un versement.
              </p>
              {famillesDemo.map((groupe) => (
                <div key={groupe.famille} className="login-demo-groupe">
                  <p className="login-demo-groupe-titre">{groupe.libelle}</p>
                  <ul className="login-demo-list">
                    {groupe.comptes.map((compte) => (
                      <li key={compte.login}>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          data-testid={`login-demo-${compte.role}`}
                          title={`${labelProfil(compte.role)} · ${compte.login}`}
                          onClick={() => connexionDemo(compte)}
                        >
                          <span className="login-demo-label">
                            {compte.libelleCourt}
                          </span>
                          <span className="login-demo-hint">{compte.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
