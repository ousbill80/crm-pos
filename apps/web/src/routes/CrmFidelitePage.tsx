import { useMemo, useState, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Crown, Gift, Medal, Sparkles } from 'lucide-react';
import { NiveauFidelite, rolesPourMenu } from '@caisse-crm/shared';
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
  insightAdherentsFidelite,
  insightFidelite,
  insightPalierFideliteKpi,
  insightPointsCumulesReseau,
} from '../lib/insights/crm';
import type { ClientDto } from '../lib/types';

type ColonneFidelite = 'client' | 'contact' | 'palier' | 'points';

const PALIER_META: Record<
  NiveauFidelite,
  { label: string; icon: typeof Medal; accent: string; hint: string }
> = {
  [NiveauFidelite.OR]: {
    label: 'Or',
    icon: Crown,
    accent: CRM_KPI.or,
    hint: 'Palier le plus élevé',
  },
  [NiveauFidelite.ARGENT]: {
    label: 'Argent',
    icon: Medal,
    accent: CRM_KPI.argent,
    hint: 'Palier intermédiaire',
  },
  [NiveauFidelite.BRONZE]: {
    label: 'Bronze',
    icon: Award,
    accent: CRM_KPI.bronze,
    hint: "Palier d'entrée",
  },
};

function labelFidelite(n: string) {
  return PALIER_META[n as NiveauFidelite]?.label ?? n;
}

function libelleClient(c: ClientDto) {
  return c.prenom ? `${c.prenom} ${c.nom}`.trim() : c.nom;
}

function filtrerMagasin(list: ClientDto[], boutiqueId: string) {
  if (!boutiqueId) return list;
  return list.filter((c) => c.boutiqueOrigineId === boutiqueId);
}

function clientsFidelises(list: ClientDto[]) {
  return list
    .filter((c) => c.fidelite != null)
    .sort(
      (a, b) =>
        (b.fidelite?.pointsCumules ?? 0) - (a.fidelite?.pointsCumules ?? 0),
    );
}

const ROLES = rolesPourMenu('contacts', '/clients/fidelite');

export function CrmFidelitePage() {
  const { user } = useAuth();
  const magasin = useFiltreMagasinSiege();
  const [niveau, setNiveau] = useState('');
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState<SortState<ColonneFidelite> | null>(null);

  useEffect(() => {
    const n = searchParams.get('niveau');
    if (n && Object.values(NiveauFidelite).includes(n as NiveauFidelite)) {
      setNiveau(n);
    }
  }, [searchParams]);

  const peutLire = user !== null && ROLES.includes(user.role);

  const statsQ = useQuery({
    queryKey: ['crm-clients', 'fidelite-stats'],
    queryFn: () => apiFetch<ClientDto[]>('/crm/clients'),
    enabled: peutLire,
  });

  const clientsQ = useQuery({
    queryKey: ['crm-clients', 'fidelite', niveau],
    queryFn: () => {
      const params = new URLSearchParams();
      if (niveau) params.set('niveauFidelite', niveau);
      const qs = params.toString();
      return apiFetch<ClientDto[]>(`/crm/clients${qs ? `?${qs}` : ''}`);
    },
    enabled: peutLire,
  });

  const statsClients = useMemo(
    () => clientsFidelises(filtrerMagasin(statsQ.data ?? [], magasin.boutiqueId)),
    [statsQ.data, magasin.boutiqueId],
  );

  const clientsBruts = useMemo(
    () => clientsFidelises(filtrerMagasin(clientsQ.data ?? [], magasin.boutiqueId)),
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
          case 'palier':
            return c.fidelite?.niveau ?? '';
          case 'points':
            return c.fidelite?.pointsCumules ?? 0;
          default:
            return null;
        }
      }),
    [clientsBruts, sort],
  );

  const kpis = useMemo(() => {
    const byNiveau = {
      [NiveauFidelite.OR]: 0,
      [NiveauFidelite.ARGENT]: 0,
      [NiveauFidelite.BRONZE]: 0,
    };
    let points = 0;
    for (const c of statsClients) {
      if (!c.fidelite) continue;
      byNiveau[c.fidelite.niveau as NiveauFidelite] =
        (byNiveau[c.fidelite.niveau as NiveauFidelite] ?? 0) + 1;
      points += c.fidelite.pointsCumules;
    }
    return { byNiveau, points, total: statsClients.length };
  }, [statsClients]);

  if (!peutLire) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Fidélité"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau: 'Programme de fidélité par paliers (§6.6)',
          texteBoutique: 'Fidélité des clients de votre magasin',
        })}
      />

      <div className="toolbar" role="search">
        <FiltreMagasinSiege id="fid-filtre-magasin" />
        <div>
          <label htmlFor="fid-niveau">Palier</label>
          <select
            id="fid-niveau"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
          >
            <option value="">Tous</option>
            {Object.values(NiveauFidelite).map((n) => (
              <option key={n} value={n}>
                {labelFidelite(n)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CrmKpiGrid className="crm-kpi-grid--5">
        <CrmKpiWidget
          label="Adhérents"
          value={kpis.total}
          hint={
            niveau
              ? `${clients.length} affiché(s) avec filtre actif`
              : 'Comptes fidélité actifs'
          }
          icon={Gift}
          accent={CRM_KPI.accent}
          active={!niveau}
          insight={insightAdherentsFidelite(kpis.total)}
          onClick={() => setNiveau('')}
        />
        {Object.values(NiveauFidelite).map((n) => {
          const meta = PALIER_META[n];
          const count = kpis.byNiveau[n];
          return (
            <CrmKpiWidget
              key={n}
              label={meta.label}
              value={count}
              hint={meta.hint}
              badge={pctPart(count, kpis.total)}
              icon={meta.icon}
              accent={meta.accent}
              active={niveau === n}
              insight={insightPalierFideliteKpi(n, count, kpis.total)}
              onClick={() => setNiveau(niveau === n ? '' : n)}
            />
          );
        })}
        <CrmKpiWidget
          label="Points cumulés"
          value={kpis.points.toLocaleString('fr-FR')}
          hint="Sur le périmètre affiché"
          icon={Sparkles}
          accent={CRM_KPI.or}
          insight={insightPointsCumulesReseau(kpis.points)}
        />
      </CrmKpiGrid>

      <ListPanel title="Clients fidélisés">
        {clientsQ.isLoading && <LoadingState label="Chargement…" />}
        {clientsQ.isError && (
          <p role="alert">Impossible de charger les fiches fidélité.</p>
        )}
        {!clientsQ.isLoading && clients.length === 0 && (
          <EmptyState
            title="Aucun adhérent"
            description="Les clients avec un compte fidélité apparaîtront ici."
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
                    active={sort?.key === 'palier'}
                    dir={sort?.key === 'palier' ? sort.dir : 'asc'}
                    onClick={() => setSort((s) => toggleSort(s, 'palier'))}
                  >
                    Palier
                  </SortHeader>
                  <SortHeader
                    active={sort?.key === 'points'}
                    dir={sort?.key === 'points' ? sort.dir : 'desc'}
                    onClick={() => setSort((s) => toggleSort(s, 'points'))}
                    className="num"
                  >
                    Points
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
                        {labelFidelite(c.fidelite!.niveau)}
                      </span>
                      <InfoTooltip
                        insight={insightFidelite(
                          c.fidelite!.niveau,
                          c.fidelite!.pointsCumules,
                        )}
                      />
                    </td>
                    <td className="num">{c.fidelite!.pointsCumules}</td>
                    <td>
                      <Link to={`/clients/${c.id}?tab=fidelite`}>Fiche</Link>
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
