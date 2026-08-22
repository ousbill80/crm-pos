import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileEdit, PiggyBank, Send, ThumbsUp } from 'lucide-react';
import { RoleLibelle, rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import type { ClientDto } from '../lib/types';
import {
  ACTION_DEVIS,
  badgeDevis,
  formatFcfa,
  libelleClient,
  ligneVide,
  lignesPayload,
  lignesValides,
  STATUT_DEVIS,
  totalLignes,
  type LigneDevisForm,
  type StatutDevis,
} from '../lib/devis-ui';
import {
  insightDevisAcceptes,
  insightDevisBrouillons,
  insightDevisEnvoyes,
  insightDevisPipeline,
} from '../lib/insights/ventes';

const ROLES_LECTURE = rolesPourMenu('ventes', '/ventes/devis');
const ROLES_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

interface DevisListItem {
  id: string;
  numero: string;
  statut: StatutDevis;
  montantTotal: string;
  createdAt: string;
  client: { id: string; nom: string; prenom: string | null };
  boutique: { id: string; nom: string } | null;
  transitions: StatutDevis[];
  _count: { lignes: number };
}

type KpiFiltre =
  | 'all'
  | 'BROUILLON'
  | 'ENVOYE'
  | 'ACCEPTE'
  | 'REFUSE'
  | 'ANNULE'
  | 'TRANSFORME';

export function DevisPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [clientQ, setClientQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [lignes, setLignes] = useState<LigneDevisForm[]>([ligneVide()]);
  const [notes, setNotes] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<StatutDevis | ''>('');
  const [filtreKpi, setFiltreKpi] = useState<KpiFiltre>('all');
  const [searchQ, setSearchQ] = useState('');
  const [searchApplied, setSearchApplied] = useState('');

  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);

  const devisQ = useQuery({
    queryKey: ['devis', searchApplied],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchApplied.trim().length >= 2) {
        params.set('q', searchApplied.trim());
      }
      const qs = params.toString();
      return apiFetch<DevisListItem[]>(`/devis${qs ? `?${qs}` : ''}`);
    },
    enabled: peutLire,
  });

  const clientsQ = useQuery({
    queryKey: ['crm-clients', 'devis-search', clientQ],
    queryFn: () =>
      apiFetch<ClientDto[]>(
        `/crm/clients?q=${encodeURIComponent(clientQ.trim())}`,
      ),
    enabled: peutEcrire && showCreate && clientQ.trim().length >= 2,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/devis', {
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
      void queryClient.invalidateQueries({ queryKey: ['devis'] });
      navigate(`/ventes/devis/${created.id}`);
    },
  });

  const transitionMut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: StatutDevis }) =>
      apiFetch(`/devis/${id}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devis'] });
    },
  });

  const clientChoisi = useMemo(
    () => (clientsQ.data ?? []).find((c) => c.id === clientId),
    [clientsQ.data, clientId],
  );

  const kpis = useMemo(() => {
    const rows = devisQ.data ?? [];
    const count = (s: StatutDevis) => rows.filter((d) => d.statut === s).length;
    return {
      total: rows.length,
      brouillon: count('BROUILLON'),
      envoye: count('ENVOYE'),
      accepte: count('ACCEPTE'),
      refuse: count('REFUSE'),
      annule: count('ANNULE'),
      transforme: count('TRANSFORME'),
      montantPipeline: rows
        .filter((d) => d.statut === 'BROUILLON' || d.statut === 'ENVOYE')
        .reduce((acc, d) => acc + Number(d.montantTotal), 0),
    };
  }, [devisQ.data]);

  const liste = useMemo(() => {
    let rows = devisQ.data ?? [];
    if (filtreKpi !== 'all') {
      rows = rows.filter((d) => d.statut === filtreKpi);
    }
    if (filtreStatut) {
      rows = rows.filter((d) => d.statut === filtreStatut);
    }
    return rows;
  }, [devisQ.data, filtreKpi, filtreStatut]);

  if (!peutLire) return <Navigate to="/" replace />;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !lignesValides(lignes)) return;
    createMut.mutate();
  }

  function setVue(next: KpiFiltre) {
    setFiltreKpi(next);
    if (next !== 'all') setFiltreStatut('');
  }

  function updateLigne(key: string, patch: Partial<LigneDevisForm>) {
    setLignes((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function actionsRapides(d: DevisListItem) {
    const primary = d.transitions.filter((t) => t !== 'ANNULE');
    const cancel = d.transitions.includes('ANNULE') ? (['ANNULE'] as const) : [];
    return [...primary, ...cancel];
  }

  return (
    <div>
      <PageHeader
        title="Devis clients"
        subtitle="B2B hors TVA — BROUILLON → ENVOYÉ → ACCEPTÉ | REFUSÉ · ANNULE · TRANSFORMÉ (venteId optionnel, pas d’auto-POS)"
        actions={
          peutEcrire ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? 'Fermer' : 'Nouveau devis'}
            </button>
          ) : undefined
        }
      />

      <p className="lead devis-workflow-hint">
        Workflow : brouillon → envoyé → accepté / refusé · brouillon|envoyé →
        annulé · accepté → transformé (lien vente optionnel).
      </p>

      {showCreate && peutEcrire && (
        <ListPanel title="Nouveau devis (brouillon, multi-lignes)">
          <form className="form-grid" onSubmit={onCreate}>
            {user?.boutiqueId && (
              <p className="lead" style={{ gridColumn: '1 / -1' }}>
                Boutique rattachée automatiquement à la création (votre magasin).
              </p>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="devis-client-q">Client</label>
              <input
                id="devis-client-q"
                type="search"
                placeholder="Recherche nom / téléphone (min. 2 car.)"
                value={clientQ}
                onChange={(e) => {
                  setClientQ(e.target.value);
                  setClientId('');
                }}
              />
              {clientChoisi && (
                <p className="lead">
                  Sélection : <strong>{libelleClient(clientChoisi)}</strong>
                </p>
              )}
              {!clientId && (clientsQ.data?.length ?? 0) > 0 && (
                <ul className="dash-section-summary-list">
                  {clientsQ.data!.slice(0, 8).map((c) => (
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
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="num">Qté</th>
                      <th className="num">P.U.</th>
                      <th className="num">Remise</th>
                      <th className="num">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.key}>
                        <td>
                          <input
                            value={l.designation}
                            onChange={(e) =>
                              updateLigne(l.key, {
                                designation: e.target.value,
                              })
                            }
                            required
                            placeholder="Article / prestation"
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min={1}
                            value={l.quantite}
                            onChange={(e) =>
                              updateLigne(l.key, { quantite: e.target.value })
                            }
                            required
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={l.prixUnitaire}
                            onChange={(e) =>
                              updateLigne(l.key, {
                                prixUnitaire: e.target.value,
                              })
                            }
                            required
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={l.remise}
                            onChange={(e) =>
                              updateLigne(l.key, { remise: e.target.value })
                            }
                          />
                        </td>
                        <td className="num money">
                          {formatFcfa(
                            Math.max(
                              0,
                              (Number(l.quantite) || 0) *
                                (Number(l.prixUnitaire) || 0) -
                                (Number(l.remise) || 0),
                            ),
                          )}
                        </td>
                        <td>
                          {lignes.length > 1 && (
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() =>
                                setLignes((prev) =>
                                  prev.filter((x) => x.key !== l.key),
                                )
                              }
                            >
                              Retirer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                </p>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="devis-notes">Notes</label>
              <textarea
                id="devis-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={
                createMut.isPending || !clientId || !lignesValides(lignes)
              }
            >
              {createMut.isPending ? 'Création…' : 'Créer le brouillon'}
            </button>
            {createMut.isError && (
              <p role="alert">Impossible de créer le devis.</p>
            )}
          </form>
        </ListPanel>
      )}

      {!devisQ.isLoading && devisQ.data && (
        <section className="kpi-grid dash-kpi-grid" aria-label="Pilotage devis">
          <button
            type="button"
            className={`kpi-card dash-kpi${filtreKpi === 'BROUILLON' ? ' kpi-actif' : ''}`}
            onClick={() =>
              setVue(filtreKpi === 'BROUILLON' ? 'all' : 'BROUILLON')
            }
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <FileEdit size={16} />
              </span>
              <InfoTooltip insight={insightDevisBrouillons(kpis.brouillon)} />
            </div>
            <div className="kpi-label">Brouillons</div>
            <div className="kpi-value">{kpis.brouillon}</div>
            <div className="kpi-hint">À envoyer</div>
          </button>
          <button
            type="button"
            className={`kpi-card dash-kpi${filtreKpi === 'ENVOYE' ? ' kpi-actif' : ''}${kpis.envoye > 0 ? ' kpi-warning' : ''}`}
            onClick={() => setVue(filtreKpi === 'ENVOYE' ? 'all' : 'ENVOYE')}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <Send size={16} />
              </span>
              <InfoTooltip insight={insightDevisEnvoyes(kpis.envoye)} />
            </div>
            <div className="kpi-label">Envoyés</div>
            <div className="kpi-value">{kpis.envoye}</div>
            <div className="kpi-hint">En attente réponse</div>
          </button>
          <button
            type="button"
            className={`kpi-card dash-kpi${filtreKpi === 'ACCEPTE' ? ' kpi-actif' : ''}`}
            onClick={() => setVue(filtreKpi === 'ACCEPTE' ? 'all' : 'ACCEPTE')}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <ThumbsUp size={16} />
              </span>
              <InfoTooltip insight={insightDevisAcceptes(kpis.accepte)} />
            </div>
            <div className="kpi-label">Acceptés</div>
            <div className="kpi-value">{kpis.accepte}</div>
            <div className="kpi-hint">À transformer</div>
          </button>
          <button
            type="button"
            className={`kpi-card dash-kpi${filtreKpi === 'all' ? ' kpi-actif' : ''}`}
            onClick={() => setVue('all')}
          >
            <div className="dash-kpi-top">
              <span className="dash-kpi-icon">
                <PiggyBank size={16} />
              </span>
              <InfoTooltip
                insight={insightDevisPipeline(kpis.montantPipeline, kpis.total)}
              />
            </div>
            <div className="kpi-label">Pipeline</div>
            <div className="kpi-value">{formatFcfa(kpis.montantPipeline)}</div>
            <div className="kpi-hint">
              {kpis.total} devis · hors TVA
            </div>
          </button>
        </section>
      )}

      <div className="toolbar">
        <div>
          <label htmlFor="devis-search">Recherche</label>
          <input
            id="devis-search"
            type="search"
            placeholder="N° ou client (min. 2)"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearchApplied(searchQ.trim());
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setSearchApplied(searchQ.trim())}
        >
          Filtrer
        </button>
        <div>
          <label htmlFor="filtre-devis-statut">Statut</label>
          <select
            id="filtre-devis-statut"
            value={filtreStatut}
            onChange={(e) => {
              setFiltreStatut(e.target.value as StatutDevis | '');
              setFiltreKpi('all');
            }}
          >
            <option value="">Tous</option>
            {(Object.keys(STATUT_DEVIS) as StatutDevis[]).map((s) => (
              <option key={s} value={s}>
                {STATUT_DEVIS[s]}
              </option>
            ))}
          </select>
        </div>
        {(filtreKpi !== 'all' || filtreStatut || searchApplied) && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFiltreKpi('all');
              setFiltreStatut('');
              setSearchQ('');
              setSearchApplied('');
            }}
          >
            Effacer filtres
          </button>
        )}
        <p className="lead">
          {liste.length} devis
          {filtreKpi !== 'all' ? ` · ${STATUT_DEVIS[filtreKpi]}` : ''}
          {filtreStatut ? ` · ${STATUT_DEVIS[filtreStatut]}` : ''}
        </p>
      </div>

      <ListPanel title="Liste des devis">
        {devisQ.isLoading && <LoadingState label="Chargement…" />}
        {devisQ.isError && (
          <p role="alert">Impossible de charger les devis.</p>
        )}
        {!devisQ.isLoading && (devisQ.data?.length ?? 0) === 0 && (
          <EmptyState
            title="Aucun devis"
            description="Créez un brouillon multi-lignes pour un client professionnel."
          />
        )}
        {!devisQ.isLoading &&
          (devisQ.data?.length ?? 0) > 0 &&
          liste.length === 0 && (
            <EmptyState
              title="Aucun résultat"
              description="Aucun devis ne correspond à ce filtre."
            />
          )}
        {liste.length > 0 && (
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Statut</th>
                  <th className="num">Montant HT</th>
                  <th className="num">Lignes</th>
                  <th>Créé</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liste.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/ventes/devis/${d.id}`}>
                        <strong>{d.numero}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link to={`/clients/${d.client.id}`}>
                        {libelleClient(d.client)}
                      </Link>
                    </td>
                    <td>
                      <span className={badgeDevis(d.statut)}>
                        {STATUT_DEVIS[d.statut]}
                      </span>
                    </td>
                    <td className="num money">
                      {formatFcfa(d.montantTotal)}
                    </td>
                    <td className="num">{d._count.lignes}</td>
                    <td>
                      {new Date(d.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link to={`/ventes/devis/${d.id}`}>Ouvrir</Link>
                        {peutEcrire &&
                          actionsRapides(d).map((to) => (
                            <button
                              key={to}
                              type="button"
                              className="btn-ghost"
                              disabled={transitionMut.isPending}
                              onClick={() => {
                                if (
                                  to === 'ANNULE' &&
                                  !window.confirm(
                                    `Annuler le devis ${d.numero} ?`,
                                  )
                                ) {
                                  return;
                                }
                                transitionMut.mutate({ id: d.id, statut: to });
                              }}
                            >
                              {ACTION_DEVIS[to]}
                            </button>
                          ))}
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
