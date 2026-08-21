import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import type { JournalAuditPageDto } from '../lib/types';

// Consultation du journal d'audit append-only (§4, §6.7) — Responsable SI,
// DAF, Contrôleur interne uniquement (Direction Générale explicitement
// exclue côté API, cf. audit.controller.ts).
const ROLES_LECTURE_AUDIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR');
}

export function AuditPage() {
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE_AUDIT.includes(user.role);

  const [action, setAction] = useState('');
  const [entite, setEntite] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const query = useQuery({
    queryKey: ['audit', { action, entite, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (action.trim()) params.set('action', action.trim());
      if (entite.trim()) params.set('entite', entite.trim());
      params.set('page', String(page));
      params.set('limit', String(limit));
      return apiFetch<JournalAuditPageDto>(`/audit?${params.toString()}`);
    },
    enabled: peutLire,
  });

  if (!peutLire) {
    return <p>Vous n’avez pas accès au journal d’audit.</p>;
  }

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        subtitle="Traçabilité horodatée et non modifiable de toute action sensible (§6.7)"
      />

      <div className="toolbar">
        <div>
          <label htmlFor="audit-action">Action</label>
          <input
            id="audit-action"
            placeholder="ex. LOGIN_ECHEC, UTILISATEUR_CREE…"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label htmlFor="audit-entite">Entité</label>
          <input
            id="audit-entite"
            placeholder="ex. Utilisateur, Transaction…"
            value={entite}
            onChange={(e) => {
              setEntite(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {query.isLoading && <LoadingState label="Chargement du journal d'audit..." />}
      {query.isError && <p role="alert">Erreur lors du chargement du journal d'audit.</p>}

      {!query.isLoading && !query.isError && query.data && (
        <ListPanel title={`${query.data.total} entrée(s)`}>
          {query.data.data.length === 0 ? (
            <EmptyState
              title="Aucune entrée"
              description="Aucune entrée d'audit ne correspond à ces filtres."
            />
          ) : (
            <>
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date/heure</th>
                      <th>Utilisateur</th>
                      <th>Action</th>
                      <th>Entité</th>
                      <th>Détails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.data.map((entry) => (
                      <tr key={entry.id}>
                        <td>{fmtDate(entry.dateHeure)}</td>
                        <td>
                          {entry.utilisateur.prenom} {entry.utilisateur.nom}
                          <br />
                          <span className="lead">{entry.utilisateur.login}</span>
                        </td>
                        <td>
                          <span className="badge badge-ok">{entry.action}</span>
                        </td>
                        <td>
                          {entry.entite} <span className="lead">{entry.entiteId}</span>
                        </td>
                        <td className="lead">{entry.details ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-actions">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Précédent
                </button>
                <span className="lead">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Suivant
                </button>
              </div>
            </>
          )}
        </ListPanel>
      )}
    </div>
  );
}
