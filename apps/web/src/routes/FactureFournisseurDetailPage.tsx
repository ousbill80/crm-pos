import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  FileText,
  History,
  LayoutDashboard,
  Warehouse,
} from 'lucide-react';
import { ModePaiementFournisseur } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { SensitiveActionModal } from '../components/SensitiveActionModal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  badgeFacture,
  badgeRapprochement,
  fmtDate,
  fmtDateHeure,
  fmtFcfa,
  MODE_PAIEMENT_FOURN,
  STATUT_FACTURE,
  STATUT_RAPPROCHEMENT,
} from '../lib/achats-ui';
import type { FactureFournisseurDto } from '../lib/types';
import { hasP2pRole, operationId } from '../lib/p2p';

type Onglet = 'apercu' | 'lignes' | 'receptions' | 'reglements' | 'historique';

const ONGLET_IDS: Onglet[] = ['apercu', 'lignes', 'receptions', 'reglements', 'historique'];

function parseOnglet(value: string | null): Onglet {
  return ONGLET_IDS.includes(value as Onglet) ? (value as Onglet) : 'apercu';
}

export function FactureFournisseurDetailPage() {
  const { factureId } = useParams<{ factureId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = hasP2pRole(user?.role, 'lectureAchats');
  const peutFacturer = hasP2pRole(user?.role, 'comptabiliteEcriture');
  const peutPayer =
    hasP2pRole(user?.role, 'comptabiliteEcriture') ||
    hasP2pRole(user?.role, 'paiementApprobation') ||
    hasP2pRole(user?.role, 'paiementExecution');

  const onglet = parseOnglet(searchParams.get('onglet'));
  const [modalPaiement, setModalPaiement] = useState(false);
  const [modalComptabilisation, setModalComptabilisation] = useState(false);
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
    void queryClient.invalidateQueries({ queryKey: ['achats-commandes'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
  }

  function aller(id: Onglet) {
    const next = new URLSearchParams(searchParams);
    if (id === 'apercu') next.delete('onglet');
    else next.set('onglet', id);
    setSearchParams(next, { replace: true });
  }

  function ouvrirPaiement() {
    navigate('/finance/comptabilite');
  }

  const comptabiliser = useMutation({
    mutationFn: (challengeId: string) =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${factureId}/comptabiliser`, {
        method: 'POST',
        body: JSON.stringify({ clientOperationId: operationId(), challengeId }),
      }),
    onSuccess: () => {
      setModalComptabilisation(false);
      invalider();
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Comptabilisation refusée.')),
  });
  const annuler = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${factureId}/annuler`, {
        method: 'POST',
        body: JSON.stringify({
          clientOperationId: operationId(),
          motif: 'Compensation demandée depuis la fiche facture',
          referenceFournisseur: `AV-${detail.data?.referenceFournisseur ?? detail.data?.numero ?? factureId}`,
        }),
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
  const estP2p = Boolean(f.clientOperationId);
  const rapprochementOk =
    f.statutRapprochement === 'RAPPROCHEE' || f.statutRapprochement === 'EXCEPTEE';
  const peutComptabiliser =
    peutFacturer && f.statut === 'BROUILLON' && rapprochementOk;
  const encours =
    f.statut === 'COMPTABILISEE' || f.statut === 'PARTIELLEMENT_PAYEE';
  const montantAffiche = f.netAPayer ?? f.totalTtc ?? f.montant;
  const montantNum = Number(montantAffiche);
  const payeNum = Number(f.montantPaye);
  const pctPaye =
    montantNum > 0 ? Math.min(100, Math.round((payeNum / montantNum) * 100)) : 0;

  const tabs: Array<{ id: Onglet; label: string; icon: typeof LayoutDashboard; count?: number }> = [
    { id: 'apercu', label: 'Vue d’ensemble', icon: LayoutDashboard },
    { id: 'lignes', label: 'Lignes', icon: FileText, count: f.lignes.length },
    { id: 'receptions', label: 'Réceptions', icon: Warehouse, count: f.lignes.length },
    { id: 'reglements', label: 'Règlements', icon: Banknote, count: f.paiements.length },
    { id: 'historique', label: 'Historique', icon: History },
  ];

  const historique: Array<{ at: string; label: string; detail?: string }> = [
    {
      at: f.dateFacture,
      label: 'Facture créée (brouillon Achats)',
      detail: f.createur ? `${f.createur.prenom} ${f.createur.nom}` : undefined,
    },
  ];
  if (f.statut !== 'BROUILLON' && f.statut !== 'ANNULEE') {
    historique.push({
      at: f.dateFacture,
      label: 'Comptabilisée (DAF / SI)',
      detail: 'Ouverture du reste à payer — grand livre Achats',
    });
  }
  for (const p of f.paiements) {
    historique.push({
      at: p.datePaiement,
      label: `Règlement ${fmtFcfa(p.montant)}`,
      detail: `${MODE_PAIEMENT_FOURN[p.mode] ?? p.mode}${p.reference ? ` · ${p.reference}` : ''}`,
    });
  }
  if (f.statut === 'PAYEE') {
    historique.push({
      at: f.paiements.at(-1)?.datePaiement ?? f.dateFacture,
      label: 'Soldée',
      detail: '100 % payé',
    });
  }
  if (f.statut === 'ANNULEE') {
    historique.push({ at: f.dateFacture, label: 'Facture annulée' });
  }

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
          {peutComptabiliser && (
            <>
              <button type="button" className="btn-primary" onClick={() => setModalComptabilisation(true)}>
                Comptabiliser (SYSCOHADA)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Créer un avoir compensatoire intégral pour cette facture ?')) {
                    annuler.mutate();
                  }
                }}
              >
                Créer un avoir compensatoire
              </button>
            </>
          )}
          {peutFacturer &&
            estP2p &&
            f.statut === 'BROUILLON' &&
            f.statutRapprochement === 'LITIGE' && (
              <Link className="btn-secondary" to="/finance/comptabilite">
                Litige — ouvrir la compta
              </Link>
            )}
          {peutPayer && encours && (
            <button type="button" className="btn-primary" onClick={ouvrirPaiement}>
              Préparer / suivre le paiement
            </button>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          FA
        </div>
        <div className="client-workspace-hero-main">
          <h1>
            {f.numero}{' '}
            <InfoTooltip
              insight={{
                title: 'Circuit Achats',
                interpretation:
                  'Réceptions → facture → comptabilisation DAF → paiements (DAF / Caissier Central). Aucun débit de caisse boutique.',
                severity: 'info',
              }}
            />
          </h1>
          <p className="client-workspace-hero-sub">
            <Link to={`/fournisseurs/${f.fournisseurId}`}>{f.fournisseur.nom}</Link>
            {f.referenceFournisseur ? ` · n° fournisseur ${f.referenceFournisseur}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={badgeFacture(f.statut)}>{STATUT_FACTURE[f.statut]}</span>
            {f.statutRapprochement ? (
              <span className={badgeRapprochement(f.statutRapprochement)}>
                {STATUT_RAPPROCHEMENT[f.statutRapprochement] ?? f.statutRapprochement}
              </span>
            ) : null}
            {estP2p ? <span className="badge">P2P</span> : null}
            <span className="badge">{pctPaye} % payé</span>
          </div>
          <div className="inventaire-progress" aria-label={`Paiement ${pctPaye} %`} style={{ maxWidth: 280, marginTop: 8 }}>
            <span style={{ width: `${pctPaye}%` }} />
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Date</strong> {fmtDate(f.dateFacture)}
            </span>
            <span>
              <strong>Échéance</strong> {fmtDate(f.dateEcheance)}
            </span>
          </div>
        </div>
      </header>

      {formErr && <p role="alert">{formErr}</p>}

      <nav className="client-workspace-tabs" aria-label="Sections facture fournisseur">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={onglet === tab.id ? 'actif' : undefined}
            onClick={() => aller(tab.id)}
          >
            <tab.icon size={14} aria-hidden />
            {tab.label}
            {tab.count !== undefined ? <span className="fiche-tab-count">{tab.count}</span> : null}
          </button>
        ))}
      </nav>

      <section className="client-workspace-panel">
        {onglet === 'apercu' && (
          <div className="client-workspace-section">
            <div className="client-kpi-grid">
              <button type="button" className="client-kpi-card" onClick={() => aller('lignes')}>
                <div className="client-kpi-label">
                  Montant <InfoTooltip insight={{ title: 'TTC facture', interpretation: 'Somme des réceptions rattachées.', severity: 'info' }} />
                </div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(montantAffiche)}
                </div>
                <div className="client-kpi-hint">
                  {f.lignes.length} ligne(s)
                  {f.netAPayer ? ' · net à payer' : ''}
                </div>
              </button>
              <button
                type="button"
                className="client-kpi-card"
                onClick={() => aller('reglements')}
              >
                <div className="client-kpi-label">Payé ({pctPaye} %)</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(f.montantPaye)}
                </div>
                <div className="client-kpi-hint">{f.paiements.length} règlement(s)</div>
              </button>
              <button
                type="button"
                className={`client-kpi-card${Number(f.resteAPayer) > 0 ? ' kpi-actif' : ''}`}
                onClick={() => {
                  aller('reglements');
                  if (peutPayer && encours) ouvrirPaiement();
                }}
              >
                <div className="client-kpi-label">Reste à payer</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(f.resteAPayer)}
                </div>
                <div className="client-kpi-hint">
                  {peutPayer && encours ? 'Ouvrir le circuit de paiement contrôlé' : 'Grand livre Achats'}
                </div>
              </button>
            </div>

            {f.notes ? <p className="kpi-hint">{f.notes}</p> : null}

            <h2>Chronologie</h2>
            <ol className="fiche-timeline">
              {historique.map((evt, i) => (
                <li key={`${evt.label}-${i}`}>
                  <time dateTime={evt.at}>{fmtDateHeure(evt.at)}</time>
                  <strong>{evt.label}</strong>
                  {evt.detail ? <span>{evt.detail}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        )}

        {onglet === 'lignes' && (
          <div className="client-workspace-section">
            <h2>Lignes</h2>
            <div className="clients-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Qté</th>
                    <th>Prix</th>
                    <th>Montant</th>
                    <th>BC</th>
                    <th>BL</th>
                  </tr>
                </thead>
                <tbody>
                  {f.lignes.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.produit ? (
                          <>
                            <Link className="link-button" to={`/produits/${l.produit.id}`}>
                              {l.produit.designation}
                            </Link>
                            {l.produit.reference ? (
                              <div className="kpi-hint" style={{ margin: 0 }}>
                                {l.produit.reference}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{l.quantite}</td>
                      <td className="money">{fmtFcfa(l.prixUnitaire)}</td>
                      <td className="money">{fmtFcfa(l.montant)}</td>
                      <td>
                        {l.commande ? (
                          <Link to={`/achats/commandes/${l.commande.id}`}>{l.commande.numero}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{l.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === 'receptions' && (
          <div className="client-workspace-section">
            <h2>Réceptions facturées</h2>
            <div className="clients-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Article</th>
                    <th>Qté</th>
                    <th>BL</th>
                    <th>Commande</th>
                  </tr>
                </thead>
                <tbody>
                  {f.lignes.map((l) => (
                    <tr key={l.id}>
                      <td>{fmtDateHeure(l.dateReception)}</td>
                      <td>
                        {l.produit ? (
                          <Link className="link-button" to={`/produits/${l.produit.id}`}>
                            {l.produit.designation}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{l.quantite}</td>
                      <td>{l.reference ?? '—'}</td>
                      <td>
                        {l.commande ? (
                          <Link to={`/achats/commandes/${l.commande.id}`}>{l.commande.numero}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === 'reglements' && (
          <div className="client-workspace-section">
            <h2>Règlements</h2>
            {peutPayer && encours && (
              <p className="table-actions">
                <button type="button" className="btn-primary" onClick={ouvrirPaiement}>
                  Enregistrer un paiement
                </button>
              </p>
            )}
            {f.paiements.length === 0 ? (
              <p className="lead">
                Aucun règlement.{' '}
                {encours
                  ? 'DAF / Caissier Central enregistrent le paiement sur le grand livre Achats.'
                  : f.statut === 'BROUILLON'
                    ? 'Comptabiliser la facture avant de payer.'
                    : null}
              </p>
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Mode</th>
                      <th>Montant</th>
                      <th>Réf.</th>
                      <th>Opérateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.paiements.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDateHeure(p.datePaiement)}</td>
                        <td>{MODE_PAIEMENT_FOURN[p.mode] ?? p.mode}</td>
                        <td className="money">{fmtFcfa(p.montant)}</td>
                        <td>{p.reference ?? '—'}</td>
                        <td>
                          {p.utilisateur
                            ? `${p.utilisateur.prenom} ${p.utilisateur.nom}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {onglet === 'historique' && (
          <div className="client-workspace-section">
            <h2>Historique</h2>
            <ol className="fiche-timeline">
              {historique.map((evt, i) => (
                <li key={`${evt.label}-${i}`}>
                  <time dateTime={evt.at}>{fmtDateHeure(evt.at)}</time>
                  <strong>{evt.label}</strong>
                  {evt.detail ? <span>{evt.detail}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <SensitiveActionModal
        open={modalComptabilisation}
        title="Confirmer la comptabilisation"
        description={`La facture ${f.numero} sera inscrite au grand livre SYSCOHADA (écritures équilibrées append-only).`}
        purpose="P2P_INVOICE_POST"
        confirmLabel="Ré-authentifier et comptabiliser"
        onClose={() => setModalComptabilisation(false)}
        onConfirm={(challengeId) => comptabiliser.mutateAsync(challengeId)}
      />

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
