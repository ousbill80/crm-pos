import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { CaisseDto } from '../lib/types';

function useCaisses() {
  return useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
  });
}

// Le solde n'est jamais lu depuis la colonne de cache Caisse.soldeCourant :
// il est systématiquement recalculé côté serveur depuis le grand livre
// append-only via GET /caisses/:id/solde (cf. CaisseBalanceService).
function useSolde(caisseId: string) {
  return useQuery({
    queryKey: ['caisses', caisseId, 'solde'],
    queryFn: () => apiFetch<{ caisseId: string; solde: string }>(`/caisses/${caisseId}/solde`),
  });
}

function SoldeCaisse({ caisseId }: { caisseId: string }) {
  const { data, isLoading, isError } = useSolde(caisseId);

  if (isLoading) return <span>Calcul...</span>;
  if (isError) return <span>Erreur</span>;
  return <span className="money">{data?.solde} FCFA</span>;
}

export function CaissesPage() {
  const { data: caisses, isLoading, isError } = useCaisses();

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Caisses</h1>
          <p className="lead">
            Soldes recalculés depuis le grand livre — jamais depuis le cache
          </p>
        </div>
      </header>

      {isLoading && <p>Chargement des caisses...</p>}
      {isError && <p role="alert">Erreur lors du chargement des caisses.</p>}

      {caisses && (
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
                  <code style={{ fontSize: 12 }}>{c.id.slice(0, 8)}…</code>
                </td>
                <td>
                  <span
                    className={
                      c.type === 'CENTRALE' ? 'badge badge-info' : 'badge badge-neutral'
                    }
                  >
                    {c.type}
                  </span>
                </td>
                <td>{c.boutiqueId ? `${c.boutiqueId.slice(0, 8)}…` : '—'}</td>
                <td>
                  <SoldeCaisse caisseId={c.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
