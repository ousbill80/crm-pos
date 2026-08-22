import { useMemo, useState, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Sparkles, Star, Users } from 'lucide-react';
import { RoleLibelle, SegmentClient, rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import { CRM_KPI, pctPart } from '../lib/crm-kpi-accents';
import {
  insightRecalculSegment,
  insightSegmentClient,
  insightSegmentKpi,
} from '../lib/insights/crm';
import type { ClientDto } from '../lib/types';

type ColonneSegmentation = 'client' | 'contact' | 'segment' | 'palier';

const SEGMENT_META: Record<
  SegmentClient,
  { label: string; icon: typeof Star; accent: string; hint: string }
> = {
  [SegmentClient.VIP]: {
    label: 'VIP',
    icon: Star,
    accent: CRM_KPI.vip,
    hint: 'Clients à forte récurrence',
  },
  [SegmentClient.REGULIER]: {
    label: 'Régulier',
    icon: Users,
    accent: CRM_KPI.regulier,
    hint: 'Achats répétés sur le réseau',
  },
  [SegmentClient.NOUVEAU]: {
    label: 'Nouveau',
    icon: Sparkles,
    accent: CRM_KPI.nouveau,
    hint: 'Peu ou pas de ventes rattachées',
  },
};

function labelSegment(s: string) {
  return SEGMENT_META[s as SegmentClient]?.label ?? s;
}

function libelleClient(c: ClientDto) {
  return c.prenom ? `${c.prenom} ${c.nom}`.trim() : c.nom;
}

function filtrerMagasin(list: ClientDto[], boutiqueId: string) {
  if (!boutiqueId) return list;
  return list.filter((c) => c.boutiqueOrigineId === boutiqueId);
}

const ROLES = rolesPourMenu('contacts', '/clients/segmentation');
const ROLES_RECALCUL: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];

export function CrmSegmentationPage() {
  const { user } = useAuth();
  const magasin = useFiltreMagasinSiege();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState('');
  const [recalculId, setRecalculId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState<SortState<ColonneSegmentation> | null>(null);

  useEffect(() => {
    const s = searchParams.get('segment');
    if (s && Object.values(SegmentClient).includes(s as SegmentClient)) {
      setSegment(s);
    }
  }, [searchParams]);

  const peutLire = user !== null && ROLES.includes(user.role);
  const peutRecalcul =
    user !== null && ROLES_RECALCUL.includes(user.role);

  const statsQ = useQuery({
    queryKey: ['crm-clients', 'segmentation-stats'],
    queryFn: () => apiFetch<ClientDto[]>('/crm/clients'),
    enabled: peutLire,
  });

  const clientsQ = useQuery({
    queryKey: ['crm-clients', 'segmentation', segment],
    queryFn: () => {
      const params = new URLSearchParams();
      if (segment) params.set('segment', segment);
      const qs = params.toString();
      return apiFetch<ClientDto[]>(`/crm/clients${qs ? `?${qs}` : ''}`);
    },
    enabled: peutLire,
  });

  const statsClients = useMemo(
    () => filtrerMagasin(statsQ.data ?? [], magasin.boutiqueId),
    [statsQ.data, magasin.boutiqueId],
  );

  const clientsBruts = useMemo(
    () => filtrerMagasin(clientsQ.data ?? [], magasin.boutiqueId),
    [clientsQ.data, magasin.boutiqueId],
  );

  const clients = useMemo(
    () =>
      sortRows(clientsBruts, sort, (c, key) => {
        switch (key) {
          case 'client':
            return libelleClient(c);
          case 'contact':
            return c.contact ?? '';
          case 'segment':
            return c.segment;
          case 'palier':
            return c.fidelite?.niveau ?? '';
          default:
            return null;
        }
      }),
    [clientsBruts, sort],
  );

  const kpis = useMemo(() => {
    const counts: Record<string, number> = {
      [SegmentClient.VIP]: 0,
      [SegmentClient.REGULIER]: 0,
      [SegmentClient.NOUVEAU]: 0,
    };
    for (const c of statsClients) {
      counts[c.segment] = (counts[c.segment] ?? 0) + 1;
    }
    return { counts, total: statsClients.length };
  }, [statsClients]);

  const recalcul = useMutation({
    mutationFn: (clientId: string) =>
      apiFetch<ClientDto>(`/crm/clients/${clientId}/segment/recalculer`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
      setRecalculId(null);
    },
  });

  if (!peutLire) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Segmentation"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau: 'Segmentation paramétrable du fichier client (§6.6)',
          texteBoutique: 'Segments des clients de votre magasin',
        })}
      />

      <div className="toolbar" role="search">
        <FiltreMagasinSiege id="seg-filtre-magasin" />
        <div>
          <label htmlFor="seg-filtre">Segment</label>
          <select
            id="seg-filtre"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="">Tous</option>
            {Object.values(SegmentClient).map((s) => (
              <option key={s} value={s}>
                {labelSegment(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CrmKpiGrid>
        {Object.values(SegmentClient).map((s) => {
          const meta = SEGMENT_META[s];
          const n = kpis.counts[s] ?? 0;
          return (
            <CrmKpiWidget
              key={s}
              label={meta.label}
              value={n}
              hint={meta.hint}
              badge={pctPart(n, kpis.total)}
              icon={meta.icon}
              accent={meta.accent}
              active={segment === s}
              insight={insightSegmentKpi(s, n, kpis.total)}
              onClick={() => setSegment(segment === s ? '' : s)}
            />
          );
        })}
        <CrmKpiWidget
          label="Total listé"
          value={kpis.total}
          hint={
            segment
              ? `${clients.length} affiché(s) avec filtre actif`
              : 'Ensemble du périmètre'
          }
          icon={Crown}
          accent={CRM_KPI.accent}
          active={!segment}
          onClick={() => setSegment('')}
        />
      </CrmKpiGrid>

      <ListPanel title="Clients par segment">
        {clientsQ.isLoading && <LoadingState label="Chargement…" />}
        {clientsQ.isError && (
          <p role="alert">Impossible de charger la segmentation.</p>
        )}
        {!clientsQ.isLoading && clients.length === 0 && (
          <EmptyState
            title="Aucun client"
            description="Élargissez le filtre ou créez des fiches clients."
          />
        )}
        {clients.length > 0 && (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <SortHeader
                    active={sort?.key === 'client'}
                    dir={sort?.key === 'client' ? sort.dir : 'asc'}
                    onClick={() => setSort((s) => toggleSort(s, 'client'))}
                  >
                    Client
                  </SortHeader>
                  <SortHeader
                    active={sort?.key === 'contact'}
                    dir={sort?.key === 'contact' ? sort.dir : 'asc'}
                    onClick={() => setSort((s) => toggleSort(s, 'contact'))}
                  >
                    Contact
                  </SortHeader>
                  <SortHeader
                    active={sort?.key === 'segment'}
                    dir={sort?.key === 'segment' ? sort.dir : 'asc'}
                    onClick={() => setSort((s) => toggleSort(s, 'segment'))}
                  >
                    Segment
                  </SortHeader>
                  <SortHeader
                    active={sort?.key === 'palier'}
                    dir={sort?.key === 'palier' ? sort.dir : 'asc'}
                    onClick={() => setSort((s) => toggleSort(s, 'palier'))}
                  >
                    Fidélité
                  </SortHeader>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{libelleClient(c)}</strong>
                    </td>
                    <td>{c.contact ?? '—'}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {labelSegment(c.segment)}
                      </span>
                      <InfoTooltip insight={insightSegmentClient(c.segment)} />
                    </td>
                    <td>
                      {c.fidelite
                        ? `${c.fidelite.niveau} · ${c.fidelite.pointsCumules} pts`
                        : '—'}
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link to={`/clients/${c.id}?tab=apercu`}>Fiche</Link>
                        {peutRecalcul && (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={recalcul.isPending && recalculId === c.id}
                            onClick={() => {
                              setRecalculId(c.id);
                              recalcul.mutate(c.id);
                            }}
                          >
                            Recalculer
                          </button>
                        )}
                        {peutRecalcul && (
                          <InfoTooltip insight={insightRecalculSegment()} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPanel>
    </div>
  );
}
