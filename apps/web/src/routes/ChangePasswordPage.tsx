import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Parcours de changement de mot de passe forcé (§6.7) : atteint dès que
// mustChangePassword=true (login ou reset par le Responsable SI/DG), et
// bloque tout autre accès tant qu'il n'est pas complété (PasswordChangeRequiredGuard).
export function ChangePasswordPage() {
  const { isAuthenticated, mustChangePassword, confirmerMotDePasseChange } = useAuth();
  const navigate = useNavigate();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<void>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      }),
    onSuccess: () => {
      confirmerMotDePasseChange();
      navigate('/dashboard', { replace: true });
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Échec du changement de mot de passe.')),
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="login-screen login-screen--solo">
      <main className="login-panel">
        <form onSubmit={handleSubmit} className="login-card">
          <div className="login-brand">
            <p className="login-brand-mark login-brand-mark--icon">
              <KeyRound size={16} aria-hidden /> CaissePOS
            </p>
            <h2>Changement de mot de passe</h2>
            <p className="login-brand-sub">
              Votre mot de passe temporaire doit être remplacé avant tout accès
              à l’application.
            </p>
          </div>
          <div className="login-fields">
            <label htmlFor="old-password">Mot de passe temporaire</label>
            <input
              id="old-password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <label htmlFor="new-password">Nouveau mot de passe</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <label htmlFor="confirm-password">Confirmer le nouveau mot de passe</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary login-submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Changement…' : 'Changer le mot de passe'}
          </button>
        </form>
      </main>
    </div>
  );
}
