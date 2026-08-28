import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Receipt } from 'lucide-react';
import { RoleLibelle, rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import type { ClientDto } from '../lib/types';
import {
  ACTION_FACTURE,
  badgeFacture,
  formatFcfa,
  libelleClient,
  ligneVide,
  lignesPayload,
  lignesValides,
  STATUT_FACTURE,
  totalLignes,
  type LigneFactureForm,
  type StatutFactureClient,
} from '../lib/facture-client-ui';
import {
  insightFacturesBrouillons,
  insightFacturesEmises,
} from '../lib/insights/ventes';

const ROLES_LECTURE = rolesPourMenu('ventes', '/ventes/factures');
const ROLES_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RAF_COMPTABLE,
];

interface FactureListItem {
  id: string;
  numero: string;
  statut: StatutFactureClient;
  montantHt: string;
  montantTtc: string;
  montantPaye: string;
  solde: string;
  createdAt: string;
  client: { id: string; nom: string; prenom: string | null };
  boutique: { id: string; nom: string } | null;
  transitions: StatutFactureClient[];
  lignes: unknown[];
}

export function FacturesClientPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [clientQ, setClientQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneFactureForm[]>([ligneVide()]);
  const [searchQ, setSearchQ] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [filtre, setFiltre] = useState<StatutFactureClient | 'all'>('all');

  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);

  const facturesQ = useQuery({
    queryKey: ['factures-client', searchApplied],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchApplied.trim().length >= 2) params.set('q', searchApplied.trim());
      const qs = params.toString();
      return apiFetch<FactureListItem[]>(
        `/factures-client${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: peutLire,
  });

  const clientsQ = useQuery({
    queryKey: ['crm-clients', 'facture-search', clientQ],
    queryFn: () =>
      apiFetch<ClientDto[]>(
        `/crm/clients?q=${encodeURIComponent(clientQ.trim())}`,
      ),
    enabled: peutEcrire && showCreate && clientQ.trim().length >= 2,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/factures-client', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          notes: notes.trim() || undefined,
          lignes: lignesPayload(lignes),
        }),
      }),
    onSuccess: (created) => {
      setShowCreate(false);
      setClientId('');
      setClientQ('');
      setLignes([ligneVide()]);
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['factures-client'] });
      navigate(`/ventes/factures/${created.id}`);
    },
  });

  const clientChoisi = useMemo(
    () => (clientsQ.data ?? []).find((c) => c.id === clientId),
    [clientsQ.data, clientId],
  );

  const kpis = useMemo(() => {
    const rows = facturesQ.data ?? [];
    const emises = rows.filter((f) => f.statut === 'EMISE');
    return {
      brouillon: rows.filter((f) => f.statut === 'BROUILLON').length,
      emise: emises.length,
      montantEmis: emises.reduce((acc, f) => acc + Number(f.montantTtc), 0),
    };
  }, [facturesQ.data]);

  const visibles = useMemo(() => {
    const rows = facturesQ.data ?? [];
    if (filtre === 'all') return rows;
    return rows.filter((f) => f.statut === filtre);
  }, [facturesQ.data, filtre]);

  if (!user) return <Navigate to="/login" replace />;
  if (!peutLire) return <Navigate to="/ventes" replace />;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !lignesValides(lignes)) return;
    createMut.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Factures clients"
        subtitle="Pièce B2B HT + TVA — distincte du ticket POS / commande web"
        actions={
          peutEcrire ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? 'Fermer' : 'Nouvelle facture'}
            </button>
          ) : null
        }
      />

      {showCreate && peutEcrire && (
        <ListPanel title="Nouveau brouillon">
          <form className="form-grid" onSubmit={onCreate}>
            <div>
              <label htmlFor="fac-client-q">Client</label>
              <input
                id="fac-client-q"
                value={clientQ}
                onChange={(e) => {
                  setClientQ(e.target.value);
                  setClientId('');
                }}
                placeholder="Nom, contact…"
              />
              {clientsQ.data && clientsQ.data.length > 0 && !clientId && (
                <ul className="search-hits">
                  {clientsQ.data.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          setClientId(c.id);
                          setClientQ(libelleClient(c));
                        }}
                      >
                        {libelleClient(c)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {clientChoisi && (
                <p className="lead">Client : {libelleClient(clientChoisi)}</p>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th className="num">Qté</th>
                    <th className="num">P.U. HT</th>
                    <th className="num">Remise</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={l.key}>
                      <td>
                        <input
                          value={l.designation}
                          onChange={(e) =>
                            setLignes((prev) =>
                              prev.map((x, idx) =>
                                idx === i
                                  ? { ...x, designation: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={l.quantite}
                          onChange={(e) =>
                            setLignes((prev) =>
                              prev.map((x, idx) =>
                                idx === i
                                  ? { ...x, quantite: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={l.prixUnitaire}
                          onChange={(e) =>
                            setLignes((prev) =>
                              prev.map((x, idx) =>
                                idx === i
                                  ? { ...x, prixUnitaire: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={l.remise}
                          onChange={(e) =>
                            setLignes((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, remise: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        {lignes.length > 1 && (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() =>
                              setLignes((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="page-header-actions-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setLignes((prev) => [...prev, ligneVide()])}
                >
                  + Ligne
                </button>
                <p className="lead" style={{ margin: 0 }}>
                  Total HT : <strong>{formatFcfa(totalLignes(lignes))}</strong>
                  {' · '}TVA à l’émission (taux produit ou 18 %)
                </p>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="fac-notes">Notes</label>
              <textarea
                id="fac-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMut.isPending || !clientId || !lignesValides(lignes)}
            >
              {createMut.isPending ? 'Création…' : 'Créer le brouillon'}
            </button>
            {createMut.isError && (
              <p role="alert">Impossible de créer la facture.</p>
            )}
          </form>
        </ListPanel>
      )}

      <section className="kpi-grid dash-kpi-grid" aria-label="Pilotage factures">
        <button
          type="button"
          className={`kpi-card dash-kpi${filtre === 'BROUILLON' ? ' kpi-actif' : ''}`}
          onClick={() => setFiltre(filtre === 'BROUILLON' ? 'all' : 'BROUILLON')}
        >
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <FileText size={16} />
            </span>
            <InfoTooltip insight={insightFacturesBrouillons(kpis.brouillon)} />
          </div>
          <div className="kpi-label">Brouillons</div>
          <div className="kpi-value">{kpis.brouillon}</div>
        </button>
        <button
          type="button"
          className={`kpi-card dash-kpi${filtre === 'EMISE' ? ' kpi-actif' : ''}`}
          onClick={() => setFiltre(filtre === 'EMISE' ? 'all' : 'EMISE')}
        >
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <Receipt size={16} />
            </span>
            <InfoTooltip
              insight={insightFacturesEmises(kpis.emise, kpis.montantEmis)}
            />
          </div>
          <div className="kpi-label">Émises</div>
          <div className="kpi-value">{kpis.emise}</div>
          <div className="kpi-hint">{formatFcfa(kpis.montantEmis)}</div>
        </button>
      </section>

      <form
        className="page-header-actions-row"
        style={{ marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          setSearchApplied(searchQ);
        }}
      >
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="N° ou client…"
          aria-label="Recherche factures"
        />
        <button type="submit" className="btn btn-secondary">
          Rechercher
        </button>
      </form>

      {facturesQ.isLoading && <LoadingState label="Chargement des factures…" />}
      {facturesQ.isError && (
        <p role="alert">Impossible de charger les factures client.</p>
      )}
      {!facturesQ.isLoading && visibles.length === 0 && (
        <EmptyState
          title="Aucune facture"
          description="Créez un brouillon ou transformez un devis accepté. Un ticket caisse n’est pas une facture."
        />
      )}
      {visibles.length > 0 && (
        <div className="clients-table-wrap">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Client</th>
                <th>Statut</th>
                <th className="num">HT</th>
                <th className="num">TTC</th>
                <th className="num">Solde</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link to={`/ventes/factures/${f.id}`}>
                      <strong>{f.numero}</strong>
                    </Link>
                  </td>
                  <td>{libelleClient(f.client)}</td>
                  <td>
                    <span className={badgeFacture(f.statut)}>
                      {STATUT_FACTURE[f.statut]}
                    </span>
                  </td>
                  <td className="num money">{formatFcfa(f.montantHt)}</td>
                  <td className="num money">{formatFcfa(f.montantTtc)}</td>
                  <td className="num money">{formatFcfa(f.solde)}</td>
                  <td>
                    <Link to={`/ventes/factures/${f.id}`}>Ouvrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {peutEcrire && visibles.some((f) => f.transitions.includes('EMISE')) && (
        <p className="lead" style={{ marginTop: 8 }}>
          Action {ACTION_FACTURE.EMISE} disponible sur le détail de chaque brouillon.
        </p>
      )}
    </div>
  );
}
