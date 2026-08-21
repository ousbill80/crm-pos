import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModePaiementFournisseur, RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type { FactureFournisseurDto } from '../lib/types';

const ROLES_LECTURE: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const ROLES_FACTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

const ROLES_PAIEMENT: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
];

const STATUT: Record<FactureFournisseurDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  COMPTABILISEE: 'Comptabilisée',
  PARTIELLEMENT_PAYEE: 'Partiellement payée',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};

function badge(statut: FactureFournisseurDto['statut']) {
  if (statut === 'PAYEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_PAYEE' || statut === 'COMPTABILISEE') {
    return 'badge badge-warning';
  }
  if (statut === 'ANNULEE') return 'badge badge-neutral';
  return 'badge';
}

function fmt(n: string | number) {
  return Math.round(Number(n)).toLocaleString('fr-FR');
}

export function FactureFournisseurDetailPage() {
  const { factureId } = useParams<{ factureId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutFacturer = user !== null && ROLES_FACTURE.includes(user.role);
  const peutPayer = user !== null && ROLES_PAIEMENT.includes(user.role);

  const [modalPaiement, setModalPaiement] = useState(false);
  const [montantPaye, setMontantPaye] = useState('');
  const [mode, setMode] = useState<ModePaiementFournisseur>('VIREMENT');
  const [refPaiement, setRefPaiement] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['achats-factures', factureId],
    queryFn: () => apiFetch<FactureFournisseurDto>(`/achats/factures/${factureId}`),
    enabled: peutLire && Boolean(factureId),
  });

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['achats-factures'] });
    void queryClient.invalidateQueries({ queryKey: ['achats-a-facturer'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
  }

  const comptabiliser = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${factureId}/comptabiliser`, {
        method: 'POST',
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Comptabilisation refusée.')),
  });
  const annuler = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${factureId}/annuler`, {
        method: 'POST',
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Annulation refusée.')),
  });
  const payer = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${factureId}/paiements`, {
        method: 'POST',
        body: JSON.stringify({
          montant: Number(montantPaye),
          mode,
          reference: refPaiement.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setModalPaiement(false);
      setFormErr(null);
      invalider();
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Paiement refusé.')),
  });

  if (!factureId) return <p role="alert">Facture introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux factures fournisseur.</p>;
  if (detail.isLoading) return <LoadingState label="Chargement de la facture..." />;
  if (detail.isError || !detail.data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/achats/factures')}>
          ← Factures
        </button>
        <p role="alert">Impossible de charger cette facture.</p>
      </div>
    );
  }

  const f = detail.data;

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/achats/factures')}>
          ← Factures
        </button>
        <div className="client-workspace-toolbar-actions">
          <Link to={`/fournisseurs/${f.fournisseurId}`} className="stock-row-link">
            Fiche fournisseur
          </Link>
          {peutFacturer && f.statut === 'BROUILLON' && (
            <>
              <button type="button" className="btn-primary" onClick={() => comptabiliser.mutate()}>
                Comptabiliser
              </button>
              <button type="button" onClick={() => annuler.mutate()}>
                Annuler le brouillon
              </button>
            </>
          )}
          {peutPayer &&
            (f.statut === 'COMPTABILISEE' || f.statut === 'PARTIELLEMENT_PAYEE') && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setMontantPaye(f.resteAPayer);
                  setMode('VIREMENT');
                  setRefPaiement('');
                  setFormErr(null);
                  setModalPaiement(true);
                }}
              >
                Enregistrer un paiement
              </button>
            )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          FA
        </div>
        <div className="client-workspace-hero-main">
          <h1>{f.numero}</h1>
          <p className="client-workspace-hero-sub">
            {f.fournisseur.nom}
            {f.referenceFournisseur ? ` · n° fournisseur ${f.referenceFournisseur}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={badge(f.statut)}>{STATUT[f.statut]}</span>
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Date</strong> {new Date(f.dateFacture).toLocaleDateString('fr-FR')}
            </span>
            <span>
              <strong>Échéance</strong>{' '}
              {f.dateEcheance
                ? new Date(f.dateEcheance).toLocaleDateString('fr-FR')
                : '—'}
            </span>
          </div>
        </div>
      </header>

      {f.notes && <p>{f.notes}</p>}
      {formErr && <p role="alert">{formErr}</p>}
      <p className="lead">
        Le paiement est un grand livre Achats (DAF / Caissier Central) — il ne
        débite pas une caisse boutique.
      </p>

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">Montant</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {fmt(f.montant)} FCFA
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Payé</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {fmt(f.montantPaye)} FCFA
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Reste à payer</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {fmt(f.resteAPayer)} FCFA
          </div>
        </article>
      </div>

      <section className="client-workspace-section">
        <h2>Lignes</h2>
        <div className="clients-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Qté</th>
                <th>Prix</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {f.lignes.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link className="link-button" to={`/produits/${l.produit.id}`}>
                      {l.produit.designation}
                    </Link>
                    {l.produit.reference ? (
                      <div className="kpi-hint" style={{ margin: 0 }}>
                        {l.produit.reference}
                      </div>
                    ) : null}
                  </td>
                  <td>{l.quantite}</td>
                  <td className="money">{fmt(l.prixUnitaire)}</td>
                  <td className="money">{fmt(l.montant)} FCFA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {f.paiements.length > 0 && (
        <section className="client-workspace-section">
          <h2>Règlements</h2>
          <div className="clients-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Mode</th>
                  <th>Montant</th>
                  <th>Réf.</th>
                </tr>
              </thead>
              <tbody>
                {f.paiements.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.datePaiement).toLocaleString('fr-FR')}</td>
                    <td>{p.mode}</td>
                    <td className="money">{fmt(p.montant)} FCFA</td>
                    <td>{p.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {peutPayer && (
        <Modal
          open={modalPaiement}
          onClose={() => setModalPaiement(false)}
          title="Enregistrer un paiement"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              payer.mutate();
            }}
          >
            <p className="lead">N’écrit pas sur une caisse boutique.</p>
            <label htmlFor="pay-mt">Montant</label>
            <input
              id="pay-mt"
              type="number"
              min="0.01"
              step="0.01"
              value={montantPaye}
              onChange={(e) => setMontantPaye(e.target.value)}
              required
            />
            <label htmlFor="pay-mode">Mode</label>
            <select
              id="pay-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as ModePaiementFournisseur)}
            >
              <option value="VIREMENT">Virement</option>
              <option value="ESPECES">Espèces</option>
              <option value="MOBILE_MONEY">Mobile money</option>
            </select>
            <label htmlFor="pay-ref">Référence</label>
            <input
              id="pay-ref"
              value={refPaiement}
              onChange={(e) => setRefPaiement(e.target.value)}
            />
            {formErr && <p role="alert">{formErr}</p>}
            <div className="table-actions">
              <button type="button" className="btn-ghost" onClick={() => setModalPaiement(false)}>
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={payer.isPending}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
