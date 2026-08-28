import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Warehouse,
} from 'lucide-react';
import { apiDownload, apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import {
  badgeCommande,
  badgeFacture,
  fmtDateHeure,
  fmtFcfa,
  STATUT_COMMANDE,
  STATUT_FACTURE,
} from '../lib/achats-ui';
import type { CommandeAchatDto, EntrepotDto } from '../lib/types';
import {
  peutRepartir,
  RepartitionHubModal,
} from '../components/RepartitionHubModal';
import { hasP2pRole, p2pApi } from '../lib/p2p';

type Onglet = 'apercu' | 'lignes' | 'import' | 'receptions' | 'factures' | 'historique';

const ONGLET_IDS: Onglet[] = ['apercu', 'lignes', 'import', 'receptions', 'factures', 'historique'];

function parseOnglet(value: string | null): Onglet {
  return ONGLET_IDS.includes(value as Onglet) ? (value as Onglet) : 'apercu';
}

export function CommandeAchatDetailPage() {
  const { commandeId } = useParams<{ commandeId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = hasP2pRole(user?.role, 'lectureAchats');
  const peutCommander = hasP2pRole(user?.role, 'commandeSaisie');
  const peutApprouver = hasP2pRole(user?.role, 'commandeApprobation');
  const peutRecevoir = hasP2pRole(user?.role, 'receptionStock');

  const onglet = parseOnglet(searchParams.get('onglet'));
  const [ligneReception, setLigneReception] = useState<string | null>(null);
  const [qtyRec, setQtyRec] = useState('1');
  const [prixRec, setPrixRec] = useState('');
  const [entrepotId, setEntrepotId] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [repartitionReceptionId, setRepartitionReceptionId] = useState<
    string | null
  >(null);

  const detail = useQuery({
    queryKey: ['achats-commandes', commandeId],
    queryFn: () => apiFetch<CommandeAchatDto>(`/achats/commandes/${commandeId}`),
    enabled: peutLire && Boolean(commandeId),
  });
  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutRecevoir,
  });
  const importDetail = useQuery({
    queryKey: ['achats-commandes-import', commandeId],
    queryFn: () => p2pApi.importCommande(commandeId!),
    enabled: peutLire && Boolean(commandeId),
  });

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['achats-commandes'] });
    void queryClient.invalidateQueries({ queryKey: ['achats-factures'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
  }

  function aller(id: Onglet) {
    const next = new URLSearchParams(searchParams);
    if (id === 'apercu') next.delete('onglet');
    else next.set('onglet', id);
    setSearchParams(next, { replace: true });
  }

  const soumettre = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>(`/achats/commandes/${commandeId}/soumettre`, {
        method: 'POST',
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Soumission refusée.')),
  });
  const approuver = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>(`/achats/commandes/${commandeId}/approuver`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Approbation refusée.')),
  });
  const confirmer = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>(`/achats/commandes/${commandeId}/confirmer`, {
        method: 'POST',
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Confirmation refusée.')),
  });
  const annuler = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>(`/achats/commandes/${commandeId}/annuler`, {
        method: 'POST',
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Annulation refusée.')),
  });
  const cloturer = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>(`/achats/commandes/${commandeId}/cloturer`, {
        method: 'POST',
      }),
    onSuccess: invalider,
    onError: (e) => setFormErr(messageDepuisApi(e, 'Clôture refusée.')),
  });
  const receptionner = useMutation({
    mutationFn: () => {
      const ligne = detail.data?.lignes.find((l) => l.id === ligneReception);
      return apiFetch(`/fournisseurs/${detail.data!.fournisseurId}/receptions`, {
        method: 'POST',
        body: JSON.stringify({
          produitId: ligne!.produitId,
          quantite: Number(qtyRec),
          prixAchat: Number(prixRec),
          ligneCommandeId: ligneReception,
          ...(entrepotId ? { entrepotId } : {}),
        }),
      });
    },
    onSuccess: () => {
      setLigneReception(null);
      setFormErr(null);
      invalider();
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Réception refusée.')),
  });

  if (!commandeId) return <p role="alert">Commande introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux commandes d’achat.</p>;
  if (detail.isLoading) return <LoadingState label="Chargement de la commande..." />;
  if (detail.isError || !detail.data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/achats/commandes')}>
          ← Commandes
        </button>
        <p role="alert">Impossible de charger cette commande.</p>
      </div>
    );
  }

  const c = detail.data;
  const receptions = c.receptions ?? [];
  const factures = c.factures ?? [];
  const nonFacturees = receptions.filter((r) => !r.facture);
  const pct = c.quantite === 0 ? 0 : Math.round((c.quantiteRecue / c.quantite) * 100);
  const peutReceptionnerLigne =
    peutRecevoir &&
    (c.statut === 'CONFIRMEE' || c.statut === 'PARTIELLEMENT_RECEPTIONNEE');
  const commandeGroupe = c.boutiqueId == null;
  const peutRepartirCommande =
    commandeGroupe &&
    receptions.length > 0 &&
    peutRepartir(user?.role);

  const tabs: Array<{ id: Onglet; label: string; icon: typeof LayoutDashboard; count?: number }> = [
    { id: 'apercu', label: 'Vue d’ensemble', icon: LayoutDashboard },
    { id: 'lignes', label: 'Lignes', icon: Package, count: c.lignes.length },
    { id: 'import', label: 'Import & douane', icon: Warehouse, count: importDetail.data?.expeditions.length },
    { id: 'receptions', label: 'Réceptions', icon: Warehouse, count: receptions.length },
    { id: 'factures', label: 'Factures', icon: FileText, count: factures.length },
    { id: 'historique', label: 'Historique', icon: History },
  ];

  const historique: Array<{ at: string | null; label: string; detail?: string }> = [
    {
      at: c.dateCommande,
      label: 'Brouillon créé',
      detail: c.initiateur ? `${c.initiateur.prenom} ${c.initiateur.nom}` : undefined,
    },
  ];
  if (c.dateConfirmation) {
    historique.push({ at: c.dateConfirmation, label: 'Commande confirmée' });
  }
  for (const r of receptions) {
    historique.push({
      at: r.dateReception,
      label: `Réception ${r.quantite} × ${r.produit.designation}`,
      detail: r.reference ? `BL ${r.reference}` : undefined,
    });
  }
  if (c.dateCloture) {
    historique.push({ at: c.dateCloture, label: 'Commande clôturée' });
  }
  if (c.statut === 'ANNULEE') {
    historique.push({ at: null, label: 'Commande annulée' });
  }

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/achats/commandes')}>
          ← Commandes
        </button>
        <div className="client-workspace-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              void apiDownload(
                `/achats/commandes/${c.id}/pdf`,
                `${c.proformaReference ? 'proforma' : 'bon-commande'}-${c.numero}.pdf`,
              )
            }
          >
            <Download size={14} /> Télécharger PDF
          </button>
          <Link to={`/fournisseurs/${c.fournisseurId}`} className="stock-row-link">
            Fiche fournisseur
          </Link>
          <Link
            to={`/achats/factures?fournisseurId=${c.fournisseurId}&ouvrir=1`}
            className="stock-row-link"
          >
            Facturer
          </Link>
          {peutCommander && c.statut === 'BROUILLON' && (
            <>
              <button type="button" className="btn-primary" onClick={() => soumettre.mutate()}>
                Soumettre
              </button>
              <button type="button" onClick={() => annuler.mutate()}>
                Annuler
              </button>
            </>
          )}
          {peutApprouver && c.statut === 'SOUMISE_APPROBATION' && (
            <button type="button" className="btn-primary" onClick={() => approuver.mutate()}>
              Approuver
            </button>
          )}
          {peutApprouver && c.statut === 'APPROUVEE' && (
            <button type="button" className="btn-primary" onClick={() => confirmer.mutate()}>
              Confirmer
            </button>
          )}
          {peutCommander && c.statut === 'CONFIRMEE' && c.quantiteRecue === 0 && (
            <button type="button" onClick={() => annuler.mutate()}>
              Annuler
            </button>
          )}
          {peutCommander && c.statut === 'RECEPTIONNEE' && (
            <button type="button" className="btn-primary" onClick={() => cloturer.mutate()}>
              Clôturer
            </button>
          )}
          {peutRepartirCommande && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setRepartitionReceptionId(receptions[0].id)}
            >
              Répartir vers boutiques
            </button>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          BC
        </div>
        <div className="client-workspace-hero-main">
          <h1>{c.numero}</h1>
          <p className="client-workspace-hero-sub">
            <Link to={`/fournisseurs/${c.fournisseurId}`}>{c.fournisseur.nom}</Link>
          </p>
          <div className="client-workspace-chips">
            <span className={badgeCommande(c.statut)}>{STATUT_COMMANDE[c.statut]}</span>
            {nonFacturees.length > 0 && (
              <span className="badge badge-warning">
                {nonFacturees.length} réception(s) à facturer
              </span>
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Commandé</strong> {fmtDateHeure(c.dateCommande)}
            </span>
            {c.initiateur && (
              <span>
                <strong>Par</strong> {c.initiateur.prenom} {c.initiateur.nom}
              </span>
            )}
            {c.boutique && (
              <span>
                <strong>Boutique</strong> {c.boutique.nom}
              </span>
            )}
            {!c.boutique && (
              <span>
                <strong>Périmètre</strong> Commande groupe → hub ENTREE
              </span>
            )}
          </div>
        </div>
      </header>

      {c.notes && <p>{c.notes}</p>}
      {formErr && <p role="alert">{formErr}</p>}

      <nav className="client-workspace-tabs" aria-label="Sections bon de commande">
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
                <div className="client-kpi-label">Montant</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(c.montant)}
                </div>
                <div className="client-kpi-hint">{c.lignes.length} ligne(s)</div>
              </button>
              <button type="button" className="client-kpi-card" onClick={() => aller('receptions')}>
                <div className="client-kpi-label">Réception</div>
                <div className="client-kpi-value">
                  {c.quantiteRecue}/{c.quantite}
                </div>
                <div className="client-kpi-hint">{pct} % reçu</div>
                <div className="inventaire-progress" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </button>
              <button
                type="button"
                className={`client-kpi-card${factures.length > 0 ? ' kpi-actif' : ''}`}
                onClick={() => aller('factures')}
              >
                <div className="client-kpi-label">Factures liées</div>
                <div className="client-kpi-value">{factures.length}</div>
                <div className="client-kpi-hint">
                  {nonFacturees.length > 0
                    ? `${nonFacturees.length} réception(s) hors facture`
                    : 'Toutes les réceptions facturées'}
                </div>
              </button>
            </div>
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
                    <th>Commandé</th>
                    <th>Reçu</th>
                    <th>Reste</th>
                    <th>Prix</th>
                    <th>Montant</th>
                    {peutReceptionnerLigne ? <th></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {c.lignes.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link className="link-button" to={`/produits/${l.produitId}`}>
                          {l.designation}
                        </Link>
                        {l.reference ? (
                          <div className="kpi-hint" style={{ margin: 0 }}>
                            {l.reference}
                          </div>
                        ) : null}
                      </td>
                      <td>{l.quantite}</td>
                      <td>{l.quantiteRecue}</td>
                      <td>{l.quantiteRestante}</td>
                      <td className="money">{fmtFcfa(l.prixUnitaire)}</td>
                      <td className="money">{fmtFcfa(l.montant)}</td>
                      {peutReceptionnerLigne ? (
                        <td>
                          {l.quantiteRestante > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setLigneReception(l.id);
                                setQtyRec(String(l.quantiteRestante));
                                setPrixRec(l.prixUnitaire);
                                setFormErr(null);
                              }}
                            >
                              Réceptionner
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === 'receptions' && (
          <div className="client-workspace-section">
            <h2>Réceptions</h2>
            {receptions.length === 0 ? (
              <p className="lead">
                Aucune réception. Seuls SI / Direction enregistrent l’entrée fournisseur au
                central.
              </p>
            ) : (
              <>
                {nonFacturees.length > 0 && (
                  <p className="lead">
                    {nonFacturees.length} réception(s) non facturée(s).{' '}
                    <Link to={`/achats/factures?fournisseurId=${c.fournisseurId}&ouvrir=1`}>
                      Facturer
                    </Link>
                  </p>
                )}
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Article</th>
                        <th>Qté</th>
                        <th>Prix</th>
                        <th>BL</th>
                        <th>Entrepôt</th>
                        <th>Opérateur</th>
                        <th>Facture</th>
                        {peutRepartirCommande ? <th></th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {receptions.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDateHeure(r.dateReception)}</td>
                          <td>
                            <Link className="link-button" to={`/produits/${r.produitId}`}>
                              {r.produit.designation}
                            </Link>
                          </td>
                          <td>{r.quantite}</td>
                          <td className="money">{fmtFcfa(r.prixAchat)}</td>
                          <td>{r.reference ?? '—'}</td>
                          <td>
                            {r.entrepot ? (
                              <Link
                                className="link-button"
                                to={`/stocks/entrepots/${r.entrepot.id}`}
                              >
                                {r.entrepot.nom}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {r.utilisateur
                              ? `${r.utilisateur.prenom} ${r.utilisateur.nom}`
                              : '—'}
                          </td>
                          <td>
                            {r.facture ? (
                              <Link to={`/achats/factures/${r.facture.id}`}>{r.facture.numero}</Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          {peutRepartirCommande ? (
                            <td>
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() => setRepartitionReceptionId(r.id)}
                              >
                                Répartir
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {onglet === 'import' && (
          <div className="client-workspace-section">
            <h2>Production, transport, douane & coût rendu</h2>
            {importDetail.isLoading && <LoadingState label="Chargement du dossier import…" />}
            {importDetail.isError && <p role="alert">Impossible de charger le dossier import.</p>}
            {importDetail.data && (
              <>
                <dl className="clients-dl">
                  <div><dt>Version</dt><dd>v{importDetail.data.versionCourante}</dd></div>
                  <div><dt>Devise</dt><dd>{importDetail.data.devise} · taux snapshot {importDetail.data.tauxChangeSnapshot ?? 'absent'}</dd></div>
                  <div><dt>Incoterm</dt><dd>{importDetail.data.incoterm ?? '—'}</dd></div>
                  <div><dt>Trajet</dt><dd>{importDetail.data.lieuOrigine ?? '—'} → {importDetail.data.lieuDestination ?? '—'}</dd></div>
                </dl>
                {importDetail.data.jalons.length > 0 && (
                  <ol className="fiche-timeline">
                    {importDetail.data.jalons.map((jalon) => (
                      <li key={jalon.id}>
                        <time dateTime={jalon.dateReelle ?? jalon.datePrevue ?? undefined}>{fmtDateHeure(jalon.dateReelle ?? jalon.datePrevue)}</time>
                        <strong>{jalon.type.replaceAll('_', ' ')}</strong>
                        {jalon.notes && <span>{jalon.notes}</span>}
                      </li>
                    ))}
                  </ol>
                )}
                {importDetail.data.expeditions.length === 0 ? (
                  <p className="lead">Aucune expédition enregistrée. Le rôle Logistique / Transit / Douane pilote cette étape.</p>
                ) : importDetail.data.expeditions.map((expedition) => (
                  <article className="panel p2p-card" key={expedition.id}>
                    <h3>{expedition.mode} · {expedition.referenceTransport}</h3>
                    <p>{expedition.portAeroportDepart ?? '—'} → {expedition.portAeroportArrivee ?? '—'} · ETA {fmtDateHeure(expedition.eta)}</p>
                    <p>{expedition.conteneurs.length} conteneur(s) · {expedition.dossier?.documents.length ?? 0} document(s) · {expedition.dossier?.couts.length ?? 0} coût(s)</p>
                    {expedition.dossier?.numeroDeclaration && <span className="badge badge-ok">Déclaration {expedition.dossier.numeroDeclaration}</span>}
                  </article>
                ))}
              </>
            )}
          </div>
        )}

        {onglet === 'factures' && (
          <div className="client-workspace-section">
            <h2>Factures liées</h2>
            {factures.length === 0 ? (
              <p className="lead">
                Aucune facture rattachée.{' '}
                {receptions.length > 0 ? (
                  <Link to={`/achats/factures?fournisseurId=${c.fournisseurId}&ouvrir=1`}>
                    Facturer les réceptions
                  </Link>
                ) : (
                  'Réceptionner d’abord les lignes confirmées.'
                )}
              </p>
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Statut</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr
                        key={f.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/achats/factures/${f.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/factures/${f.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{f.numero}</strong>
                        </td>
                        <td>
                          <span className={badgeFacture(f.statut)}>{STATUT_FACTURE[f.statut]}</span>
                        </td>
                        <td className="money">{fmtFcfa(f.montant)}</td>
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
            <p className="lead">Chronologie métier du bon — pas le journal d’audit.</p>
            <dl className="clients-dl">
              {historique.map((evt, i) => (
                <div key={`${evt.label}-${i}`}>
                  <dt>{evt.at ? fmtDateHeure(evt.at) : '—'}</dt>
                  <dd>
                    {evt.label}
                    {evt.detail ? ` · ${evt.detail}` : ''}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {ligneReception && (
        <Modal open onClose={() => setLigneReception(null)} title="Réception sur commande">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              receptionner.mutate();
            }}
          >
            <p className="lead">La quantité ne peut pas dépasser le reste commandé.</p>
            <label htmlFor="recept-qty">Quantité</label>
            <input
              id="recept-qty"
              type="number"
              min="1"
              value={qtyRec}
              onChange={(e) => setQtyRec(e.target.value)}
            />
            <label htmlFor="recept-prix">Prix d’achat réel</label>
            <input
              id="recept-prix"
              type="number"
              min="0.01"
              step="0.01"
              value={prixRec}
              onChange={(e) => setPrixRec(e.target.value)}
            />
            <label htmlFor="recept-entrepot">Entrepôt</label>
            <select
              id="recept-entrepot"
              value={entrepotId}
              onChange={(e) => setEntrepotId(e.target.value)}
            >
              <option value="">
                {commandeGroupe ? 'Quai ENTREE hub (défaut)' : 'Défaut'}
              </option>
              {(entrepots.data ?? [])
                .filter((e) =>
                  commandeGroupe
                    ? e.reseau && e.usage === 'ENTREE'
                    : e.usage === 'STOCK' || e.usage === 'ENTREE',
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
            </select>
            {formErr && <p role="alert">{formErr}</p>}
            <div className="table-actions">
              <button type="button" className="btn-ghost" onClick={() => setLigneReception(null)}>
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={receptionner.isPending}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {repartitionReceptionId &&
        (() => {
          const rec = receptions.find((r) => r.id === repartitionReceptionId);
          if (!rec) return null;
          return (
            <RepartitionHubModal
              open
              onClose={() => setRepartitionReceptionId(null)}
              reception={rec}
            />
          );
        })()}
    </div>
  );
}
