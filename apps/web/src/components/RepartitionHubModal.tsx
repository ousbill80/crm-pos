import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import type { BoutiqueDto, ReceptionStockDto } from '../lib/types';

const ROLES_REPARTITION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

type LigneAlloc = {
  boutiqueId: string;
  quantite: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  reception: Pick<
    ReceptionStockDto,
    'id' | 'produitId' | 'quantite' | 'produit'
  >;
};

export function peutRepartir(role: RoleLibelle | undefined): boolean {
  return role != null && ROLES_REPARTITION.includes(role);
}

export function RepartitionHubModal({ open, onClose, reception }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);
  const [pret, setPret] = useState(true);
  const [allocs, setAllocs] = useState<LigneAlloc[]>([
    { boutiqueId: '', quantite: reception.quantite },
  ]);

  const boutiques = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: open,
  });

  const boutiquesMagasin = useMemo(() => {
    const list = (boutiques.data ?? []).filter(
      (b) => b.actif && b.code !== 'WH-CENTRAL',
    );
    if (user?.role === RoleLibelle.RESPONSABLE_BOUTIQUE && user.boutiqueId) {
      return list.filter((b) => b.id === user.boutiqueId);
    }
    return list;
  }, [boutiques.data, user]);

  const totalAlloue = allocs.reduce((s, a) => s + (Number(a.quantite) || 0), 0);

  const mutation = useMutation({
    mutationFn: () => {
      const lignes = allocs
        .filter((a) => a.boutiqueId && a.quantite > 0)
        .map((a) => ({
          produitId: reception.produitId,
          quantite: a.quantite,
          boutiqueId: a.boutiqueId,
        }));
      if (lignes.length === 0) {
        throw new Error('Ajoutez au moins une boutique avec une quantité.');
      }
      return apiFetch<{ bons: Array<{ id: string; numero: string }> }>(
        `/achats/receptions/${reception.id}/repartir`,
        {
          method: 'POST',
          body: JSON.stringify({ lignes, pret }),
        },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocks'] });
      void qc.invalidateQueries({ queryKey: ['achats-commandes'] });
      setErreur(null);
      onClose();
    },
    onError: (e) => setErreur(messageDepuisApi(e, 'Répartition refusée.')),
  });

  function majLigne(index: number, patch: Partial<LigneAlloc>) {
    setAllocs((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Répartir vers boutiques">
      <p className="lead">
        Article{' '}
        <strong>
          {reception.produit?.designation ?? reception.produitId}
        </strong>{' '}
        — {reception.quantite} u. reçues au hub. Crée des bons de transfert
        hub → PRINCIPAL boutique (putaway ENTREE→STOCK si besoin).
      </p>
      {erreur && <p role="alert">{erreur}</p>}

      <div className="form-stack">
        {allocs.map((ligne, index) => (
          <div key={index} className="form-row" style={{ gap: '0.75rem' }}>
            <label style={{ flex: 2 }}>
              Boutique
              <select
                value={ligne.boutiqueId}
                onChange={(e) => majLigne(index, { boutiqueId: e.target.value })}
              >
                <option value="">— Choisir —</option>
                {boutiquesMagasin.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                    {b.code ? ` (${b.code})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              Quantité
              <input
                type="number"
                min={1}
                value={ligne.quantite}
                onChange={(e) =>
                  majLigne(index, { quantite: Number(e.target.value) || 0 })
                }
              />
            </label>
            {allocs.length > 1 && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setAllocs((prev) => prev.filter((_, i) => i !== index))
                }
              >
                Retirer
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            setAllocs((prev) => [...prev, { boutiqueId: '', quantite: 1 }])
          }
        >
          + Boutique
        </button>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={pret}
            onChange={(e) => setPret(e.target.checked)}
          />
          Mettre les bons en prêt (à valider ensuite dans Opérations stock)
        </label>

        <p className="kpi-hint">
          Total alloué : {totalAlloue} / {reception.quantite}
          {totalAlloue > reception.quantite
            ? ' — dépasse la quantité reçue (autorisé si stock hub dispo).'
            : ''}
        </p>

        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={mutation.isPending || boutiques.isLoading}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Répartition…' : 'Créer les transferts'}
          </button>
        </div>
        <p className="lead">
          Suivi des bons : <Link to="/stocks/operations">Opérations stock</Link>
        </p>
      </div>
    </Modal>
  );
}
