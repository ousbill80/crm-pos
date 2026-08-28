import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle, rolesPourMenu } from '@caisse-crm/shared';
import { apiDownload, apiFetch, apiPrintPdf, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import type { SocieteDto } from '../lib/types';
import {
  ACTION_FACTURE,
  badgeFacture,
  formatFcfa,
  libelleClient,
  MODE_ENCAISSEMENT,
  STATUT_FACTURE,
  type StatutFactureClient,
} from '../lib/facture-client-ui';
import { insightFactureSolde } from '../lib/insights/ventes';

const ROLES_LECTURE = rolesPourMenu('ventes', '/ventes/factures');
const ROLES_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.DAF,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RAF_COMPTABLE,
];
const ROLES_ENCAISSEMENT: RoleLibelle[] = [
  RoleLibelle.RAF_COMPTABLE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

interface FactureDetail {
  id: string;
  numero: string;
  statut: StatutFactureClient;
  dateFacture: string;
  dateEcheance: string | null;
  montantHt: string;
  montantTva: string;
  montantTtc: string;
  montantPaye: string;
  solde: string;
  notes: string | null;
  createdAt: string;
  transitions: StatutFactureClient[];
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    contact: string | null;
    adresse?: string | null;
  };
  boutique: { id: string; nom: string } | null;
  devis: { id: string; numero: string; statut: string } | null;
  lignes: Array<{
    id: string;
    designation: string;
    quantite: number;
    prixUnitaire: string;
    remise: string;
    tauxTva: string;
    montantHt: string;
    montantTva: string;
    montantTtc: string;
  }>;
  paiements: Array<{
    id: string;
    montant: string;
    mode: string;
    datePaiement: string;
    reference: string | null;
  }>;
}

export function FactureClientDetailPage() {
  const { factureId } = useParams<{ factureId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pdfPending, setPdfPending] = useState(false);
  const [printPending, setPrintPending] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [encMontant, setEncMontant] = useState('');
  const [encMode, setEncMode] = useState('VIREMENT');
  const [encRef, setEncRef] = useState('');

  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);
  const peutEncaisser =
    user !== null && ROLES_ENCAISSEMENT.includes(user.role);

  const factureQ = useQuery({
    queryKey: ['factures-client', factureId],
    queryFn: () => apiFetch<FactureDetail>(`/factures-client/${factureId}`),
    enabled: peutLire && Boolean(factureId),
  });

  const societeQ = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
    enabled: peutLire,
    staleTime: 60_000,
  });

  const transitionMut = useMutation({
    mutationFn: (statut: StatutFactureClient) =>
      apiFetch(`/factures-client/${factureId}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['factures-client'] });
      void queryClient.invalidateQueries({ queryKey: ['devis'] });
    },
  });

  const encMut = useMutation({
    mutationFn: () =>
      apiFetch(`/factures-client/${factureId}/encaissements`, {
        method: 'POST',
        body: JSON.stringify({
          montant: Number(encMontant),
          mode: encMode,
          reference: encRef.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setEncMontant('');
      setEncRef('');
      void queryClient.invalidateQueries({ queryKey: ['factures-client'] });
    },
  });

  useEffect(() => {
    if (factureQ.data) setEncMontant(String(Number(factureQ.data.solde)));
  }, [factureQ.data]);

  if (!user) return <Navigate to="/login" replace />;
  if (!peutLire) return <Navigate to="/ventes" replace />;
  if (!factureId) return <Navigate to="/ventes/factures" replace />;

  const d = factureQ.data;
  const societe = societeQ.data;

  async function telechargerPdf() {
    if (!d) return;
    setPdfError(null);
    setPdfPending(true);
    try {
      await apiDownload(`/factures-client/${d.id}/pdf`, `facture-${d.numero}.pdf`);
    } catch {
      setPdfError('Impossible de générer le PDF.');
    } finally {
      setPdfPending(false);
    }
  }

  async function imprimer() {
    if (!d) return;
    setPdfError(null);
    setPrintPending(true);
    try {
      await apiPrintPdf(`/factures-client/${d.id}/pdf`);
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

  function onEncaisser(e: FormEvent) {
    e.preventDefault();
    if (!Number(encMontant)) return;
    encMut.mutate();
  }

  const encErreur = encMut.isError
    ? messageDepuisApi(encMut.error, 'Encaissement refusé.')
    : null;
  const transErreur = transitionMut.isError
    ? messageDepuisApi(transitionMut.error, 'Transition refusée.')
    : null;

  return (
    <div className="devis-detail">
      <div className="no-print">
        <PageHeader
          title={d ? d.numero : 'Facture'}
          subtitle="Facture client B2B — HT + TVA collectée (411 / 701 / 4457)"
          actions={
            <div className="page-header-actions-row">
              <Link className="btn btn-secondary" to="/ventes/factures">
                ← Liste
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void imprimer()}
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
            </div>
          }
        />
      </div>

      {factureQ.isLoading && <LoadingState label="Chargement de la facture…" />}
      {factureQ.isError && (
        <p role="alert">Impossible de charger la facture client.</p>
      )}
      {pdfError && <p role="alert">{pdfError}</p>}

      {d && peutEcrire && d.transitions.length > 0 && (
        <div className="no-print">
          <ListPanel title="Actions de workflow">
            <div className="page-header-actions-row">
              {d.transitions.map((to) => (
                <button
                  key={to}
                  type="button"
                  className={to === 'ANNULEE' ? 'btn btn-ghost' : 'btn-primary'}
                  disabled={transitionMut.isPending}
                  onClick={() => {
                    if (
                      to === 'ANNULEE' &&
                      !window.confirm(`Annuler la facture ${d.numero} ?`)
                    ) {
                      return;
                    }
                    transitionMut.mutate(to);
                  }}
                >
                  {ACTION_FACTURE[to]}
                </button>
              ))}
            </div>
            {transErreur && <p role="alert">{transErreur}</p>}
          </ListPanel>
        </div>
      )}

      {d && peutEncaisser && d.statut === 'EMISE' && Number(d.solde) > 0 && (
        <div className="no-print">
          <ListPanel title="Encaissement (crédit 411)">
            <form className="form-grid" onSubmit={onEncaisser}>
              <div>
                <label htmlFor="fac-enc-montant">Montant</label>
                <input
                  id="fac-enc-montant"
                  type="number"
                  min={1}
                  step="1"
                  value={encMontant}
                  onChange={(e) => setEncMontant(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="fac-enc-mode">Mode</label>
                <select
                  id="fac-enc-mode"
                  value={encMode}
                  onChange={(e) => setEncMode(e.target.value)}
                >
                  {Object.entries(MODE_ENCAISSEMENT).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="fac-enc-ref">Référence</label>
                <input
                  id="fac-enc-ref"
                  value={encRef}
                  onChange={(e) => setEncRef(e.target.value)}
                  placeholder="N° virement…"
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={encMut.isPending}
              >
                {encMut.isPending ? 'Enregistrement…' : 'Encaisser'}
              </button>
              {encErreur && <p role="alert">{encErreur}</p>}
            </form>
          </ListPanel>
        </div>
      )}

      {d && (
        <article className="devis-doc devis-print-root">
          <header className="devis-doc-top">
            <div className="devis-doc-brand">
              <p className="devis-doc-enseigne">
                {societe?.raisonSociale ?? 'MAJOR AUTO PARTS'}
              </p>
              {societe?.adresse && (
                <p className="devis-doc-meta">{societe.adresse}</p>
              )}
            </div>
            <div className="devis-doc-title-block">
              <p className="devis-doc-kicker">Pièce commerciale</p>
              <h1 className="devis-doc-title">FACTURE</h1>
              <p className="devis-doc-numero">{d.numero}</p>
              <p className="devis-doc-statut">
                <span className={badgeFacture(d.statut)}>
                  {STATUT_FACTURE[d.statut]}
                </span>
              </p>
            </div>
          </header>

          <p className="lead">
            Client : <strong>{libelleClient(d.client)}</strong>
            {d.devis && (
              <>
                {' · '}
                Devis{' '}
                <Link to={`/ventes/devis/${d.devis.id}`}>{d.devis.numero}</Link>
              </>
            )}
            {d.boutique && <> · {d.boutique.nom}</>}
          </p>
          <p className="lead">
            HT {formatFcfa(d.montantHt)} · TVA {formatFcfa(d.montantTva)} · TTC{' '}
            {formatFcfa(d.montantTtc)}
            {' · '}
            Solde {formatFcfa(d.solde)}{' '}
            <InfoTooltip insight={insightFactureSolde(d.solde, d.montantTtc)} />
          </p>

          <table>
            <thead>
              <tr>
                <th>Désignation</th>
                <th className="num">Qté</th>
                <th className="num">P.U. HT</th>
                <th className="num">TVA %</th>
                <th className="num">HT</th>
                <th className="num">TTC</th>
              </tr>
            </thead>
            <tbody>
              {d.lignes.map((l) => (
                <tr key={l.id}>
                  <td>{l.designation}</td>
                  <td className="num">{l.quantite}</td>
                  <td className="num">{formatFcfa(l.prixUnitaire)}</td>
                  <td className="num">{Number(l.tauxTva)} %</td>
                  <td className="num">{formatFcfa(l.montantHt)}</td>
                  <td className="num">{formatFcfa(l.montantTtc)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {d.paiements.length > 0 && (
            <>
              <h2>Encaissements</h2>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Référence</th>
                    <th className="num">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {d.paiements.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.datePaiement).toLocaleDateString('fr-FR')}</td>
                      <td>{MODE_ENCAISSEMENT[p.mode] ?? p.mode}</td>
                      <td>{p.reference ?? '—'}</td>
                      <td className="num">{formatFcfa(p.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {d.notes && (
            <p className="lead" style={{ marginTop: 16 }}>
              {d.notes}
            </p>
          )}
        </article>
      )}
    </div>
  );
}
