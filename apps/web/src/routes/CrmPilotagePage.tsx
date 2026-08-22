import { useMemo, useRef, useState, type RefObject } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Megaphone,
  UserCircle,
  UserX,
  Users,
} from 'lucide-react';
import { NiveauFidelite, SegmentClient, rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import { CRM_KPI, pctPart } from '../lib/crm-kpi-accents';
import {
  insightCaIdentifieAnonyme,
  insightCampagnesPilotage,
  insightClientsReseauPilotage,
} from '../lib/insights/crm';
import type { TableauDeBordCrmDto } from '../lib/types';

type ColonneCampagnePilotage = 'nom' | 'canal' | 'ciblage' | 'creee' | 'envoi';

const ROLES = rolesPourMenu('contacts', '/clients/pilotage');

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function labelSegment(s: string) {
  if (s === SegmentClient.VIP) return 'VIP';
  if (s === SegmentClient.REGULIER) return 'Régulier';
  if (s === SegmentClient.NOUVEAU) return 'Nouveau';
  return s;
}

function labelPalier(n: string) {
  if (n === NiveauFidelite.OR) return 'Or';
  if (n === NiveauFidelite.ARGENT) return 'Argent';
  if (n === NiveauFidelite.BRONZE) return 'Bronze';
  return n;
}

function segmentHref(s: string) {
  if (s === SegmentClient.VIP || s === SegmentClient.REGULIER || s === SegmentClient.NOUVEAU) {
    return `/clients/segmentation?segment=${s}`;
  }
  return '/clients/segmentation';
}

function palierHref(n: string) {
  if (
    n === NiveauFidelite.OR ||
    n === NiveauFidelite.ARGENT ||
    n === NiveauFidelite.BRONZE
  ) {
    return `/clients/fidelite?niveau=${n}`;
  }
  return '/clients/fidelite';
}

export function CrmPilotagePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const campagnesRef = useRef<HTMLDivElement>(null);
  const repartitionRef = useRef<HTMLDivElement>(null);
  const peutLire = user !== null && ROLES.includes(user.role);
  const [sortCampagnes, setSortCampagnes] = useState<SortState<ColonneCampagnePilotage> | null>(
    null,
  );

  const tdb = useQuery({
    queryKey: ['crm-tdb-reseau'],
    queryFn: () => apiFetch<TableauDeBordCrmDto>('/crm/tableau-de-bord'),
    enabled: peutLire,
  });

  const campagnesTriees = useMemo(() => {
    const list = tdb.data?.campagnes ?? [];
    return sortRows(list, sortCampagnes, (c, key) => {
      switch (key) {
        case 'nom':
          return c.nom;
        case 'canal':
          return c.canal;
        case 'ciblage':
          return `${c.segment ?? ''} ${c.niveauFidelite ?? ''}`.trim();
        case 'creee':
          return c.dateCreation;
        case 'envoi':
          return c.dateEnvoi ?? '';
        default:
          return null;
      }
    });
  }, [tdb.data, sortCampagnes]);

  if (!peutLire) return <Navigate to="/" replace />;

  const d = tdb.data;
  const caTotal =
    d != null
      ? Number(d.ca.identifie) + Number(d.ca.anonyme)
      : 0;
  const pctIdentifie =
    caTotal > 0 ? `${Math.round((Number(d!.ca.identifie) / caTotal) * 100)} %` : undefined;
  const pctAnonyme =
    caTotal > 0 ? `${Math.round((Number(d!.ca.anonyme) / caTotal) * 100)} %` : undefined;

  function scrollTo(ref: RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div>
      <PageHeader
        title="Pilotage CRM"
        subtitle="Tableau de bord réseau — effectifs, CA identifié vs anonyme, campagnes (§6.6)."
      />
      {tdb.isLoading && <LoadingState label="Chargement du tableau de bord…" />}
      {tdb.isError && (
        <p role="alert">Impossible de charger le tableau de bord CRM.</p>
      )}
      {d && (
        <>
          <CrmKpiGrid>
            <CrmKpiWidget
              label="Clients"
              value={d.effectifs.total}
              hint="Fiches réseau consolidées"
              icon={Users}
              accent={CRM_KPI.clients}
              insight={insightClientsReseauPilotage(d.effectifs.total)}
              onClick={() => navigate('/clients')}
            />
            <CrmKpiWidget
              label="CA identifié"
              value={formatFcfa(d.ca.identifie)}
              hint={`${d.ca.ticketsIdentifies} ticket(s) avec client rattaché`}
              badge={pctIdentifie}
              icon={UserCircle}
              accent={CRM_KPI.caIdentifie}
              valueClassName="is-compact money"
              insight={insightCaIdentifieAnonyme(
                Number(d.ca.identifie),
                Number(d.ca.anonyme),
                d.ca.ticketsIdentifies,
                d.ca.ticketsAnonymes,
              )}
              onClick={() => scrollTo(repartitionRef)}
            />
            <CrmKpiWidget
              label="CA anonyme"
              value={formatFcfa(d.ca.anonyme)}
              hint={`${d.ca.ticketsAnonymes} ticket(s) sans fiche client`}
              badge={pctAnonyme}
              icon={UserX}
              accent={CRM_KPI.caAnonyme}
              valueClassName="is-compact money"
              insight={insightCaIdentifieAnonyme(
                Number(d.ca.identifie),
                Number(d.ca.anonyme),
                d.ca.ticketsIdentifies,
                d.ca.ticketsAnonymes,
              )}
              onClick={() => scrollTo(repartitionRef)}
            />
            <CrmKpiWidget
              label="Campagnes"
              value={d.campagnes.length}
              hint="Plus récentes — voir le détail"
              icon={Megaphone}
              accent={CRM_KPI.campagnes}
              insight={insightCampagnesPilotage(d.campagnes.length)}
              onClick={() => scrollTo(campagnesRef)}
            />
          </CrmKpiGrid>

          <div
            ref={repartitionRef}
            className="client-workspace-split crm-pilotage-split"
          >
            <ListPanel title="Segments">
              <ul className="crm-pilotage-list">
                {Object.entries(d.effectifs.parSegment).map(([k, n]) => (
                  <li key={k}>
                    <Link to={segmentHref(k)} className="crm-pilotage-list-link">
                      <span>{labelSegment(k)}</span>
                      <span className="crm-pilotage-list-meta">
                        <strong>{n}</strong>
                        <span className="crm-pilotage-list-pct">
                          {pctPart(n, d.effectifs.total) ?? '—'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="crm-pilotage-panel-foot">
                <Link to="/clients/segmentation">
                  <BarChart3 size={14} aria-hidden /> Voir la segmentation
                </Link>
              </p>
            </ListPanel>
            <ListPanel title="Paliers fidélité">
              <ul className="crm-pilotage-list">
                {Object.entries(d.effectifs.parPalier).map(([k, n]) => (
                  <li key={k}>
                    <Link to={palierHref(k)} className="crm-pilotage-list-link">
                      <span>{labelPalier(k)}</span>
                      <span className="crm-pilotage-list-meta">
                        <strong>{n}</strong>
                        <span className="crm-pilotage-list-pct">
                          {pctPart(n, d.effectifs.total) ?? '—'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="crm-pilotage-panel-foot">
                <Link to="/clients/fidelite">
                  <BarChart3 size={14} aria-hidden /> Voir la fidélité
                </Link>
              </p>
            </ListPanel>
          </div>

          <div ref={campagnesRef}>
            <ListPanel title="Campagnes récentes">
              {d.campagnes.length === 0 ? (
                <p className="lead" style={{ padding: 12 }}>
                  Aucune campagne. Le Responsable CRM peut en créer depuis{' '}
                  <Link to="/campagnes">Campagnes</Link>.
                </p>
              ) : (
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <SortHeader
                          active={sortCampagnes?.key === 'nom'}
                          dir={sortCampagnes?.key === 'nom' ? sortCampagnes.dir : 'asc'}
                          onClick={() => setSortCampagnes((s) => toggleSort(s, 'nom'))}
                        >
                          Campagne
                        </SortHeader>
                        <SortHeader
                          active={sortCampagnes?.key === 'canal'}
                          dir={sortCampagnes?.key === 'canal' ? sortCampagnes.dir : 'asc'}
                          onClick={() => setSortCampagnes((s) => toggleSort(s, 'canal'))}
                        >
                          Canal
                        </SortHeader>
                        <SortHeader
                          active={sortCampagnes?.key === 'ciblage'}
                          dir={sortCampagnes?.key === 'ciblage' ? sortCampagnes.dir : 'asc'}
                          onClick={() => setSortCampagnes((s) => toggleSort(s, 'ciblage'))}
                        >
                          Ciblage
                        </SortHeader>
                        <SortHeader
                          active={sortCampagnes?.key === 'creee'}
                          dir={sortCampagnes?.key === 'creee' ? sortCampagnes.dir : 'desc'}
                          onClick={() => setSortCampagnes((s) => toggleSort(s, 'creee'))}
                        >
                          Créée
                        </SortHeader>
                        <SortHeader
                          active={sortCampagnes?.key === 'envoi'}
                          dir={sortCampagnes?.key === 'envoi' ? sortCampagnes.dir : 'desc'}
                          onClick={() => setSortCampagnes((s) => toggleSort(s, 'envoi'))}
                        >
                          Envoi
                        </SortHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {campagnesTriees.map((c) => (
                        <tr
                          key={c.id}
                          className="produit-row"
                          tabIndex={0}
                          onClick={() => navigate('/campagnes')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigate('/campagnes');
                            }
                          }}
                        >
                          <td>
                            <strong>{c.nom}</strong>
                          </td>
                          <td>{c.canal}</td>
                          <td>
                            {c.segment ?? 'Tous segments'}
                            {c.niveauFidelite ? ` · ${c.niveauFidelite}` : ''}
                          </td>
                          <td>
                            {new Date(c.dateCreation).toLocaleDateString('fr-FR')}
                          </td>
                          <td>
                            {c.dateEnvoi
                              ? new Date(c.dateEnvoi).toLocaleString('fr-FR')
                              : 'CSV seulement'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ListPanel>
          </div>
        </>
      )}
    </div>
  );
}
