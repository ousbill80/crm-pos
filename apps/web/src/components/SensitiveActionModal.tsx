import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { messageDepuisApi } from '../lib/api';
import { p2pApi, type SensitivePurpose } from '../lib/p2p';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  title: string;
  description: string;
  purpose: SensitivePurpose;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (challengeId: string) => Promise<unknown>;
  onSuccess?: (result: unknown) => void;
};

export function SensitiveActionModal({
  open,
  title,
  description,
  purpose,
  confirmLabel = 'Confirmer l’action',
  onClose,
  onConfirm,
  onSuccess,
}: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const challenge = await p2pApi.reauth(password, purpose);
      return onConfirm(challenge.challengeId);
    },
    onSuccess: (result) => {
      setPassword('');
      setError(null);
      onSuccess?.(result);
    },
    onError: (reason) => {
      setPassword('');
      setError(messageDepuisApi(reason, 'Ré-authentification ou action refusée.'));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="lead">{description}</p>
        <p className="p2p-contract-note">
          Saisissez votre mot de passe actuel. La preuve est liée à cette action, expire après deux minutes et ne peut servir qu’une fois.
        </p>
        <label>
          Mot de passe actuel
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="table-actions">
          <button type="button" onClick={onClose}>Annuler</button>
          <button className="btn-primary" type="submit" disabled={mutation.isPending || !password}>
            {mutation.isPending ? 'Vérification…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
