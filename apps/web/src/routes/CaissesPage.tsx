import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
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

// Le solde n'est jamais lu depuis la colonne de cache Caisse.soldeCourant :
// il est systématiquement recalculé côté serveur depuis le grand livre
// append-only via GET /caisses/:id/solde (cf. CaisseBalanceService).
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

export function CaissesPage() {
  const { data: caisses, isLoading, isError } = useCaisses();
  const { data: boutiques } = useBoutiques();
  const [selected, setSelected] = useState<CaisseDto | null>(null);

  function nomBoutique(boutiqueId: string | null) {
    if (!boutiqueId) return '—';
    const b = boutiques?.find((x) => x.id === boutiqueId);
    return b?.nom ?? `${boutiqueId.slice(0, 8)}…`;
  }

  return (
    <div>
      <PageHeader
        title="Caisses"
        subtitle="Soldes recalculés depuis le grand livre — jamais depuis le cache"
      />

      {isLoading && <LoadingState label="Chargement des caisses..." />}
      {isError && <p role="alert">Erreur lors du chargement des caisses.</p>}

      {caisses && (
        <ListPanel title="Soldes">
          {caisses.length === 0 ? (
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
                {caisses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setSelected(c)}
                      >
                        <code>{c.id.slice(0, 8)}…</code>
                      </button>
                    </td>
                    <td>
                      <span
                        className={
                          c.type === 'CENTRALE' ? 'badge badge-info' : 'badge badge-neutral'
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
            ? `Grand livre · ${selected.type} · ${selected.id.slice(0, 8)}…`
            : 'Grand livre'
        }
      >
        {selected && <MouvementsCaisse caisseId={selected.id} />}
      </Modal>
    </div>
  );
}
