import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CanalInteraction,
  RoleLibelle,
  rolesPourMenu,
} from '@caisse-crm/shared';
import {
  Calendar,
  ScrollText,
  UserRound,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import { CRM_KPI, pctPart } from '../lib/crm-kpi-accents';
import {
  badgeCanal,
  CANAL_META,
  LIBELLE_CANAL,
  statsParCanal,
} from '../lib/crm-interactions-ui';
import {
  insightCanalInteractionKpi,
  insightInteractionsClient,
  insightJournalReseauTotal,
} from '../lib/insights/crm';
import type { ClientDto, InteractionCrmDto } from '../lib/types';

type ColonneReseau = 'date' | 'client' | 'canal' | 'type' | 'contenu';
type ColonneSuggestion = 'client' | 'contact' | 'segment';
type ColonneJournalClient = 'date' | 'canal' | 'type' | 'contenu';

const ROLES = rolesPourMenu('contacts', '/clients/interactions');
const ROLES_CREATION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

interface InteractionReseauItem {
  id: string;
  clientId: string;
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    contact: string | null;
  };
  type: string;
  canal: CanalInteraction;
  contenu: string | null;
  date: string;
}

interface InteractionsReseauDto {
  total: number;
  limit: number;
  offset: number;
  items: InteractionReseauItem[];
}

function libelleClient(c: {
  nom: string;
  prenom: string | null;
}): string {
  return c.prenom ? `${c.prenom} ${c.nom}`.trim() : c.nom;
}

export function CrmInteractionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'reseau' | 'client'>('reseau');
  const [qInput, setQInput] = useState('');
  const qDeferred = useDeferredValue(qInput.trim());
  const [canal, setCanal] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [formCanal, setFormCanal] = useState<CanalInteraction>(
    CanalInteraction.APPEL,
  );
  const [contenu, setContenu] = useState('');
  const [typeInteraction, setTypeInteraction] = useState('NOTE');
  const [sortReseau, setSortReseau] = useState<SortState<ColonneReseau> | null>(null);
  const [sortSuggestions, setSortSuggestions] = useState<SortState<ColonneSuggestion> | null>(
    null,
  );
  const [sortJournalClient, setSortJournalClient] =
    useState<SortState<ColonneJournalClient> | null>(null);

  const peutLire = user !== null && ROLES.includes(user.role);
  const peutCreer = user !== null && ROLES_CREATION.includes(user.role);

  const statsQ = useQuery({
    queryKey: [
      'crm-interactions-stats',
      qDeferred,
      dateFrom,
      dateTo,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (qDeferred.length >= 2) params.set('q', qDeferred);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        params.set('dateTo', d.toISOString());
      }
      params.set('limit', '500');
      return apiFetch<InteractionsReseauDto>(
        `/crm/interactions?${params.toString()}`,
      );
    },
    enabled: peutLire && mode === 'reseau',
  });

  const reseauQ = useQuery({
    queryKey: [
      'crm-interactions-reseau',
      qDeferred,
      canal,
      dateFrom,
      dateTo,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (qDeferred.length >= 2) params.set('q', qDeferred);
      if (canal) params.set('canal', canal);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        params.set('dateTo', d.toISOString());
      }
      params.set('limit', '100');
      return apiFetch<InteractionsReseauDto>(
        `/crm/interactions?${params.toString()}`,
      );
    },
    enabled: peutLire && mode === 'reseau',
  });

  const canalStats = useMemo(() => {
    const counts = statsParCanal(statsQ.data?.items ?? []);
    const totalItems = statsQ.data?.items.length ?? 0;
    const totalApi = statsQ.data?.total ?? 0;
    return { counts, totalItems, totalApi };
  }, [statsQ.data]);

  const rechercheQ = useQuery({
    queryKey: ['crm-clients', 'interactions-search', qDeferred],
    queryFn: () => {
      const params = new URLSearchParams();
      if (qDeferred.length >= 2) params.set('q', qDeferred);
      const qs = params.toString();
      return apiFetch<ClientDto[]>(`/crm/clients${qs ? `?${qs}` : ''}`);
    },
    enabled: peutLire && mode === 'client' && qDeferred.length >= 2 && !clientId,
  });

  const clientQ = useQuery({
    queryKey: ['crm-clients', clientId],
    queryFn: () => apiFetch<ClientDto>(`/crm/clients/${clientId}`),
    enabled: peutLire && mode === 'client' && Boolean(clientId),
  });

  const interactionsQ = useQuery({
    queryKey: ['crm-interactions', clientId],
    queryFn: () =>
      apiFetch<InteractionCrmDto[]>(
        `/crm/clients/${clientId}/interactions`,
      ),
    enabled: peutLire && mode === 'client' && Boolean(clientId),
  });

  const suggestions = useMemo(() => {
    const base = (rechercheQ.data ?? []).slice(0, 12);
    return sortRows(base, sortSuggestions, (c, key) => {
      switch (key) {
        case 'client':
          return libelleClient(c);
        case 'contact':
          return c.contact ?? '';
        case 'segment':
          return c.segment;
        default:
          return null;
      }
    });
  }, [rechercheQ.data, sortSuggestions]);

  const reseauItemsTries = useMemo(() => {
    const base = reseauQ.data?.items ?? [];
    return sortRows(base, sortReseau, (ix, key) => {
      switch (key) {
        case 'date':
          return ix.date;
        case 'client':
          return libelleClient(ix.client);
        case 'canal':
          return LIBELLE_CANAL[ix.canal];
        case 'type':
          return ix.type;
        case 'contenu':
          return ix.contenu ?? '';
        default:
          return null;
      }
    });
  }, [reseauQ.data, sortReseau]);

  const journalClientTrie = useMemo(() => {
    const base = interactionsQ.data ?? [];
    return sortRows(base, sortJournalClient, (ix, key) => {
      switch (key) {
        case 'date':
          return ix.date;
        case 'canal':
          return LIBELLE_CANAL[ix.canal as CanalInteraction];
        case 'type':
          return ix.type;
        case 'contenu':
          return ix.contenu ?? '';
        default:
          return null;
      }
    });
  }, [interactionsQ.data, sortJournalClient]);

  const clientCanalStats = useMemo(
    () => statsParCanal(interactionsQ.data ?? []),
    [interactionsQ.data],
  );

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<InteractionCrmDto>(`/crm/clients/${clientId}/interactions`, {
        method: 'POST',
        body: JSON.stringify({
          type: typeInteraction.trim() || 'NOTE',
          canal: formCanal,
          contenu: contenu.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setContenu('');
      void queryClient.invalidateQueries({
        queryKey: ['crm-interactions', clientId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['crm-interactions-reseau'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['crm-interactions-stats'],
      });
    },
  });

  if (!peutLire) return <Navigate to="/" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !peutCreer) return;
    createMut.mutate();
  }

  const filtresReseauActifs =
    Boolean(canal) ||
    qDeferred.length >= 2 ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  return (
    <div className="crm-interactions-page">
      <PageHeader
        title="Interactions CRM"
        subtitle="Journal réseau consolidé et saisie par fiche client (§6.6)"
      />

      <div className="toolbar crm-interactions-mode" role="tablist" aria-label="Mode interactions">
        <button
          type="button"
          className={mode === 'reseau' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => {
            setMode('reseau');
            setClientId('');
          }}
        >
          <ScrollText size={16} aria-hidden /> Journal réseau
        </button>
        <button
          type="button"
          className={mode === 'client' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setMode('client')}
        >
          <UserRound size={16} aria-hidden /> Par client
        </button>
      </div>

      {mode === 'reseau' && (
        <>
          <div className="toolbar" role="search">
            <div className="crm-clients-search" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="ix-reseau-q">Client</label>
              <input
                id="ix-reseau-q"
                type="search"
                placeholder="Nom ou téléphone (2 car. min.)"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="ix-reseau-canal">Canal</label>
              <select
                id="ix-reseau-canal"
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
              >
                <option value="">Tous</option>
                {Object.values(CanalInteraction).map((c) => (
                  <option key={c} value={c}>
                    {LIBELLE_CANAL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ix-from">Du</label>
              <input
                id="ix-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ix-to">Au</label>
              <input
                id="ix-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {!statsQ.isLoading && statsQ.data && (
            <CrmKpiGrid className="crm-kpi-grid--scroll">
              <CrmKpiWidget
                label="Total journal"
                value={canalStats.totalApi}
                hint={
                  canalStats.totalApi > canalStats.totalItems
                    ? `${canalStats.totalItems} chargées (échantillon 500)`
                    : 'Interactions sur le périmètre'
                }
                icon={ScrollText}
                accent={CRM_KPI.interactions}
                active={!canal && !filtresReseauActifs}
                insight={insightJournalReseauTotal(canalStats.totalApi, canalStats.totalItems)}
                onClick={() => {
                  setCanal('');
                  setQInput('');
                  setDateFrom('');
                  setDateTo('');
                }}
              />
              {Object.values(CanalInteraction).map((c) => {
                const meta = CANAL_META[c];
                const n = canalStats.counts[c] ?? 0;
                return (
                  <CrmKpiWidget
                    key={c}
                    label={LIBELLE_CANAL[c]}
                    value={n}
                    hint={meta.hint}
                    badge={pctPart(n, canalStats.totalItems)}
                    icon={meta.icon}
                    accent={meta.accent}
                    active={canal === c}
                    insight={insightCanalInteractionKpi(
                      LIBELLE_CANAL[c],
                      meta.hint,
                      n,
                      canalStats.totalItems,
                    )}
                    onClick={() => setCanal(canal === c ? '' : c)}
                  />
                );
              })}
            </CrmKpiGrid>
          )}

          <ListPanel
            title={`${reseauQ.data?.total ?? 0} interaction(s) réseau`}
          >
            {reseauQ.isLoading && <LoadingState label="Chargement…" />}
            {reseauQ.isError && (
              <p role="alert">Impossible de charger le journal réseau.</p>
            )}
            {!reseauQ.isLoading && (reseauQ.data?.items.length ?? 0) === 0 && (
              <EmptyState
                title="Aucune interaction"
                description="Élargissez les filtres ou saisissez via « Par client »."
              />
            )}
            {(reseauQ.data?.items.length ?? 0) > 0 && (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Canal</th>
                      <th>Type</th>
                      <th>Contenu</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {reseauQ.data!.items.map((ix) => (
                      <tr key={ix.id}>
                        <td>
                          <span className="crm-interaction-date">
                            <Calendar size={13} aria-hidden />
                            {new Date(ix.date).toLocaleString('fr-FR')}
                          </span>
                        </td>
                        <td>
                          <strong>{libelleClient(ix.client)}</strong>
                          <div className="lead" style={{ margin: 0 }}>
                            {ix.client.contact ?? '—'}
                          </div>
                        </td>
                        <td>{badgeCanal(ix.canal)}</td>
                        <td>{ix.type}</td>
                        <td className="crm-interaction-contenu">
                          {ix.contenu ?? '—'}
                        </td>
                        <td>
                          <Link
                            to={`/clients/${ix.clientId}?tab=interactions`}
                          >
                            Fiche
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ListPanel>
        </>
      )}

      {mode === 'client' && !clientId && (
        <ListPanel title="Choisir un client">
          <div className="toolbar" role="search">
            <div className="crm-clients-search" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="ix-q">Recherche</label>
              <input
                id="ix-q"
                type="search"
                placeholder="Nom, prénom ou téléphone (2 car. min.)"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          {qDeferred.length < 2 && (
            <EmptyState
              title="Rechercher un client"
              description="Saisissez au moins 2 caractères pour afficher des suggestions."
            />
          )}
          {qDeferred.length >= 2 && rechercheQ.isLoading && (
            <LoadingState label="Recherche…" />
          )}
          {qDeferred.length >= 2 &&
            !rechercheQ.isLoading &&
            suggestions.length === 0 && (
              <EmptyState
                title="Aucun résultat"
                description="Élargissez la recherche ou créez la fiche depuis Clients."
              />
            )}
          {suggestions.length > 0 && (
            <div className="clients-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Contact</th>
                    <th>Segment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{libelleClient(c)}</strong>
                      </td>
                      <td>{c.contact ?? '—'}</td>
                      <td>{c.segment}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setClientId(c.id)}
                        >
                          Ouvrir le journal
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ListPanel>
      )}

      {mode === 'client' && clientId && (
        <>
          <div className="toolbar crm-interactions-client-bar">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setClientId('');
                setQInput('');
              }}
            >
              ← Autre client
            </button>
            <div>
              <strong>
                {clientQ.data ? libelleClient(clientQ.data) : '…'}
              </strong>
              {clientQ.data?.contact ? (
                <div className="lead" style={{ margin: 0 }}>
                  {clientQ.data.contact}
                </div>
              ) : null}
            </div>
            <Link to={`/clients/${clientId}?tab=interactions`}>
              Fiche complète
            </Link>
          </div>

          {(interactionsQ.data?.length ?? 0) > 0 && (
            <CrmKpiGrid className="crm-kpi-grid--scroll">
              <CrmKpiWidget
                label="Interactions client"
                value={interactionsQ.data!.length}
                hint="Journal de la fiche"
                icon={ScrollText}
                accent={CRM_KPI.interactions}
              />
              {Object.values(CanalInteraction)
                .filter((c) => (clientCanalStats[c] ?? 0) > 0)
                .map((c) => {
                  const meta = CANAL_META[c];
                  const n = clientCanalStats[c] ?? 0;
                  return (
                    <CrmKpiWidget
                      key={c}
                      label={LIBELLE_CANAL[c]}
                      value={n}
                      hint={meta.hint}
                      icon={meta.icon}
                      accent={meta.accent}
                    />
                  );
                })}
            </CrmKpiGrid>
          )}

          {peutCreer && (
            <ListPanel title="Nouvelle interaction">
              <form className="form-grid" onSubmit={onSubmit}>
                <div>
                  <label htmlFor="ix-type">Type</label>
                  <input
                    id="ix-type"
                    value={typeInteraction}
                    onChange={(e) => setTypeInteraction(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ix-canal">Canal</label>
                  <select
                    id="ix-canal"
                    value={formCanal}
                    onChange={(e) =>
                      setFormCanal(e.target.value as CanalInteraction)
                    }
                  >
                    {Object.values(CanalInteraction).map((c) => (
                      <option key={c} value={c}>
                        {LIBELLE_CANAL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="ix-contenu">Contenu</label>
                  <textarea
                    id="ix-contenu"
                    rows={3}
                    value={contenu}
                    onChange={(e) => setContenu(e.target.value)}
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={createMut.isPending}
                  >
                    {createMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
                {createMut.isError && (
                  <p role="alert">Impossible d’enregistrer l’interaction.</p>
                )}
              </form>
            </ListPanel>
          )}

          <ListPanel title="Journal">
            {interactionsQ.isLoading && (
              <LoadingState label="Chargement du journal…" />
            )}
            {interactionsQ.isError && (
              <p role="alert">Impossible de charger les interactions.</p>
            )}
            {!interactionsQ.isLoading &&
              (interactionsQ.data?.length ?? 0) === 0 && (
                <EmptyState
                  title="Aucune interaction"
                  description="Saisissez une note, un appel ou une visite."
                />
              )}
            {(interactionsQ.data?.length ?? 0) > 0 && (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Canal</th>
                      <th>Type</th>
                      <th>Contenu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactionsQ.data!.map((ix) => (
                      <tr key={ix.id}>
                        <td>
                          {new Date(ix.date).toLocaleString('fr-FR')}
                        </td>
                        <td>
                          {badgeCanal(ix.canal as CanalInteraction)}
                        </td>
                        <td>{ix.type}</td>
                        <td className="crm-interaction-contenu">
                          {ix.contenu ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ListPanel>
        </>
      )}
    </div>
  );
}
