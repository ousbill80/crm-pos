import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Receipt, TicketPercent, Wallet } from 'lucide-react';
import { RoleLibelle, rolesPourApp } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import type { BoutiqueDto, CaisseDto, SessionCaisseDto, VenteDto } from '../lib/types';
import {
  insightNombreTickets,
  insightPanierMoyen,
  insightTicketsAvecRemise,
} from '../lib/insights/ventes';

const ROLES_VENTES = rolesPourApp('ventes');

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function remiseTotale(v: VenteDto): number {
  return (v.lignes ?? []).reduce((s, l) => s + Number(l.remise ?? 0), 0);
}

export function VentesTicketsPage() {
  const { user } = useAuth();
  const filtre = useFiltreMagasinSiege();
  const [sessionId, setSessionId] = useState('');
  const [seulementRemise, setSeulementRemise] = useState(false);

  const peutLire = user !== null && ROLES_VENTES.includes(user.role);

  const sessionsQ = useQuery({
    queryKey: ['ventes-sessions'],
    queryFn: () => apiFetch<SessionCaisseDto[]>('/ventes/sessions'),
    enabled: peutLire,
  });

  const caissesQ = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
    enabled: peutLire,
  });

  const boutiquesQ = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: peutLire && !filtre.visible,
  });

  const caisseById = useMemo(() => {
    const map = new Map<string, CaisseDto>();
    for (const c of caissesQ.data ?? []) map.set(c.id, c);
    return map;
  }, [caissesQ.data]);

  const boutiqueNom = useMemo(() => {
    const map = new Map<string, string>();
    const source = filtre.visible ? filtre.boutiques : (boutiquesQ.data ?? []);
    for (const b of source) map.set(b.id, b.nom);
    return map;
  }, [filtre.visible, filtre.boutiques, boutiquesQ.data]);

  const sessionsFiltrees = useMemo(() => {
    const all = sessionsQ.data ?? [];
    return all
      .filter((s) => {
        if (!filtre.boutiqueId) return true;
        const c = caisseById.get(s.caisseId);
        return c?.boutiqueId === filtre.boutiqueId;
      })
      .sort(
        (a, b) =>
          new Date(b.ouvertureDateHeure).getTime() -
          new Date(a.ouvertureDateHeure).getTime(),
      );
  }, [sessionsQ.data, filtre.boutiqueId, caisseById]);

  const sessionsPourTickets = useMemo(() => {
    if (sessionId) return sessionsFiltrees.filter((s) => s.id === sessionId);
    return sessionsFiltrees.slice(0, 8);
  }, [sessionsFiltrees, sessionId]);

  const ventesQueries = useQueries({
    queries: sessionsPourTickets.map((s) => ({
      queryKey: ['ventes-session', s.id, 'ventes'],
      queryFn: () => apiFetch<VenteDto[]>(`/ventes/sessions/${s.id}/ventes`),
      enabled: peutLire && sessionsPourTickets.length > 0,
    })),
  });

  const tickets = useMemo(() => {
    const rows: Array<{
      vente: VenteDto;
      session: SessionCaisseDto;
      remise: number;
      boutique: string;
      tiroir: string;
    }> = [];
    sessionsPourTickets.forEach((session, i) => {
      const ventes = ventesQueries[i]?.data ?? [];
      const caisse = caisseById.get(session.caisseId);
      const tiroir =
        caisse?.code || caisse?.libelle
          ? `${caisse.code ?? ''} ${caisse.libelle ?? ''}`.trim()
          : session.caisseId.slice(0, 8);
      const boutique =
        (caisse?.boutiqueId && boutiqueNom.get(caisse.boutiqueId)) || '—';
      for (const vente of ventes) {
        const remise = remiseTotale(vente);
        if (seulementRemise && remise <= 0) continue;
        rows.push({ vente, session, remise, boutique, tiroir });
      }
    });
    return rows.sort(
      (a, b) =>
        new Date(b.vente.dateVente).getTime() -
        new Date(a.vente.dateVente).getTime(),
    );
  }, [
    sessionsPourTickets,
    ventesQueries,
    caisseById,
    boutiqueNom,
    seulementRemise,
  ]);

  const loadingTickets = ventesQueries.some((q) => q.isLoading);

  const kpis = useMemo(() => {
    const nombre = tickets.length;
    const caTotal = tickets.reduce((s, t) => s + Number(t.vente.montantTotal), 0);
    const remiseTotaleCumul = tickets.reduce((s, t) => s + t.remise, 0);
    const avecRemise = tickets.filter((t) => t.remise > 0).length;
    return { nombre, caTotal, remiseTotaleCumul, avecRemise };
  }, [tickets]);

  if (!peutLire) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Journal des tickets"
        subtitle={libellePerimetrePage(user?.role as RoleLibelle, {
          boutiqueId: filtre.boutiqueId,
          nomMagasin: filtre.nomMagasin,
          texteReseau: 'Tickets de caisse par session (§6.3)',
          texteBoutique: 'Tickets de votre magasin',
        })}
      />

      <section className="kpi-grid dash-kpi-grid" style={{ marginBottom: 16 }}>
        <a href="#tickets-table" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <Receipt size={16} />
            </span>
            <InfoTooltip insight={insightNombreTickets(kpis.nombre)} />
          </div>
          <div className="kpi-label">Tickets</div>
          <div className="kpi-value">{kpis.nombre}</div>
          <div className="kpi-hint">Sur le filtre courant</div>
        </a>

        <a href="#tickets-table" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <Wallet size={16} />
            </span>
            <InfoTooltip insight={insightPanierMoyen(kpis.caTotal, kpis.nombre)} />
          </div>
          <div className="kpi-label">Panier moyen</div>
          <div className="kpi-value money">
            {formatFcfa(kpis.nombre > 0 ? kpis.caTotal / kpis.nombre : 0)}
          </div>
          <div className="kpi-hint">{formatFcfa(kpis.caTotal)} au total</div>
        </a>

        <button
          type="button"
          className={
            kpis.avecRemise > 0
              ? 'kpi-card dash-kpi kpi-warning'
              : 'kpi-card dash-kpi'
          }
          onClick={() => setSeulementRemise((v) => !v)}
        >
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <TicketPercent size={16} />
            </span>
            <InfoTooltip
              insight={insightTicketsAvecRemise(kpis.avecRemise, kpis.nombre)}
            />
          </div>
          <div className="kpi-label">Tickets avec remise</div>
          <div className="kpi-value">{kpis.avecRemise}</div>
          <div className="kpi-hint">
            {formatFcfa(kpis.remiseTotaleCumul)} cumulés
          </div>
        </button>
      </section>

      <div className="toolbar" role="search">
        <FiltreMagasinSiege id="tickets-filtre-magasin" />
        <div>
          <label htmlFor="tickets-session">Session</label>
          <select
            id="tickets-session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">8 sessions récentes</option>
            {sessionsFiltrees.map((s) => {
              const c = caisseById.get(s.caisseId);
              const label = `${new Date(s.ouvertureDateHeure).toLocaleString('fr-FR')} · ${c?.code ?? s.caisseId.slice(0, 8)} · ${s.nombreVentes ?? '?'} tix`;
              return (
                <option key={s.id} value={s.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label htmlFor="tickets-remise">Remises</label>
          <select
            id="tickets-remise"
            value={seulementRemise ? 'oui' : ''}
            onChange={(e) => setSeulementRemise(e.target.value === 'oui')}
          >
            <option value="">Tous les tickets</option>
            <option value="oui">Avec remise seulement</option>
          </select>
        </div>
      </div>

      <ListPanel title={`${tickets.length} ticket(s)`} id="tickets-table">
        {(sessionsQ.isLoading || loadingTickets) && (
          <LoadingState label="Chargement des tickets…" />
        )}
        {sessionsQ.isError && (
          <p role="alert">Impossible de charger les sessions.</p>
        )}
        {!sessionsQ.isLoading && !loadingTickets && tickets.length === 0 && (
          <EmptyState
            title="Aucun ticket"
            description="Sélectionnez une session ou élargissez le magasin."
          />
        )}
        {tickets.length > 0 && (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tiroir / boutique</th>
                  <th>Mode</th>
                  <th className="num">Montant</th>
                  <th className="num">Remise</th>
                  <th className="num">Lignes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tickets.map(({ vente, session, remise, boutique, tiroir }) => (
                  <tr key={vente.id}>
                    <td>
                      {new Date(vente.dateVente).toLocaleString('fr-FR')}
                    </td>
                    <td>
                      <strong>{tiroir}</strong>
                      <div className="lead" style={{ margin: 0 }}>
                        {boutique}
                      </div>
                    </td>
                    <td>{vente.modePaiement}</td>
                    <td className="num money">{formatFcfa(vente.montantTotal)}</td>
                    <td className="num money">
                      {remise > 0 ? formatFcfa(remise) : '—'}
                    </td>
                    <td className="num">{vente.lignes?.length ?? 0}</td>
                    <td>
                      <Link to={`/ventes`}>Sessions</Link>
                      {' · '}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '2px 6px' }}
                        onClick={() => setSessionId(session.id)}
                      >
                        Session
                      </button>
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
