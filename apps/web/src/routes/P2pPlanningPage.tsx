import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardList, Search, ShoppingCart, Sparkles } from 'lucide-react';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { fmtDate, fmtFcfa } from '../lib/achats-ui';
import {
  hasP2pRole,
  operationId,
  p2pApi,
  type ComparaisonOffres,
  type DemandeAchat,
} from '../lib/p2p';
import type { EntrepotDto, ProduitDto } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ListPanel, PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';

type Action = { demande: DemandeAchat; type: 'rejeter' | 'annuler' } | null;

const STATUT: Record<string, string> = {
  BROUILLON: 'Brouillon',
  SOUMISE: 'Soumise',
  APPROUVEE: 'Approuvée',
  REJETEE: 'Rejetée',
  CONVERTIE: 'Convertie',
  ANNULEE: 'Annulée',
};

export function P2pPlanningPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const peutLire = hasP2pRole(user?.role, 'lectureAchats');
  const peutEcrire = hasP2pRole(user?.role, 'demandeEcriture');
  const peutApprouver = hasP2pRole(user?.role, 'demandeApprobation');
  const peutSourcer = hasP2pRole(user?.role, 'sourcing');
  const [filtre, setFiltre] = useState('');
  const [recherche, setRecherche] = useState('');
  const [nouveau, setNouveau] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [entrepotId, setEntrepotId] = useState('');
  const [fenetre, setFenetre] = useState(30);
  const [consultationId, setConsultationId] = useState('');

  const demandes = useQuery({
    queryKey: ['p2p-demandes'],
    queryFn: p2pApi.demandes,
    enabled: peutLire,
  });
  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const recommandations = useQuery({
    queryKey: ['p2p-recommandations', entrepotId, fenetre],
    queryFn: () => p2pApi.recommandations(entrepotId, fenetre),
    enabled: peutLire && Boolean(entrepotId),
  });
  const comparaison = useQuery({
    queryKey: ['p2p-comparaison', consultationId],
    queryFn: () => p2pApi.comparaison(consultationId),
    enabled: peutLire && Boolean(consultationId),
  });

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (demandes.data ?? []).filter((row) => {
      if (filtre && row.statut !== filtre) return false;
      return !q || `${row.numero} ${row.objet} ${row.initiateur.prenom} ${row.initiateur.nom}`
        .toLowerCase().includes(q);
    });
  }, [demandes.data, filtre, recherche]);

  const mutationAction = useMutation({
    mutationFn: (input: { id: string; type: 'soumettre' | 'approuver' | 'rejeter' | 'annuler'; motif?: string }) =>
      p2pApi.actionDemande(input.id, input.type, input.motif),
    onSuccess: () => {
      setAction(null);
      setMotif('');
      setErreur(null);
      void client.invalidateQueries({ queryKey: ['p2p-demandes'] });
    },
    onError: (error) => setErreur(messageDepuisApi(error, 'Action refusée.')),
  });

  if (!peutLire) return <p role="alert">Vous n’avez pas accès au planning achats.</p>;

  return (
    <div className="p2p-module">
      <PageHeader
        title="Planning & sourcing achats"
        subtitle="Besoins budgétés, recommandations calculées sur les données réelles et comparaison du coût rendu."
        actions={
          <>
            <Link className="btn btn-secondary" to="/achats/commandes">Commandes</Link>
            {peutEcrire && (
              <button className="btn-primary" type="button" onClick={() => setNouveau(true)}>
                Nouvelle demande
              </button>
            )}
          </>
        }
      />

      <nav className="p2p-subnav" aria-label="Cycle procure-to-pay">
        <a href="#demandes">Demandes</a>
        <a href="#recommandations">Recommandations</a>
        <a href="#sourcing">Sourcing</a>
      </nav>

      {demandes.isLoading && <LoadingState label="Chargement des demandes…" />}
      {demandes.isError && <p role="alert">Impossible de charger les demandes.</p>}
      {demandes.data && (
        <>
          <section className="kpi-grid dash-kpi-grid" aria-label="Synthèse des demandes">
            {[
              ['Brouillons', 'BROUILLON', ClipboardList],
              ['À approuver', 'SOUMISE', Search],
              ['Approuvées', 'APPROUVEE', ShoppingCart],
              ['Rejetées', 'REJETEE', Sparkles],
            ].map(([label, status, Icon]) => (
              <button
                key={String(status)}
                type="button"
                className={`kpi-card dash-kpi${filtre === status ? ' kpi-actif' : ''}`}
                onClick={() => setFiltre(filtre === status ? '' : String(status))}
              >
                <div className="dash-kpi-top"><span className="dash-kpi-icon"><Icon size={16} /></span></div>
                <div className="kpi-label">{String(label)}</div>
                <div className="kpi-value">{demandes.data.filter((d) => d.statut === status).length}</div>
                <div className="kpi-hint">Cliquer pour filtrer</div>
              </button>
            ))}
          </section>

          <section id="demandes">
            <div className="toolbar p2p-toolbar">
              <label className="p2p-search">
                <span className="sr-only">Rechercher</span>
                <Search size={15} />
                <input
                  type="search"
                  value={recherche}
                  onChange={(event) => setRecherche(event.target.value)}
                  placeholder="N°, objet, demandeur…"
                />
              </label>
              <label>
                Statut
                <select value={filtre} onChange={(event) => setFiltre(event.target.value)}>
                  <option value="">Tous</option>
                  {Object.entries(STATUT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <ListPanel title={`Demandes d’achat · ${liste.length}`}>
              {liste.length === 0 ? (
                <EmptyState title="Aucune demande" description="Aucune demande ne correspond au filtre actif." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Demande</th><th>Centre / budget</th><th>Statut</th><th>Montant</th><th>Besoin</th><th>Actions</th></tr></thead>
                    <tbody>
                      {liste.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.numero}</strong>
                            <div>{row.objet}</div>
                            <small>{row.initiateur.prenom} {row.initiateur.nom} · {fmtDate(row.dateCreation)}</small>
                          </td>
                          <td>{row.centreCout ? `${row.centreCout.code} · ${row.centreCout.libelle}` : '—'}<small>{row.budget?.libelle ?? 'Budget non exposé'}</small></td>
                          <td><span className={row.statut === 'APPROUVEE' ? 'badge badge-ok' : row.statut === 'SOUMISE' ? 'badge badge-warning' : 'badge'}>{STATUT[row.statut] ?? row.statut}</span></td>
                          <td className="money">{row.montantEstime ? `${fmtFcfa(row.montantEstime)} · ${row.devise}` : 'À chiffrer'}</td>
                          <td>{row.lignes.length} ligne(s)<small>{row.boutique?.nom ?? 'Réseau'}</small></td>
                          <td>
                            <div className="table-actions">
                              {peutEcrire && row.statut === 'BROUILLON' && (
                                <button type="button" onClick={() => mutationAction.mutate({ id: row.id, type: 'soumettre' })}>Soumettre</button>
                              )}
                              {peutApprouver && row.statut === 'SOUMISE' && (
                                <>
                                  <button className="btn-primary" type="button" onClick={() => mutationAction.mutate({ id: row.id, type: 'approuver' })}>Approuver</button>
                                  <button type="button" onClick={() => { setAction({ demande: row, type: 'rejeter' }); setMotif(''); }}>Rejeter</button>
                                </>
                              )}
                              {peutEcrire && ['BROUILLON', 'SOUMISE', 'APPROUVEE'].includes(row.statut) && (
                                <button type="button" onClick={() => { setAction({ demande: row, type: 'annuler' }); setMotif(''); }}>Annuler</button>
                              )}
                              {row.consultations.map((item) => (
                                <button key={item.id} type="button" onClick={() => setConsultationId(item.id)}>{item.numero}</button>
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
          </section>
        </>
      )}

      <section id="recommandations" className="panel p2p-section">
        <div className="dash-panel-head">
          <div><h2>Recommandations de réapprovisionnement</h2><p className="lead">Ventes nettes, stock réservé, transit et délais fournisseur observés.</p></div>
          <div className="p2p-inline-fields">
            <label>Entrepôt
              <select value={entrepotId} onChange={(event) => setEntrepotId(event.target.value)}>
                <option value="">Sélectionner…</option>
                {(entrepots.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} — {e.nom}</option>)}
              </select>
            </label>
            <label>Fenêtre
              <select value={fenetre} onChange={(event) => setFenetre(Number(event.target.value))}>
                <option value={30}>30 jours</option><option value={60}>60 jours</option><option value={90}>90 jours</option>
              </select>
            </label>
          </div>
        </div>
        {recommandations.isLoading && <LoadingState label="Calcul des recommandations…" />}
        {recommandations.isError && <p role="alert">Le calcul des recommandations a échoué.</p>}
        {!entrepotId && <EmptyState title="Choisissez un entrepôt" description="Le calcul est lancé contre les stocks et ventes réels." />}
        {recommandations.data && recommandations.data.recommandations.length === 0 && <EmptyState title="Aucune règle de réapprovisionnement" description="Aucune recommandation ne peut être calculée pour cet entrepôt." />}
        {recommandations.data && recommandations.data.recommandations.length > 0 && (
          <div className="p2p-card-grid">
            {recommandations.data.recommandations.map((item) => {
              const best = item.historiqueFournisseurs[0];
              return (
                <article className="p2p-card" key={item.produit.id}>
                  <h3>{item.produit.designation}</h3>
                  <p>{item.donneesReelles.stockCourant} en stock · {item.donneesReelles.stockReserve} réservé · {item.donneesReelles.stockEnTransit} en transit</p>
                  {item.calculable && best ? (
                    <>
                      <strong>{Number(best.recommandation.quantiteSuggeree ?? 0)} unité(s) suggérée(s)</strong>
                      <small>{best.fournisseur} · délai moyen {best.delaiMoyenJours} j · {best.receptionsObservees} réception(s)</small>
                    </>
                  ) : <p className="p2p-muted">{item.raisonNonCalculable}</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="sourcing" className="panel p2p-section">
        <div className="dash-panel-head">
          <div><h2>Comparaison des offres</h2><p className="lead">Coût rendu total puis délai de livraison, sans taux de change inventé.</p></div>
          <label>Consultation
            <select value={consultationId} onChange={(event) => setConsultationId(event.target.value)}>
              <option value="">Sélectionner…</option>
              {(demandes.data ?? []).flatMap((d) => d.consultations.map((c) => (
                <option key={c.id} value={c.id}>{c.numero} — {d.objet}</option>
              )))}
            </select>
          </label>
        </div>
        {!consultationId && <EmptyState title="Aucune consultation sélectionnée" description={peutSourcer ? 'Créez une consultation depuis une demande soumise ou approuvée.' : 'Sélectionnez une consultation existante.'} />}
        {comparaison.isLoading && <LoadingState label="Comparaison des offres…" />}
        {comparaison.isError && <p role="alert">Impossible de comparer cette consultation.</p>}
        {comparaison.data && <ComparaisonTable data={comparaison.data} />}
      </section>

      {nouveau && <CreateRequestModal onClose={() => setNouveau(false)} onCreated={() => { setNouveau(false); void client.invalidateQueries({ queryKey: ['p2p-demandes'] }); }} />}
      {action && (
        <Modal open title={`${action.type === 'rejeter' ? 'Rejeter' : 'Annuler'} ${action.demande.numero}`} onClose={() => setAction(null)}>
          <form onSubmit={(event) => { event.preventDefault(); mutationAction.mutate({ id: action.demande.id, type: action.type, motif }); }}>
            <label htmlFor="p2p-motif">Motif</label>
            <textarea id="p2p-motif" value={motif} onChange={(event) => setMotif(event.target.value)} required={action.type === 'rejeter'} />
            {erreur && <p role="alert">{erreur}</p>}
            <div className="table-actions">
              <button type="button" onClick={() => setAction(null)}>Retour</button>
              <button type="submit" className="btn-primary" disabled={mutationAction.isPending}>Confirmer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ComparaisonTable({ data }: { data: ComparaisonOffres }) {
  if (data.offres.length === 0) return <EmptyState title="Aucune offre" description="Les fournisseurs invités n’ont pas encore d’offre saisie." />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Rang</th><th>Fournisseur</th><th>Marchandises</th><th>Transport</th><th>Douane & taxes</th><th>Coût rendu</th><th>Délai</th></tr></thead>
        <tbody>{data.offres.map((offre) => (
          <tr key={offre.id} className={offre.rang === 1 ? 'p2p-best-row' : undefined}>
            <td><strong>#{offre.rang}</strong></td><td>{offre.fournisseur.nom}</td>
            <td className="money">{fmtFcfa(offre.sousTotalMarchandises)}</td>
            <td className="money">{fmtFcfa(Number(offre.transport) + Number(offre.assurance))}</td>
            <td className="money">{fmtFcfa(Number(offre.douane) + Number(offre.taxes) + Number(offre.autresCouts))}</td>
            <td className="money"><strong>{fmtFcfa(offre.totalLandedCost)}</strong></td><td>{offre.delaiLivraisonJours} j</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function CreateRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [objet, setObjet] = useState('');
  const [centreCoutId, setCentreCoutId] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [produitId, setProduitId] = useState('');
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [prix, setPrix] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const produits = useQuery({ queryKey: ['produits'], queryFn: () => apiFetch<ProduitDto[]>('/produits') });
  const centres = useQuery({ queryKey: ['p2p-centres-cout'], queryFn: () => p2pApi.centresCout() });
  const budgets = useQuery({
    queryKey: ['p2p-budgets', centreCoutId],
    queryFn: () => p2pApi.budgetsActifs(undefined, centreCoutId),
    enabled: Boolean(centreCoutId),
  });
  const creer = useMutation({
    mutationFn: () => apiFetch('/achats/demandes', {
      method: 'POST',
      body: JSON.stringify({
        clientOperationId: operationId(), objet, centreCoutId, budgetId, devise: 'XOF',
        lignes: [{ produitId: produitId || undefined, designation, quantite: Number(quantite), prixEstime: prix ? Number(prix) : undefined }],
      }),
    }),
    onSuccess: onCreated,
    onError: (error) => setErreur(messageDepuisApi(error, 'Création refusée.')),
  });
  function submit(event: FormEvent) { event.preventDefault(); creer.mutate(); }
  return (
    <Modal open title="Nouvelle demande d’achat" size="lg" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid-2">
          <label>Objet<input value={objet} onChange={(e) => setObjet(e.target.value)} required /></label>
          <label>Centre de coût
            <select value={centreCoutId} onChange={(e) => { setCentreCoutId(e.target.value); setBudgetId(''); }} required>
              <option value="">{centres.isLoading ? 'Chargement…' : 'Sélectionner…'}</option>
              {(centres.data ?? []).map((centre) => <option key={centre.id} value={centre.id}>{centre.code} · {centre.libelle}{centre.boutique ? ` · ${centre.boutique.nom}` : ''}</option>)}
            </select>
          </label>
          <label>Budget actif
            <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)} required disabled={!centreCoutId || budgets.isLoading}>
              <option value="">{budgets.isLoading ? 'Chargement…' : 'Sélectionner…'}</option>
              {(budgets.data ?? []).map((budget) => <option key={budget.id} value={budget.id}>{budget.libelle} · disponible {fmtFcfa(budget.montantDisponible)}</option>)}
            </select>
          </label>
          {(centres.isError || budgets.isError) && <p role="alert">Les référentiels centre de coût / budget n’ont pas pu être chargés.</p>}
          <label>Article
            <select value={produitId} onChange={(e) => {
              setProduitId(e.target.value);
              setDesignation(produits.data?.find((p) => p.id === e.target.value)?.designation ?? designation);
            }}>
              <option value="">Hors catalogue</option>
              {(produits.data ?? []).filter((p) => p.actif).map((p) => <option key={p.id} value={p.id}>{p.designation}</option>)}
            </select>
          </label>
          <label>Désignation<input value={designation} onChange={(e) => setDesignation(e.target.value)} required /></label>
          <label>Quantité<input type="number" min="1" value={quantite} onChange={(e) => setQuantite(e.target.value)} required /></label>
          <label>Prix estimé<input type="number" min="0.01" step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} /></label>
        </div>
        {erreur && <p role="alert">{erreur}</p>}
        <div className="table-actions"><button type="button" onClick={onClose}>Annuler</button><button className="btn-primary" type="submit" disabled={creer.isPending}>Créer le brouillon</button></div>
      </form>
    </Modal>
  );
}
