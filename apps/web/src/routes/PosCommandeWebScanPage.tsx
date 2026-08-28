import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

function newOpId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface CommandeScan {
  id: string;
  statut: string;
  montantTotal: string;
  modeFulfillment: string;
  lignes?: { designationSnapshot: string; quantite: number }[];
}

export default function PosCommandeWebScanPage() {
  const [token, setToken] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['cmd-web-token', submitted],
    queryFn: () => apiFetch<CommandeScan>(`/commandes-web/par-token/${encodeURIComponent(submitted)}`),
    enabled: submitted.length >= 8,
    retry: false,
  });

  const convertir = useMutation({
    mutationFn: async () => {
      setError(null);
      return apiFetch<{ venteId: string; commandeWebId: string }>('/commandes-web/scan-qr', {
        method: 'POST',
        body: JSON.stringify({
          suiviToken: submitted,
          clientOperationId: newOpId(),
        }),
      });
    },
    onSuccess: (data) => {
      setResult(`Vente créée : ${data.venteId}`);
    },
    onError: (err: Error) => {
      setError(err.message || 'Conversion refusée (autre boutique ou statut).');
    },
  });

  function onLookup(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    setError(null);
    setSubmitted(token.trim());
  }

  return (
    <div className="pos-scan-web" style={{ maxWidth: 480, margin: '2rem auto', padding: '1.5rem' }}>
      <p>
        <Link to="/pos">← Retour POS</Link>
      </p>
      <h1 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Scan commande web</h1>
      <p style={{ opacity: 0.75, marginBottom: '1.25rem' }}>
        Saisir ou coller le token QR click &amp; collect, puis convertir en vente.
      </p>
      <form onSubmit={onLookup} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token suivi QR"
          style={{ flex: 1, padding: '0.65rem' }}
        />
        <button type="submit" className="btn">
          Vérifier
        </button>
      </form>
      {preview.isError && (
        <p style={{ color: 'crimson' }}>Commande introuvable pour ce token.</p>
      )}
      {preview.data && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}>
          <p>
            <strong>{preview.data.statut}</strong> — {preview.data.montantTotal} FCFA —{' '}
            {preview.data.modeFulfillment}
          </p>
          <ul>
            {preview.data.lignes?.map((l, i) => (
              <li key={i}>
                {l.designationSnapshot} × {l.quantite}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn"
            style={{ marginTop: '0.75rem' }}
            disabled={convertir.isPending}
            onClick={() => convertir.mutate()}
          >
            Convertir en vente
          </button>
        </div>
      )}
      {result && <p style={{ color: 'green', marginTop: '1rem' }}>{result}</p>}
      {error && <p style={{ color: 'crimson', marginTop: '1rem' }}>{error}</p>}
    </div>
  );
}
