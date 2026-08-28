import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle, rolesPourMenu } from '@caisse-crm/shared';
import { apiDownload, apiFetch, apiPrintPdf } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import type { SocieteDto } from '../lib/types';
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

type ColonneLigneDevis =
  | 'designation'
  | 'quantite'
  | 'prixUnitaire'
  | 'remise'
  | 'total';

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
  factureClient: { id: string; numero: string; statut: string } | null;
  createdAt: string;
  updatedAt: string;
  transitions: StatutDevis[];
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    contact: string | null;
    adresse?: string | null;
  };
  boutique: { id: string; nom: string } | null;
  lignes: Array<{
    id: string;
    designation: string;
    quantite: number;
    prixUnitaire: string;
    remise: string;
    produit: { id: string; designation: string } | null;
  }>;
}

export function DevisDetailPage() {
  const { devisId } = useParams<{ devisId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [lignes, setLignes] = useState<LigneDevisForm[]>([]);
  const [notes, setNotes] = useState('');
  const [venteId, setVenteId] = useState('');
  const [sortLignes, setSortLignes] = useState<SortState<ColonneLigneDevis> | null>(
    null,
  );
  const [pdfPending, setPdfPending] = useState(false);
  const [printPending, setPrintPending] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);

  const devisQ = useQuery({
    queryKey: ['devis', devisId],
    queryFn: () => apiFetch<DevisDetail>(`/devis/${devisId}`),
    enabled: peutLire && Boolean(devisId),
  });

  const societeQ = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
    enabled: peutLire,
    staleTime: 60_000,
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

  const factureMut = useMutation({
    mutationFn: () => {
      const devis = devisQ.data;
      if (!devis) throw new Error('Devis introuvable.');
      return apiFetch<{ id: string }>('/factures-client', {
        method: 'POST',
        body: JSON.stringify({
          clientId: devis.client.id,
          boutiqueId: devis.boutique?.id,
          devisId: devis.id,
          notes: devis.notes || undefined,
          lignes: devis.lignes.map((l) => ({
            produitId: l.produit?.id,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: Number(l.prixUnitaire),
            remise: Number(l.remise),
          })),
        }),
      });
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['devis'] });
      void queryClient.invalidateQueries({ queryKey: ['factures-client'] });
      navigate(`/ventes/factures/${created.id}`);
    },
  });

  const lignesTriees = useMemo(() => {
    const rows = (devisQ.data?.lignes ?? []).map((l) => ({
      ...l,
      total: Number(l.quantite) * Number(l.prixUnitaire) - Number(l.remise),
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

  const totalRemises = useMemo(
    () =>
      (devisQ.data?.lignes ?? []).reduce((acc, l) => acc + Number(l.remise), 0),
    [devisQ.data],
  );

  if (!peutLire) return <Navigate to="/" replace />;
  if (!devisId) return <Navigate to="/ventes/devis" replace />;

  const d = devisQ.data;
  const isBrouillon = d?.statut === 'BROUILLON';
  const societe = societeQ.data;

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
      transitionMut.mutate({
        statut: to,
        venteId: venteId.trim() || undefined,
      });
      return;
    }
    transitionMut.mutate({ statut: to });
  }

  async function telechargerPdf() {
    if (!d) return;
    setPdfError(null);
    setPdfPending(true);
    try {
      await apiDownload(`/devis/${d.id}/pdf`, `devis-${d.numero}.pdf`);
    } catch {
      setPdfError('Impossible de générer le PDF.');
    } finally {
      setPdfPending(false);
    }
  }

  async function imprimerDevis() {
    if (!d) return;
    setPdfError(null);
    setPrintPending(true);
    try {
      await apiPrintPdf(`/devis/${d.id}/pdf`);
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : 'Impossible d’ouvrir le PDF pour impression.',
      );
    } finally {
      setPrintPending(false);
    }
  }

  return (
    <div className="devis-detail">
      <div className="no-print">
        <PageHeader
          title={d ? d.numero : 'Devis'}
          subtitle="Document commercial B2B — hors TVA"
          actions={
            <div className="page-header-actions-row">
              <Link className="btn btn-secondary" to="/ventes/devis">
                ← Liste
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void imprimerDevis()}
                disabled={!d || printPending}
              >
                {printPending ? 'Ouverture…' : 'Imprimer'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void telechargerPdf()}
                disabled={!d || pdfPending}
              >
                {pdfPending ? 'PDF…' : 'Télécharger PDF'}
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
        {pdfError && <p role="alert">{pdfError}</p>}
      </div>

      {devisQ.isLoading && <LoadingState label="Chargement du devis…" />}
      {devisQ.isError && (
        <EmptyState
          title="Devis introuvable"
          description="Ce devis n’existe pas ou vous n’y avez pas accès."
        />
      )}

      {d && editMode && peutEcrire && isBrouillon && (
        <div className="no-print">
          <ListPanel title="Édition brouillon">
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
                              updateLigne(l.key, { quantite: e.target.value })
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
                  Total HT : <strong>{formatFcfa(totalLignes(lignes))}</strong>
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
          </ListPanel>
        </div>
      )}

      {d && !editMode && (
        <>
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
                      disabled={transitionMut.isPending}
                      onClick={() => runTransition(to)}
                    >
                      {ACTION_DEVIS[to]}
                    </button>
                  ))}
                </div>
                {d.transitions.includes('TRANSFORME') && !d.factureClient && (
                  <div style={{ marginTop: 12, maxWidth: 420 }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={factureMut.isPending}
                      onClick={() => factureMut.mutate()}
                    >
                      {factureMut.isPending
                        ? 'Création…'
                        : 'Transformer en facture'}
                    </button>
                    <p className="lead" style={{ marginTop: 8 }}>
                      Crée une facture B2B (HT + TVA). Ne crée pas de ticket POS.
                    </p>
                    <label htmlFor="devis-vente-id">
                      Ou lier un ticket POS existant (optionnel)
                    </label>
                    <input
                      id="devis-vente-id"
                      value={venteId}
                      onChange={(e) => setVenteId(e.target.value)}
                      placeholder="UUID vente existante, ou laisser vide"
                    />
                  </div>
                )}
                {d.factureClient && (
                  <p className="lead" style={{ marginTop: 12 }}>
                    Facture{' '}
                    <Link to={`/ventes/factures/${d.factureClient.id}`}>
                      {d.factureClient.numero}
                    </Link>
                  </p>
                )}
                {factureMut.isError && (
                  <p role="alert">Impossible de créer la facture depuis ce devis.</p>
                )}
                {transitionMut.isError && (
                  <p role="alert">Transition refusée.</p>
                )}
              </ListPanel>
            </div>
          )}

          <article className="devis-doc devis-print-root">
            <header className="devis-doc-top">
              <div className="devis-doc-brand">
                <p className="devis-doc-enseigne">
                  {societe?.raisonSociale ?? 'MAJOR AUTO PARTS'}
                </p>
                {societe?.adresse && (
                  <p className="devis-doc-meta">{societe.adresse}</p>
                )}
                <p className="devis-doc-meta">
                  {[societe?.telephone, societe?.email]
                    .filter(Boolean)
                    .join(' · ') || 'Pièces & accessoires véhicules'}
                </p>
              </div>
              <div className="devis-doc-title-block">
                <p className="devis-doc-kicker">Document commercial</p>
                <h1 className="devis-doc-title">DEVIS</h1>
                <p className="devis-doc-numero">{d.numero}</p>
                <p className="devis-doc-statut">
                  <span className={badgeDevis(d.statut)}>
                    {STATUT_DEVIS[d.statut]}
                  </span>
                  <span className="no-print">
                    {' '}
                    <InfoTooltip
                      insight={insightDevisStatutDetail(
                        d.statut,
                        d.transitions,
                      )}
                    />
                  </span>
                </p>
              </div>
            </header>

            <div className="devis-doc-parties">
              <section className="devis-doc-card">
                <h2>Client</h2>
                <p>
                  <strong>
                    <Link to={`/clients/${d.client.id}`}>
                      {libelleClient(d.client)}
                    </Link>
                  </strong>
                </p>
                {d.client.contact && <p>{d.client.contact}</p>}
                {d.client.adresse && <p>{d.client.adresse}</p>}
              </section>
              <section className="devis-doc-card">
                <h2>Document</h2>
                <dl className="devis-doc-dl">
                  <div>
                    <dt>Date</dt>
                    <dd>
                      {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                    </dd>
                  </div>
                  <div>
                    <dt>Validité</dt>
                    <dd>15 jours</dd>
                  </div>
                  <div>
                    <dt>Boutique</dt>
                    <dd>
                      {d.boutique?.nom ??
                        societe?.raisonSociale ??
                        'MAJOR AUTO PARTS'}
                    </dd>
                  </div>
                  <div>
                    <dt>Fiscalité</dt>
                    <dd>Hors TVA</dd>
                  </div>
                  {d.venteId && (
                    <div>
                      <dt>Vente</dt>
                      <dd>
                        <code>{d.venteId.slice(0, 8)}…</code>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>

            <section className="devis-doc-lignes">
              <h2 className="devis-doc-section-title">
                Détail des lignes
                <span className="no-print">
                  {' '}
                  <InfoTooltip
                    insight={insightDevisMontantDetail(
                      d.montantTotal,
                      d.lignes.length,
                      totalRemises,
                    )}
                  />
                </span>
              </h2>
              <div className="clients-table-wrap">
                <table className="devis-doc-table">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <SortHeader
                        active={sortLignes?.key === 'designation'}
                        dir={
                          sortLignes?.key === 'designation'
                            ? sortLignes.dir
                            : 'asc'
                        }
                        onClick={() =>
                          setSortLignes((s) => toggleSort(s, 'designation'))
                        }
                      >
                        Désignation
                      </SortHeader>
                      <SortHeader
                        className="num"
                        active={sortLignes?.key === 'quantite'}
                        dir={
                          sortLignes?.key === 'quantite' ? sortLignes.dir : 'asc'
                        }
                        onClick={() =>
                          setSortLignes((s) => toggleSort(s, 'quantite'))
                        }
                      >
                        Qté
                      </SortHeader>
                      <SortHeader
                        className="num"
                        active={sortLignes?.key === 'prixUnitaire'}
                        dir={
                          sortLignes?.key === 'prixUnitaire'
                            ? sortLignes.dir
                            : 'asc'
                        }
                        onClick={() =>
                          setSortLignes((s) => toggleSort(s, 'prixUnitaire'))
                        }
                      >
                        P.U. HT
                      </SortHeader>
                      <SortHeader
                        className="num"
                        active={sortLignes?.key === 'remise'}
                        dir={
                          sortLignes?.key === 'remise' ? sortLignes.dir : 'asc'
                        }
                        onClick={() =>
                          setSortLignes((s) => toggleSort(s, 'remise'))
                        }
                      >
                        Remise
                      </SortHeader>
                      <SortHeader
                        className="num"
                        active={sortLignes?.key === 'total'}
                        dir={
                          sortLignes?.key === 'total' ? sortLignes.dir : 'asc'
                        }
                        onClick={() =>
                          setSortLignes((s) => toggleSort(s, 'total'))
                        }
                      >
                        Total HT
                      </SortHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTriees.map((l, i) => (
                      <tr key={l.id}>
                        <td className="num">{i + 1}</td>
                        <td>
                          {l.designation}
                          {l.produit ? (
                            <span className="text-muted">
                              {' '}
                              · {l.produit.designation}
                            </span>
                          ) : null}
                        </td>
                        <td className="num">{l.quantite}</td>
                        <td className="num money">
                          {formatFcfa(l.prixUnitaire)}
                        </td>
                        <td className="num money">{formatFcfa(l.remise)}</td>
                        <td className="num money">{formatFcfa(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="devis-doc-totals">
              <div className="devis-doc-notes">
                {d.notes ? (
                  <>
                    <h2>Notes</h2>
                    <p>{d.notes}</p>
                  </>
                ) : (
                  <p className="devis-doc-muted">Aucune note.</p>
                )}
              </div>
              <dl className="devis-doc-sum">
                <div>
                  <dt>Sous-total HT</dt>
                  <dd>
                    {formatFcfa(Number(d.montantTotal) + totalRemises)}
                  </dd>
                </div>
                {totalRemises > 0 && (
                  <div>
                    <dt>Remises</dt>
                    <dd>− {formatFcfa(totalRemises)}</dd>
                  </div>
                )}
                <div className="devis-doc-sum-total">
                  <dt>Total HT</dt>
                  <dd>{formatFcfa(d.montantTotal)}</dd>
                </div>
              </dl>
            </div>

            <footer className="devis-doc-footer">
              <p>
                Validité indicative : 15 jours à compter de la date du devis.
                Prix hors TVA, sous réserve de disponibilité stock. Ce document
                n’est pas une facture.
              </p>
              <div className="devis-doc-signatures">
                <div>
                  <span>Bon pour accord client</span>
                  <em>Date & signature</em>
                </div>
                <div>
                  <span>Pour l’émetteur</span>
                  <em>Cachet / signature</em>
                </div>
              </div>
            </footer>
          </article>
        </>
      )}
    </div>
  );
}
