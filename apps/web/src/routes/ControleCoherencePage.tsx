import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { FiltreMagasinSiege, useFiltreMagasinSiege } from '../components/FiltreMagasinSiege';
import { insightRapprochementCoherence } from '../lib/insights/administration';

const ROLES_CONTROLE_COHERENCE: RoleLibelle[] = [
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

interface ControleCoherenceDto {
  perimetre: { boutiqueId: string | null; nomBoutique: string | null };
  periode: { dateFrom: string | null; dateTo: string | null };
  totaux: {
    ventesEnregistrees: string;
    bordereauxEmis: string;
    receptionsValidees: string;
  };
  ecarts: {
    ventesVsBordereaux: string;
    bordereauxVsReceptions: string;
    signale: boolean;
  };
}

function fmtMontant(v: string): string {
  return `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FCFA`;
}

export function ControleCoherencePage() {
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_CONTROLE_COHERENCE.includes(user.role);
  const filtre = useFiltreMagasinSiege();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const query = useQuery({
    queryKey: ['controle-coherence', { boutiqueId: filtre.boutiqueId, dateFrom, dateTo }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtre.boutiqueId) params.set('boutiqueId', filtre.boutiqueId);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set('dateTo', end.toISOString());
      }
      const qs = params.toString();
      return apiFetch<ControleCoherenceDto>(
        `/reporting/controle-coherence${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: peutLire,
  });

  if (!peutLire) {
    return <p>Vous n’avez pas accès au rapprochement 3 voies.</p>;
  }

  return (
    <div>
      <PageHeader
        title="Rapprochement 3 voies"
        subtitle="Contrôle interne — ventes enregistrées, bordereaux émis et réceptions validées (§5.2)"
      />

      <div className="toolbar audit-toolbar">
        <FiltreMagasinSiege />
        <div>
          <label htmlFor="cc-from">Du</label>
          <input
            id="cc-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cc-to">Au</label>
          <input
            id="cc-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {query.isLoading && <LoadingState label="Chargement du rapprochement..." />}
      {query.isError && (
        <p role="alert">Erreur lors du chargement du rapprochement 3 voies.</p>
      )}

      {!query.isLoading && !query.isError && query.data && (
        <ListPanel
          title={
            query.data.perimetre.nomBoutique
              ? `Périmètre : ${query.data.perimetre.nomBoutique}`
              : 'Périmètre : réseau entier'
          }
          toolbar={
            <InfoTooltip
              insight={insightRapprochementCoherence(
                query.data.ecarts.signale,
                query.data.ecarts.ventesVsBordereaux,
                query.data.ecarts.bordereauxVsReceptions,
              )}
            />
          }
        >
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ventes enregistrées</th>
                  <th>Bordereaux émis</th>
                  <th>Réceptions validées</th>
                  <th>Écart ventes ↔ bordereaux</th>
                  <th>Écart bordereaux ↔ réceptions</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{fmtMontant(query.data.totaux.ventesEnregistrees)}</td>
                  <td>{fmtMontant(query.data.totaux.bordereauxEmis)}</td>
                  <td>{fmtMontant(query.data.totaux.receptionsValidees)}</td>
                  <td>
                    <span
                      className={`badge ${
                        Number(query.data.ecarts.ventesVsBordereaux) !== 0
                          ? 'badge-critical'
                          : 'badge-ok'
                      }`}
                    >
                      {fmtMontant(query.data.ecarts.ventesVsBordereaux)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        Number(query.data.ecarts.bordereauxVsReceptions) !== 0
                          ? 'badge-critical'
                          : 'badge-ok'
                      }`}
                    >
                      {fmtMontant(query.data.ecarts.bordereauxVsReceptions)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        query.data.ecarts.signale ? 'badge-critical' : 'badge-ok'
                      }`}
                    >
                      {query.data.ecarts.signale ? 'Écart détecté' : 'Cohérent'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ListPanel>
      )}
    </div>
  );
}
