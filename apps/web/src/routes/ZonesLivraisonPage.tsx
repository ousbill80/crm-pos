import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { PageHeader, ListPanel } from '../components/PageChrome';

interface ZoneDto {
  id: string;
  libelle: string;
  tarifForfait: string;
  delaiJoursMin?: number;
  delaiJoursMax?: number;
  actif: boolean;
}

export default function ZonesLivraisonPage() {
  const qc = useQueryClient();
  const [libelle, setLibelle] = useState('');
  const [tarif, setTarif] = useState('2000');
  const { data, isLoading } = useQuery({
    queryKey: ['zones-livraison'],
    queryFn: () => apiFetch<ZoneDto[]>('/zones-livraison'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ZoneDto>('/zones-livraison', {
        method: 'POST',
        body: JSON.stringify({
          libelle,
          tarifForfait: Number(tarif),
          delaiJoursMin: 1,
          delaiJoursMax: 3,
          actif: true,
        }),
      }),
    onSuccess: () => {
      setLibelle('');
      void qc.invalidateQueries({ queryKey: ['zones-livraison'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (z: ZoneDto) =>
      apiFetch(`/zones-livraison/${z.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          libelle: z.libelle,
          tarifForfait: Number(z.tarifForfait),
          delaiJoursMin: z.delaiJoursMin ?? 1,
          delaiJoursMax: z.delaiJoursMax ?? 3,
          actif: !z.actif,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['zones-livraison'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/zones-livraison/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['zones-livraison'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!libelle.trim()) return;
    create.mutate();
  }

  return (
    <div>
      <PageHeader title="Zones de livraison" subtitle="Tarifs et délais" />
      <ListPanel>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <input
            placeholder="Libellé zone"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            required
          />
          <input
            type="number"
            min={0}
            placeholder="Tarif FCFA"
            value={tarif}
            onChange={(e) => setTarif(e.target.value)}
            required
          />
          <button type="submit" className="btn" disabled={create.isPending}>
            Ajouter
          </button>
        </form>
        {isLoading && <p>Chargement…</p>}
        {data?.map((z) => (
          <div
            key={z.id}
            style={{
              padding: '0.75rem 0',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              alignItems: 'center',
            }}
          >
            <div>
              <strong>{z.libelle}</strong> — {z.tarifForfait} FCFA —{' '}
              {z.actif ? 'Active' : 'Inactive'}
              {z.delaiJoursMin != null && (
                <span style={{ opacity: 0.7 }}>
                  {' '}
                  · {z.delaiJoursMin}–{z.delaiJoursMax ?? z.delaiJoursMin} j
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button type="button" className="btn" onClick={() => toggle.mutate(z)}>
                {z.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm(`Supprimer « ${z.libelle} » ?`)) remove.mutate(z.id);
                }}
              >
                Suppr.
              </button>
            </div>
          </div>
        ))}
      </ListPanel>
    </div>
  );
}
