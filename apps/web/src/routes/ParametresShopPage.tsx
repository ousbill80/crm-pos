import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { PageHeader, ListPanel } from '../components/PageChrome';

interface ParametresShopDto {
  id: string;
  shopActif: boolean;
  modeAffichagePrix: string;
  tauxTvaDefaut: string;
  fallbackPrixMagasin: boolean;
  paiementRetraitActif: boolean;
  paiementLivraisonActif: boolean;
  retraitActif?: boolean;
  livraisonActive?: boolean;
}

export default function ParametresShopPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['parametres-shop'],
    queryFn: () => apiFetch<ParametresShopDto>('/parametres-shop'),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<ParametresShopDto>) =>
      apiFetch<ParametresShopDto>('/parametres-shop', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['parametres-shop'] }),
  });

  if (isLoading || !data) return <p>Chargement…</p>;

  return (
    <div>
      <PageHeader title="Paramètres boutique en ligne" subtitle="TVA, prix, modes de paiement" />
      <ListPanel>
        <label>
          <input
            type="checkbox"
            checked={data.shopActif}
            onChange={(e) => mutation.mutate({ shopActif: e.target.checked })}
          />{' '}
          Boutique active
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          Mode affichage prix{' '}
          <select
            value={data.modeAffichagePrix}
            onChange={(e) => mutation.mutate({ modeAffichagePrix: e.target.value })}
          >
            <option value="TTC">TTC</option>
            <option value="HT">HT</option>
          </select>
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          Taux TVA défaut (%){' '}
          <input
            type="number"
            step="0.01"
            min={0}
            defaultValue={Number(data.tauxTvaDefaut)}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && String(v) !== String(Number(data.tauxTvaDefaut))) {
                mutation.mutate({ tauxTvaDefaut: v as unknown as string });
              }
            }}
          />
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <input
            type="checkbox"
            checked={data.fallbackPrixMagasin}
            onChange={(e) => mutation.mutate({ fallbackPrixMagasin: e.target.checked })}
          />{' '}
          Fallback prix magasin si prix web absent
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <input
            type="checkbox"
            checked={data.retraitActif ?? true}
            onChange={(e) => mutation.mutate({ retraitActif: e.target.checked })}
          />{' '}
          Retrait boutique actif
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <input
            type="checkbox"
            checked={data.livraisonActive ?? true}
            onChange={(e) => mutation.mutate({ livraisonActive: e.target.checked })}
          />{' '}
          Livraison active
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <input
            type="checkbox"
            checked={data.paiementRetraitActif}
            onChange={(e) => mutation.mutate({ paiementRetraitActif: e.target.checked })}
          />{' '}
          Paiement au retrait
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <input
            type="checkbox"
            checked={data.paiementLivraisonActif}
            onChange={(e) => mutation.mutate({ paiementLivraisonActif: e.target.checked })}
          />{' '}
          Paiement à la livraison
        </label>
      </ListPanel>
    </div>
  );
}
