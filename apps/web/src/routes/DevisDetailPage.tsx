import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle, rolesPourMenu } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import {
  ACTION_DEVIS,
  badgeDevis,
  formatFcfa,
  libelleClient,
  ligneVide,
  lignesPayload,
  lignesValides,
  montantLigne,
  STATUT_DEVIS,
  totalLignes,
  type LigneDevisForm,
  type StatutDevis,
} from '../lib/devis-ui';
import {
  insightDevisMontantDetail,
  insightDevisStatutDetail,
} from '../lib/insights/ventes';

type ColonneLigneDevis = 'designation' | 'quantite' | 'prixUnitaire' | 'remise' | 'total';

const ROLES_LECTURE = rolesPourMenu('ventes', '/ventes/devis');
const ROLES_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
];

interface DevisDetail {
  id: string;
  numero: string;
  statut: StatutDevis;
  montantTotal: string;
  notes: string | null;
  venteId: string | null;
  createdAt: string;
  updatedAt: string;
  transitions: StatutDevis[];
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    contact: string | null;
  };
  boutique: { id: string; nom: string } | null;
  lignes: Array<{
    id: string;
    designation: string;
    quantite: number;
    prixUnitaire: string;
    remise: string;
    produit: { id: string; nom: string } | null;
  }>;
}

export function DevisDetailPage() {
  const { devisId } = useParams<{ devisId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [lignes, setLignes] = useState<LigneDevisForm[]>([]);
  const [notes, setNotes] = useState('');
  const [venteId, setVenteId] = useState('');
  const [sortLignes, setSortLignes] = useState<SortState<ColonneLigneDevis> | null>(null);

  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);

  const devisQ = useQuery({
    queryKey: ['devis', devisId],
    queryFn: () => apiFetch<DevisDetail>(`/devis/${devisId}`),
    enabled: peutLire && Boolean(devisId),
  });

  useEffect(() => {
    if (!devisQ.data) return;
    setNotes(devisQ.data.notes ?? '');
    setVenteId(devisQ.data.venteId ?? '');
    setLignes(
      devisQ.data.lignes.map((l) => ({
        key: l.id,
        designation: l.designation,
        quantite: String(l.quantite),
        prixUnitaire: String(Number(l.prixUnitaire)),
        remise: String(Number(l.remise)),
      })),
    );
    setEditMode(false);
  }, [devisQ.data]);

  const updateMut = useMutation({
    mutationFn: () =>
      apiFetch(`/devis/${devisId}`, {
        method: 'PUT',
        body: JSON.stringify({
          notes: notes.trim() || undefined,
          lignes: lignesPayload(lignes),
        }),
      }),
    onSuccess: () => {
      setEditMode(false);
      void queryClient.invalidateQueries({ queryKey: ['devis'] });
    },
  });

  const transitionMut = useMutation({
    mutationFn: (payload: { statut: StatutDevis; venteId?: string }) =>
      apiFetch(`/devis/${devisId}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({
          statut: payload.statut,
          venteId: payload.venteId || undefined,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devis'] });
    },
  });

  const lignesTriees = useMemo(() => {
    const rows = (devisQ.data?.lignes ?? []).map((l) => ({
      ...l,
      total:
        Number(l.quantite) * Number(l.prixUnitaire) - Number(l.remise),
    }));
    return sortRows(rows, sortLignes, (row, key) => {
      switch (key) {
        case 'designation':
          return row.designation;
        case 'quantite':
          return row.quantite;
        case 'prixUnitaire':
          return Number(row.prixUnitaire);
        case 'remise':
          return Number(row.remise);
        case 'total':
          return row.total;
        default:
          return null;
      }
    });
  }, [devisQ.data, sortLignes]);

  if (!peutLire) return <Navigate to="/" replace />;
  if (!devisId) return <Navigate to="/ventes/devis" replace />;

  const d = devisQ.data;
  const isBrouillon = d?.statut === 'BROUILLON';

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (!lignesValides(lignes)) return;
    updateMut.mutate();
  }

  function updateLigne(key: string, patch: Partial<LigneDevisForm>) {
    setLignes((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function runTransition(to: StatutDevis) {
    if (to === 'ANNULE' && !window.confirm(`Annuler le devis ${d?.numero} ?`)) {
      return;
    }
    if (to === 'TRANSFORME') {
      const id = venteId.trim();
      transitionMut.mutate({
        statut: to,
        venteId: id || undefined,
      });
      return;
    }
    transitionMut.mutate({ statut: to });
  }

  return (
    <div className="devis-detail devis-print-root">
      <PageHeader
        title={d ? d.numero : 'Devis'}
        subtitle="Fiche devis B2B hors TVA — édition brouillon, transitions documentées"
        actions={
          <div className="page-header-actions-row no-print">
            <Link className="btn btn-secondary" to="/ventes/devis">
              ← Liste
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.print()}
            >
              Imprimer
            </button>
            {peutEcrire && isBrouillon && !editMode && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setEditMode(true)}
              >
                Modifier
              </button>
            )}
            {peutEcrire && isBrouillon && editMode && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditMode(false);
                  if (devisQ.data) {
                    setNotes(devisQ.data.notes ?? '');
                    setLignes(
                      devisQ.data.lignes.map((l) => ({
                        key: l.id,
                        designation: l.designation,
                        quantite: String(l.quantite),
                        prixUnitaire: String(Number(l.prixUnitaire)),
                        remise: String(Number(l.remise)),
                      })),
                    );
                  }
                }}
              >
                Annuler édition
              </button>
            )}
          </div>
        }
      />

      {devisQ.isLoading && <LoadingState label="Chargement du devis…" />}
      {devisQ.isError && (
        <EmptyState
          title="Devis introuvable"
          description="Ce devis n’existe pas ou vous n’y avez pas accès."
        />
      )}

      {d && (
        <>
          <ListPanel title="En-tête">
            <dl className="clients-dl">
              <div>
                <dt>Statut</dt>
                <dd>
                  <span className={badgeDevis(d.statut)}>
                    {STATUT_DEVIS[d.statut]}
                  </span>{' '}
                  <InfoTooltip
                    insight={insightDevisStatutDetail(d.statut, d.transitions)}
                  />
                </dd>
              </div>
              <div>
                <dt>Client</dt>
                <dd>
                  <Link to={`/clients/${d.client.id}`}>
                    {libelleClient(d.client)}
                  </Link>
                  {d.client.contact ? ` · ${d.client.contact}` : ''}
                </dd>
              </div>
              <div>
                <dt>Montant HT</dt>
                <dd className="money">
                  {formatFcfa(d.montantTotal)}{' '}
                  <InfoTooltip
                    insight={insightDevisMontantDetail(
                      d.montantTotal,
                      d.lignes.length,
                      d.lignes.reduce((acc, l) => acc + Number(l.remise), 0),
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt>Boutique</dt>
                <dd>{d.boutique?.nom ?? '—'}</dd>
              </div>
              <div>
                <dt>Créé</dt>
                <dd>{new Date(d.createdAt).toLocaleString('fr-FR')}</dd>
              </div>
              <div>
                <dt>Vente liée</dt>
                <dd>
                  {d.venteId ? (
                    <code>{d.venteId}</code>
                  ) : (
                    'Aucune (pas d’auto-POS)'
                  )}
                </dd>
              </div>
            </dl>
          </ListPanel>

          {peutEcrire && d.transitions.length > 0 && (
            <div className="no-print">
            <ListPanel title="Actions de workflow">
              <div className="page-header-actions-row">
                {d.transitions.map((to) => (
                  <button
                    key={to}
                    type="button"
                    className={
                      to === 'ANNULE' || to === 'REFUSE'
                        ? 'btn btn-ghost'
                        : 'btn-primary'
                    }
                    disabled={transitionMut.isPending || editMode}
                    onClick={() => runTransition(to)}
                  >
                    {ACTION_DEVIS[to]}
                  </button>
                ))}
              </div>
              {d.transitions.includes('TRANSFORME') && (
                <div style={{ marginTop: 12, maxWidth: 420 }}>
                  <label htmlFor="devis-vente-id">
                    ID vente (optionnel — pas d’ouverture POS)
                  </label>
                  <input
                    id="devis-vente-id"
                    value={venteId}
                    onChange={(e) => setVenteId(e.target.value)}
                    placeholder="UUID vente existante, ou laisser vide"
                  />
                </div>
              )}
              {transitionMut.isError && (
                <p role="alert">Transition refusée.</p>
              )}
            </ListPanel>
            </div>
          )}

          <ListPanel title="Lignes (hors TVA)">
            {editMode && peutEcrire && isBrouillon ? (
              <form onSubmit={onSave}>
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
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={1}
                              value={l.quantite}
                              onChange={(e) =>
                                updateLigne(l.key, {
                                  quantite: e.target.value,
                                })
                              }
                              required
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
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
                              value={l.remise}
                              onChange={(e) =>
                                updateLigne(l.key, { remise: e.target.value })
                              }
                            />
                          </td>
                          <td className="num money">
                            {formatFcfa(montantLigne(l))}
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
                    Total HT :{' '}
                    <strong>{formatFcfa(totalLignes(lignes))}</strong>
                  </p>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label htmlFor="devis-notes-edit">Notes</label>
                  <textarea
                    id="devis-notes-edit"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={updateMut.isPending || !lignesValides(lignes)}
                >
                  {updateMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {updateMut.isError && (
                  <p role="alert">Impossible d’enregistrer.</p>
                )}
              </form>
            ) : (
              <>
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <SortHeader
                          active={sortLignes?.key === 'designation'}
                          dir={sortLignes?.key === 'designation' ? sortLignes.dir : 'asc'}
                          onClick={() =>
                            setSortLignes((s) => toggleSort(s, 'designation'))
                          }
                        >
                          Désignation
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortLignes?.key === 'quantite'}
                          dir={sortLignes?.key === 'quantite' ? sortLignes.dir : 'asc'}
                          onClick={() =>
                            setSortLignes((s) => toggleSort(s, 'quantite'))
                          }
                        >
                          Qté
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortLignes?.key === 'prixUnitaire'}
                          dir={sortLignes?.key === 'prixUnitaire' ? sortLignes.dir : 'asc'}
                          onClick={() =>
                            setSortLignes((s) => toggleSort(s, 'prixUnitaire'))
                          }
                        >
                          P.U.
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortLignes?.key === 'remise'}
                          dir={sortLignes?.key === 'remise' ? sortLignes.dir : 'asc'}
                          onClick={() =>
                            setSortLignes((s) => toggleSort(s, 'remise'))
                          }
                        >
                          Remise
                        </SortHeader>
                        <SortHeader
                          className="num"
                          active={sortLignes?.key === 'total'}
                          dir={sortLignes?.key === 'total' ? sortLignes.dir : 'asc'}
                          onClick={() =>
                            setSortLignes((s) => toggleSort(s, 'total'))
                          }
                        >
                          Total
                        </SortHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesTriees.map((l) => (
                        <tr key={l.id}>
                          <td>
                            {l.designation}
                            {l.produit ? (
                              <span className="text-muted">
                                {' '}
                                · {l.produit.nom}
                              </span>
                            ) : null}
                          </td>
                          <td className="num">{l.quantite}</td>
                          <td className="num money">
                            {formatFcfa(l.prixUnitaire)}
                          </td>
                          <td className="num money">
                            {formatFcfa(l.remise)}
                          </td>
                          <td className="num money">{formatFcfa(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>
                          <strong>Total HT (hors TVA)</strong>
                        </td>
                        <td className="num money">
                          <strong>{formatFcfa(d.montantTotal)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {d.notes && (
                  <p className="lead" style={{ marginTop: 12 }}>
                    Notes : {d.notes}
                  </p>
                )}
              </>
            )}
          </ListPanel>
        </>
      )}
    </div>
  );
}
