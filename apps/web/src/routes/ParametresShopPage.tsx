import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../lib/api';
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
  waveCommissionPourcent: string;
  waveBeneficiaireMobile: string | null;
  waveBeneficiaireNom: string | null;
  waveBeneficiaireTesteAt: string | null;
}

interface TesterWavePayoutResult {
  id: string;
  status: 'processing' | 'succeeded' | 'failed';
  erreurCode?: string;
}

export default function ParametresShopPage() {
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<string | null>(null);
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
  const testerPayout = useMutation({
    mutationFn: () =>
      apiFetch<TesterWavePayoutResult>('/parametres-shop/wave-payout/tester', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      setTestResult(
        result.status === 'failed'
          ? `Échec — ${result.erreurCode ?? 'inconnu'}`
          : `Statut : ${result.status} (référence ${result.id})`,
      );
      void qc.invalidateQueries({ queryKey: ['parametres-shop'] });
    },
    onError: (err) => {
      setTestResult(
        err instanceof ApiError
          ? `Échec — ${err.message}`
          : 'Échec du test — erreur inattendue',
      );
    },
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

        <h3 style={{ marginTop: '2rem' }}>Reversement Wave (ZenAPI → Major Auto Parts)</h3>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          Les paiements Wave des clients arrivent sur le compte Wave de
          l'intégrateur. Le montant net (après commission) est reversé
          automatiquement vers le numéro ci-dessous à chaque paiement Wave capturé.
        </p>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          Commission (%){' '}
          <input
            type="number"
            step="0.1"
            min={0}
            max={100}
            defaultValue={Number(data.waveCommissionPourcent)}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && String(v) !== String(Number(data.waveCommissionPourcent))) {
                mutation.mutate({ waveCommissionPourcent: v as unknown as string });
              }
            }}
          />
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          Téléphone bénéficiaire Wave (Major Auto Parts){' '}
          <input
            type="tel"
            placeholder="+225..."
            defaultValue={data.waveBeneficiaireMobile ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (data.waveBeneficiaireMobile ?? '')) {
                mutation.mutate({ waveBeneficiaireMobile: v });
              }
            }}
          />
        </label>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          Nom du bénéficiaire{' '}
          <input
            type="text"
            placeholder="Major Auto Parts"
            defaultValue={data.waveBeneficiaireNom ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (data.waveBeneficiaireNom ?? '')) {
                mutation.mutate({ waveBeneficiaireNom: v });
              }
            }}
          />
        </label>
        <div style={{ marginTop: '1rem' }}>
          <button
            type="button"
            disabled={testerPayout.isPending || !data.waveBeneficiaireMobile}
            onClick={() => {
              setTestResult(null);
              testerPayout.mutate();
            }}
          >
            {testerPayout.isPending ? 'Test en cours…' : 'Tester le reversement Wave'}
          </button>
          <p style={{ color: '#999', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Ce test effectue un reversement réel minime (100 FCFA) vers le
            numéro configuré, pour confirmer qu'il est joignable sur Wave.
          </p>
          {testResult && <p style={{ marginTop: '0.5rem' }}>{testResult}</p>}
          {data.waveBeneficiaireTesteAt && (
            <p style={{ color: '#666', fontSize: '0.85rem' }}>
              Dernier test réussi le{' '}
              {new Date(data.waveBeneficiaireTesteAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
      </ListPanel>
    </div>
  );
}
