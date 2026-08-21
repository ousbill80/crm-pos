import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle, ROLES_CONFIG_TIROIRS, TypeCaisse } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightSoldeCaisse, insightTypeCaisse } from '../lib/insights/caisses';
import type { BoutiqueDto, CaisseDto, TransactionDto } from '../lib/types';

function useCaisses() {
  return useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
  });
}

function useBoutiques() {
  return useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
  });
}

function useSolde(caisseId: string) {
  return useQuery({
    queryKey: ['caisses', caisseId, 'solde'],
    queryFn: () =>
      apiFetch<{ caisseId: string; solde: string }>(`/caisses/${caisseId}/solde`),
  });
}

function SoldeCaisse({ caisseId }: { caisseId: string }) {
  const { data, isLoading, isError } = useSolde(caisseId);

  if (isLoading) return <span>Calcul...</span>;
  if (isError) return <span>Erreur</span>;
  return <span className="money">{data?.solde} FCFA</span>;
}

function MouvementsCaisse({ caisseId }: { caisseId: string }) {
  const mouvements = useQuery({
    queryKey: ['caisses', caisseId, 'mouvements'],
    queryFn: () => apiFetch<TransactionDto[]>(`/caisses/${caisseId}/mouvements`),
  });

  if (mouvements.isLoading) return <LoadingState label="Chargement du grand livre..." />;
  if (mouvements.isError) {
    return <p role="alert">Impossible de charger les mouvements.</p>;
  }

  const rows = mouvements.data ?? [];
  if (rows.length === 0) {
    return <p className="lead">Aucun mouvement VALIDÉ sur cette caisse.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Montant</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td>{new Date(m.dateHeure).toLocaleString()}</td>
            <td>{m.type}</td>
            <td className="money">{m.montant} FCFA</td>
            <td>
              <span className="badge badge-ok">{m.statut}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function labelCaisse(c: CaisseDto): string {
  if (c.type === TypeCaisse.TIROIR) {
    return `${c.code ?? 'T??'} — ${c.libelle ?? 'Tiroir'}`;
  }
  if (c.type === TypeCaisse.MAGASIN) {
    return c.libelle ?? 'Caisse magasin';
  }
  return c.libelle ?? 'Caisse centrale';
}

function ConfigTiroirsDaf({
  boutiques,
  caisses,
}: {
  boutiques: BoutiqueDto[];
  caisses: CaisseDto[];
}) {
  const queryClient = useQueryClient();
  const [boutiqueId, setBoutiqueId] = useState(boutiques[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<CaisseDto>('/caisses/tiroirs', {
        method: 'POST',
        body: JSON.stringify({ boutiqueId, code, libelle }),
      }),
    onSuccess: () => {
      setCode('');
      setLibelle('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: () => setError('Échec de création du tiroir.'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, actif }: { id: string; actif: boolean }) =>
      apiFetch<CaisseDto>(`/caisses/tiroirs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ actif }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
  });

  const tiroirs = caisses
    .filter((c) => c.type === TypeCaisse.TIROIR)
    .sort((a, b) => (a.ordreAffichage ?? 0) - (b.ordreAffichage ?? 0));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <ListPanel title="Configuration des tiroirs (DAF)">
      <p className="lead">
        Postes POS par boutique — création / activation réservées au DAF.
      </p>
      <form className="stack-form filters-row" onSubmit={onSubmit}>
        <label>
          Boutique
          <select
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            required
          >
            {boutiques.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="T01"
            required
          />
        </label>
        <label>
          Libellé
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Tiroir caisse 1"
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Ajouter
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Libellé</th>
            <th>Boutique</th>
            <th>Actif</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tiroirs.map((t) => (
            <tr key={t.id}>
              <td>
                <code>{t.code}</code>
              </td>
              <td>{t.libelle}</td>
              <td>
                {boutiques.find((b) => b.id === t.boutiqueId)?.nom ?? '—'}
              </td>
              <td>{t.actif === false ? 'Non' : 'Oui'}</td>
              <td>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    toggle.mutate({ id: t.id, actif: t.actif === false })
                  }
                >
                  {t.actif === false ? 'Activer' : 'Désactiver'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListPanel>
  );
}

export function CaissesPage() {
  const { user } = useAuth();
  const { data: caisses, isLoading, isError } = useCaisses();
  const { data: boutiques } = useBoutiques();
  const [selected, setSelected] = useState<CaisseDto | null>(null);
  const peutConfigTiroirs =
    user !== null && ROLES_CONFIG_TIROIRS.includes(user.role as RoleLibelle);

  function nomBoutique(boutiqueId: string | null) {
    if (!boutiqueId) return '—';
    const b = boutiques?.find((x) => x.id === boutiqueId);
    return b?.nom ?? `${boutiqueId.slice(0, 8)}…`;
  }

  const ordered = [...(caisses ?? [])].sort((a, b) => {
    const order = { CENTRALE: 0, MAGASIN: 1, TIROIR: 2 } as Record<string, number>;
    const d = (order[a.type] ?? 9) - (order[b.type] ?? 9);
    if (d !== 0) return d;
    return (a.ordreAffichage ?? 0) - (b.ordreAffichage ?? 0);
  });

  return (
    <div>
      <PageHeader
        title="Caisses"
        subtitle="Tiroirs → Magasin → Centrale — soldes recalculés (grand livre)"
      />

      {isLoading && <LoadingState label="Chargement des caisses..." />}
      {isError && <p role="alert">Erreur lors du chargement des caisses.</p>}

      {peutConfigTiroirs && boutiques && caisses && (
        <ConfigTiroirsDaf boutiques={boutiques} caisses={caisses} />
      )}

      {caisses && (
        <ListPanel title="Soldes">
          {ordered.length === 0 ? (
            <EmptyState
              title="Aucune caisse"
              description="Aucune caisse sur votre périmètre."
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Caisse</th>
                  <th>Type</th>
                  <th>Boutique</th>
                  <th>Solde</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setSelected(c)}
                      >
                        {labelCaisse(c)}
                      </button>
                    </td>
                    <td>
                      <span
                        className={
                          c.type === 'CENTRALE'
                            ? 'badge badge-info'
                            : c.type === 'MAGASIN'
                              ? 'badge badge-ok'
                              : 'badge badge-neutral'
                        }
                      >
                        {c.type}
                      </span>{' '}
                      <InfoTooltip insight={insightTypeCaisse(c.type)} />
                    </td>
                    <td>{nomBoutique(c.boutiqueId)}</td>
                    <td>
                      <SoldeCaisse caisseId={c.id} />{' '}
                      <InfoTooltip insight={insightSoldeCaisse(c.type)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ListPanel>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Grand livre · ${labelCaisse(selected)}`
            : 'Grand livre'
        }
      >
        {selected && <MouvementsCaisse caisseId={selected.id} />}
      </Modal>
    </div>
  );
}
