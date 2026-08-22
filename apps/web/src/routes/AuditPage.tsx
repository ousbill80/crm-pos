import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import { insightAuditAction, insightJournalImmuable } from '../lib/insights/administration';
import type {
  JournalAuditDto,
  JournalAuditPageDto,
  UtilisateurDto,
} from '../lib/types';

type ColonneAudit = 'date' | 'utilisateur' | 'action' | 'entite';

const ROLES_LECTURE_AUDIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];

const ROLES_LECTURE_USERS: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];

const ACTIONS_CONNUES = [
  'LOGIN_REUSSI',
  'LOGIN_ECHEC',
  'LOGIN_DECONNEXION',
  'COMPTE_VERROUILLE',
  'MOT_DE_PASSE_CHANGE',
  'MOT_DE_PASSE_REINITIALISE',
  'ACCES_REFUSE',
  'UTILISATEUR_CREE',
  'UTILISATEUR_MODIFIE',
  'UTILISATEUR_DESACTIVE',
  'ZONE_CREATED',
  'ZONE_UPDATED',
  'BOUTIQUE_CREATED',
  'BOUTIQUE_UPDATED',
  'SESSION_CAISSE_OUVERTE',
  'SESSION_CAISSE_FERMEE',
  'VENTE_ENREGISTREE',
  'TRANSACTION_INITIEE',
  'TRANSACTION_RECEPTIONNEE',
  'DEROGATION_CAISSE',
] as const;

const ENTITES_CONNUES = [
  'Utilisateur',
  'Zone',
  'Boutique',
  'SessionCaisse',
  'Vente',
  'TransactionCaisse',
  'Produit',
  'Client',
  'Entrepot',
  'Caisse',
] as const;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR');
}

function badgeAction(action: string): string {
  if (
    action.includes('ECHEC') ||
    action.includes('REFUSE') ||
    action.includes('VERROUILLE') ||
    action.includes('DESACTIVE') ||
    action.includes('ANNULE')
  ) {
    return 'badge-critical';
  }
  if (action.includes('REUSSI') || action.includes('CREE') || action.includes('CREATED')) {
    return 'badge-ok';
  }
  if (action.includes('DEROGATION') || action.includes('REINITIALISE')) {
    return 'badge-warning';
  }
  return 'badge-ok';
}

function libelleAction(action: string): string {
  return action.replace(/_/g, ' ');
}

function formaterDetails(raw: string | null): string {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function resumeDetails(raw: string | null): string {
  if (!raw) return '—';
  const s = raw.replace(/\s+/g, ' ').trim();
  return s.length > 72 ? `${s.slice(0, 72)}…` : s;
}

export function AuditPage() {
  const { user } = useAuth();
  const peutLire = user !== null && ROLES_LECTURE_AUDIT.includes(user.role);
  const peutLireUsers =
    user !== null && ROLES_LECTURE_USERS.includes(user.role);

  const [action, setAction] = useState('');
  const [entite, setEntite] = useState('');
  const [utilisateurId, setUtilisateurId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<JournalAuditDto | null>(null);
  const [sort, setSort] = useState<SortState<ColonneAudit> | null>(null);
  const limit = 20;

  const users = useQuery({
    queryKey: ['utilisateurs'],
    queryFn: () => apiFetch<UtilisateurDto[]>('/users'),
    enabled: peutLire && peutLireUsers,
  });

  const query = useQuery({
    queryKey: ['audit', { action, entite, utilisateurId, from, to, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (action.trim()) params.set('action', action.trim());
      if (entite.trim()) params.set('entite', entite.trim());
      if (utilisateurId.trim()) params.set('utilisateurId', utilisateurId.trim());
      if (from) params.set('from', new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
      params.set('page', String(page));
      params.set('limit', String(limit));
      return apiFetch<JournalAuditPageDto>(`/audit?${params.toString()}`);
    },
    enabled: peutLire,
  });

  const totalPages = useMemo(
    () => (query.data ? Math.max(1, Math.ceil(query.data.total / limit)) : 1),
    [query.data],
  );

  const lignesTriees = useMemo(() => {
    const rows = query.data?.data ?? [];
    return sortRows(rows, sort, (entry, key) => {
      switch (key) {
        case 'date':
          return entry.dateHeure;
        case 'utilisateur':
          return `${entry.utilisateur.nom} ${entry.utilisateur.prenom}`;
        case 'action':
          return entry.action;
        case 'entite':
          return entry.entite;
        default:
          return null;
      }
    });
  }, [query.data, sort]);

  function resetFiltres() {
    setAction('');
    setEntite('');
    setUtilisateurId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  if (!peutLire) {
    return <p>Vous n’avez pas accès au journal d’audit.</p>;
  }

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        subtitle="Traçabilité horodatée et non modifiable de toute action sensible (§6.7)"
      />

      <div className="toolbar audit-toolbar">
        <div>
          <label htmlFor="audit-action">Action</label>
          <input
            id="audit-action"
            list="audit-actions"
            placeholder="Toutes"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
          <datalist id="audit-actions">
            {ACTIONS_CONNUES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="audit-entite">Entité</label>
          <input
            id="audit-entite"
            list="audit-entites"
            placeholder="Toutes"
            value={entite}
            onChange={(e) => {
              setEntite(e.target.value);
              setPage(1);
            }}
          />
          <datalist id="audit-entites">
            {ENTITES_CONNUES.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>
        {peutLireUsers ? (
          <div>
            <label htmlFor="audit-user">Utilisateur</label>
            <select
              id="audit-user"
              value={utilisateurId}
              onChange={(e) => {
                setUtilisateurId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {(users.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.prenom} {u.nom} ({u.login})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="audit-from">Du</label>
          <input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label htmlFor="audit-to">Au</label>
          <input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="audit-toolbar-actions">
          <button type="button" className="btn-secondary" onClick={resetFiltres}>
            Réinitialiser
          </button>
        </div>
      </div>

      {query.isLoading && <LoadingState label="Chargement du journal d'audit..." />}
      {query.isError && (
        <p role="alert">Erreur lors du chargement du journal d'audit.</p>
      )}

      {!query.isLoading && !query.isError && query.data && (
        <ListPanel
          title={`${query.data.total} entrée(s)`}
          toolbar={<InfoTooltip insight={insightJournalImmuable(query.data.total)} />}
        >
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
                      <SortHeader
                        active={sort?.key === 'date'}
                        dir={sort?.key === 'date' ? sort.dir : 'desc'}
                        onClick={() => setSort((s) => toggleSort(s, 'date'))}
                      >
                        Date/heure
                      </SortHeader>
                      <SortHeader
                        active={sort?.key === 'utilisateur'}
                        dir={sort?.key === 'utilisateur' ? sort.dir : 'asc'}
                        onClick={() => setSort((s) => toggleSort(s, 'utilisateur'))}
                      >
                        Utilisateur
                      </SortHeader>
                      <SortHeader
                        active={sort?.key === 'action'}
                        dir={sort?.key === 'action' ? sort.dir : 'asc'}
                        onClick={() => setSort((s) => toggleSort(s, 'action'))}
                      >
                        Action
                      </SortHeader>
                      <SortHeader
                        active={sort?.key === 'entite'}
                        dir={sort?.key === 'entite' ? sort.dir : 'asc'}
                        onClick={() => setSort((s) => toggleSort(s, 'entite'))}
                      >
                        Entité
                      </SortHeader>
                      <th>Détails</th>
                      <th aria-label="Info" />
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTriees.map((entry) => (
                      <tr
                        key={entry.id}
                        className="produit-row"
                        tabIndex={0}
                        role="button"
                        aria-label={`Détail ${entry.action}`}
                        onClick={() => setDetail(entry)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetail(entry);
                          }
                        }}
                      >
                        <td>{fmtDate(entry.dateHeure)}</td>
                        <td>
                          {entry.utilisateur.prenom} {entry.utilisateur.nom}
                          <br />
                          <span className="lead">{entry.utilisateur.login}</span>
                        </td>
                        <td>
                          <span className={`badge ${badgeAction(entry.action)}`}>
                            {libelleAction(entry.action)}
                          </span>
                        </td>
                        <td>
                          {entry.entite}
                          <br />
                          <span className="lead">
                            {entry.entiteId.slice(0, 8)}…
                          </span>
                        </td>
                        <td className="lead">{resumeDetails(entry.details)}</td>
                        <td>
                          <InfoTooltip insight={insightAuditAction(entry.action)} />
                        </td>
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

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? libelleAction(detail.action) : 'Détail'}
      >
        {detail && (
          <div className="cfg-form audit-detail">
            <div className="cfg-mag-detail-meta">
              <span className={`badge ${badgeAction(detail.action)}`}>
                {detail.action}
              </span>
              <span className="cfg-badge muted">{detail.entite}</span>
            </div>
            <dl className="user-fiche-dl">
              <div>
                <dt>Date / heure</dt>
                <dd>{fmtDate(detail.dateHeure)}</dd>
              </div>
              <div>
                <dt>Acteur</dt>
                <dd>
                  {detail.utilisateur.prenom} {detail.utilisateur.nom}
                  <br />
                  <span className="lead">{detail.utilisateur.login}</span>
                </dd>
              </div>
              <div>
                <dt>Entité ID</dt>
                <dd>
                  <code>{detail.entiteId}</code>
                </dd>
              </div>
              <div>
                <dt>Entrée</dt>
                <dd>
                  <code>{detail.id}</code>
                </dd>
              </div>
            </dl>
            <h3 className="cfg-section-title">Détails</h3>
            <pre className="audit-detail-json">{formaterDetails(detail.details)}</pre>
            <div className="cfg-form-actions">
              {peutLireUsers && (
                <Link
                  className="btn-secondary"
                  to={`/utilisateurs/${detail.utilisateurId}`}
                  onClick={() => setDetail(null)}
                >
                  Voir l’utilisateur
                </Link>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => setDetail(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
