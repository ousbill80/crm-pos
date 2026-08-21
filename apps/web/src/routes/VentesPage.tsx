import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileDown, ShoppingBag } from 'lucide-react';
import {
  RoleLibelle,
  StatutSessionCaisse,
  rolesPourApp,
} from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { EtatCaissePrint } from '../components/pos/EtatCaissePrint';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import type { BoutiqueDto, CaisseDto, SessionCaisseDto } from '../lib/types';

const ROLES_VENTES = rolesPourApp('ventes');
const ROLES_POS = rolesPourApp('pos');

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

function typeEtat(statut: StatutSessionCaisse): 'X' | 'Z' {
  return statut === StatutSessionCaisse.FERMEE ? 'Z' : 'X';
}

function libelleStatut(statut: StatutSessionCaisse): string {
  return statut === StatutSessionCaisse.OUVERTE ? 'Ouverte' : 'Fermée';
}

interface DashboardCa {
  chiffreAffaires: {
    total: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      montant: string;
    }>;
    parModePaiement: Array<{ modePaiement: string; montant: string }>;
  };
}

export function VentesPage() {
  const { user } = useAuth();
  const filtre = useFiltreMagasinSiege();
  const [statut, setStatut] = useState<'TOUTES' | StatutSessionCaisse>('TOUTES');
  const [etatSessionId, setEtatSessionId] = useState<string | null>(null);
  const [pdfEnCours, setPdfEnCours] = useState<string | null>(null);

  const peutLire = user !== null && ROLES_VENTES.includes(user.role);
  const peutPos = user !== null && ROLES_POS.includes(user.role);

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

  const dashboardQ = useQuery({
    queryKey: ['reporting', 'dashboard', filtre.boutiqueId || 'all'],
    queryFn: () => {
      const q = filtre.boutiqueId
        ? `?boutiqueId=${encodeURIComponent(filtre.boutiqueId)}`
        : '';
      return apiFetch<DashboardCa>(`/reporting/dashboard${q}`);
    },
    enabled: peutLire,
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

  const lignes = useMemo(() => {
    const all = sessionsQ.data ?? [];
    return all
      .filter((s) => {
        if (statut !== 'TOUTES' && s.statut !== statut) return false;
        if (!filtre.boutiqueId) return true;
        const c = caisseById.get(s.caisseId);
        return c?.boutiqueId === filtre.boutiqueId;
      })
      .sort(
        (a, b) =>
          new Date(b.ouvertureDateHeure).getTime() -
          new Date(a.ouvertureDateHeure).getTime(),
      );
  }, [sessionsQ.data, statut, filtre.boutiqueId, caisseById]);

  const totauxListe = useMemo(() => {
    let tickets = 0;
    let ca = 0;
    for (const s of lignes) {
      tickets += s.nombreVentes ?? 0;
      ca += Number(s.caSession ?? 0);
    }
    return { tickets, ca };
  }, [lignes]);

  async function telechargerPdf(session: SessionCaisseDto) {
    const etat = typeEtat(session.statut);
    setPdfEnCours(session.id);
    try {
      await apiDownload(
        `/ventes/sessions/${session.id}/cloture/pdf`,
        `etat-${etat.toLowerCase()}-session-${session.id.slice(0, 8)}.pdf`,
      );
    } finally {
      setPdfEnCours(null);
    }
  }

  if (!peutLire) {
    return <Navigate to="/" replace />;
  }

  if (etatSessionId) {
    return (
      <EtatCaissePrint
        sessionId={etatSessionId}
        onFermer={() => setEtatSessionId(null)}
      />
    );
  }

  const ca = dashboardQ.data?.chiffreAffaires;

  return (
    <div>
      <PageHeader
        title="Ventes"
        subtitle={libellePerimetrePage(user?.role as RoleLibelle, {
          boutiqueId: filtre.boutiqueId,
          nomMagasin: filtre.nomMagasin,
          texteReseau:
            'Sessions de caisse, CA et états X/Z imprimables (§6.3.4)',
          texteBoutique: 'Sessions et états imprimables de votre magasin',
        })}
        actions={
          <>
            {peutPos && (
              <Link to="/pos" className="btn-primary">
                <ShoppingBag size={16} /> Point de vente
              </Link>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const q = filtre.boutiqueId
                  ? `?boutiqueId=${encodeURIComponent(filtre.boutiqueId)}`
                  : '';
                void apiDownload(
                  `/reporting/ventes/export.csv${q}`,
                  'ventes.csv',
                );
              }}
            >
              <Download size={16} /> Export CSV
            </button>
          </>
        }
      />

      <div className="toolbar ventes-filtres" role="search">
        <FiltreMagasinSiege id="ventes-filtre-magasin" />
        <div>
          <label htmlFor="ventes-filtre-statut">Statut session</label>
          <select
            id="ventes-filtre-statut"
            value={statut}
            onChange={(e) =>
              setStatut(e.target.value as 'TOUTES' | StatutSessionCaisse)
            }
          >
            <option value="TOUTES">Toutes</option>
            <option value={StatutSessionCaisse.OUVERTE}>Ouvertes</option>
            <option value={StatutSessionCaisse.FERMEE}>Fermées</option>
          </select>
        </div>
      </div>

      <div className="client-kpi-grid" style={{ marginBottom: 16 }}>
        <article className="client-kpi-card">
          <div className="client-kpi-label">CA période (reporting)</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {dashboardQ.isLoading ? '…' : formatFcfa(ca?.total)}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">CA sessions listées</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {formatFcfa(totauxListe.ca)}
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Tickets listés</div>
          <div className="client-kpi-value">{totauxListe.tickets}</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Sessions / ouvertes</div>
          <div className="client-kpi-value">
            {lignes.length}
            <span className="client-kpi-hint">
              {' '}
              ·{' '}
              {
                lignes.filter((s) => s.statut === StatutSessionCaisse.OUVERTE)
                  .length
              }{' '}
              ouvertes
            </span>
          </div>
        </article>
      </div>

      {(ca?.parModePaiement?.length ?? 0) > 0 && (
        <ListPanel title="Répartition par mode de paiement">
          <ul className="pos-cloture-releve" style={{ padding: '8px 12px' }}>
            {ca!.parModePaiement.map((m) => (
              <li
                key={m.modePaiement}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                }}
              >
                <span>{m.modePaiement}</span>
                <strong className="money">{formatFcfa(m.montant)}</strong>
              </li>
            ))}
          </ul>
        </ListPanel>
      )}

      <ListPanel title="Sessions de caisse — états imprimables">
        <p className="lead" style={{ margin: '0 0 12px', padding: '0 4px' }}>
          État X = session ouverte (contrôle en cours) · État Z = clôture
          (§6.3.4). Aperçu pour imprimer, PDF pour archiver.
        </p>
        {sessionsQ.isLoading && (
          <LoadingState label="Chargement des sessions…" />
        )}
        {sessionsQ.isError && (
          <p role="alert">Impossible de charger les sessions de vente.</p>
        )}
        {!sessionsQ.isLoading && !sessionsQ.isError && lignes.length === 0 && (
          <EmptyState
            title="Aucune session"
            description="Les encaissements POS apparaîtront ici."
          />
        )}
        {lignes.length > 0 && (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ouverture</th>
                  <th>Tiroir / boutique</th>
                  <th>Statut</th>
                  <th>Tickets</th>
                  <th>CA session</th>
                  <th>Fond initial</th>
                  <th>Fond compté</th>
                  <th>État imprimable</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((s) => {
                  const caisse = caisseById.get(s.caisseId);
                  const tiroir =
                    caisse?.code || caisse?.libelle
                      ? `${caisse.code ?? ''} ${caisse.libelle ?? ''}`.trim()
                      : s.caisseId.slice(0, 8);
                  const boutique =
                    (caisse?.boutiqueId &&
                      boutiqueNom.get(caisse.boutiqueId)) ||
                    '—';
                  const etat = typeEtat(s.statut);
                  const pdfBusy = pdfEnCours === s.id;
                  return (
                    <tr key={s.id}>
                      <td>
                        {fmtDate(s.ouvertureDateHeure)}
                        {s.clotureDateHeure ? (
                          <div className="lead" style={{ margin: 0 }}>
                            Clôture {fmtDate(s.clotureDateHeure)}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <strong>{tiroir}</strong>
                        <div className="lead" style={{ margin: 0 }}>
                          {boutique}
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            s.statut === StatutSessionCaisse.OUVERTE
                              ? 'badge badge-ok'
                              : 'badge badge-neutral'
                          }
                        >
                          {libelleStatut(s.statut)}
                        </span>
                      </td>
                      <td>{s.nombreVentes ?? 0}</td>
                      <td className="money">{formatFcfa(s.caSession)}</td>
                      <td className="money">{formatFcfa(s.fondInitial)}</td>
                      <td className="money">
                        {s.fondCompteCloture != null
                          ? formatFcfa(s.fondCompteCloture)
                          : '—'}
                      </td>
                      <td>
                        <div className="table-actions ventes-etat-actions">
                          <span
                            className={
                              etat === 'Z' ? 'badge badge-info' : 'badge badge-ok'
                            }
                            title={
                              etat === 'Z'
                                ? 'État Z — clôture'
                                : 'État X — session ouverte'
                            }
                          >
                            État {etat}
                          </span>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setEtatSessionId(s.id)}
                            title={`Aperçu imprimable État ${etat}`}
                          >
                            <Eye size={14} /> Aperçu
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={pdfBusy}
                            onClick={() => void telechargerPdf(s)}
                            title={`Télécharger le PDF État ${etat}`}
                          >
                            <FileDown size={14} />
                            {pdfBusy ? 'PDF…' : 'PDF'}
                          </button>
                          <Link to={`/caisses/${s.caisseId}`}>Caisse</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListPanel>
    </div>
  );
}
