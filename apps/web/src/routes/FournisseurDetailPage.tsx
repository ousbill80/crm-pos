import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  FileText,
  Download,
  IdCard,
  LayoutDashboard,
  Package,
  Pencil,
  ShoppingBag,
  Truck,
  Warehouse,
} from 'lucide-react';
import { ModePaiementFournisseur, RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { ReceptionStockForm } from './FournisseursPage';
import {
  badgeCommande,
  badgeFacture,
  fmtDate,
  fmtDateHeure,
  fmtFcfa,
  MODE_PAIEMENT_FOURN,
  STATUT_COMMANDE,
  STATUT_FACTURE,
} from '../lib/achats-ui';
import type {
  CommandeAchatDto,
  FactureFournisseurDto,
  FournisseurDetailDto,
  FournisseurDto,
  ProduitDto,
} from '../lib/types';

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

const ROLES_FICHE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_RECEPTION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const ROLES_PAIEMENT: RoleLibelle[] = [
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
];

type Onglet =
  | 'apercu'
  | 'identite'
  | 'articles'
  | 'receptions'
  | 'commandes'
  | 'factures'
  | 'paiements';

const ONGLET_IDS: Onglet[] = [
  'apercu',
  'identite',
  'articles',
  'receptions',
  'commandes',
  'factures',
  'paiements',
];

function parseOnglet(value: string | null): Onglet {
  return ONGLET_IDS.includes(value as Onglet) ? (value as Onglet) : 'apercu';
}

function exporterCsv(filename: string, lignes: string[][]) {
  const csv = lignes
    .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type FicheForm = {
  nom: string;
  contact: string;
  telephone: string;
  email: string;
  adresse: string;
  notes: string;
  actif: boolean;
};

function ficheDepuis(f: FournisseurDto): FicheForm {
  return {
    nom: f.nom,
    contact: f.contact ?? '',
    telephone: f.telephone ?? '',
    email: f.email ?? '',
    adresse: f.adresse ?? '',
    notes: f.notes ?? '',
    actif: f.actif,
  };
}

export function FournisseurDetailPage() {
  const { fournisseurId } = useParams<{ fournisseurId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutGererFiche = user !== null && ROLES_FICHE.includes(user.role);
  const peutRecevoir = user !== null && ROLES_RECEPTION.includes(user.role);
  const peutPayer = user !== null && ROLES_PAIEMENT.includes(user.role);

  const onglet = parseOnglet(searchParams.get('onglet'));
  const [rechercheTab, setRechercheTab] = useState('');
  const [modalEdit, setModalEdit] = useState(false);
  const [modalReception, setModalReception] = useState(false);
  const [modalPaiement, setModalPaiement] = useState(false);
  const [facturePaiementId, setFacturePaiementId] = useState('');
  const [montantPaye, setMontantPaye] = useState('');
  const [modePaiement, setModePaiement] = useState<ModePaiementFournisseur>('VIREMENT');
  const [refPaiement, setRefPaiement] = useState('');
  const [fiche, setFiche] = useState<FicheForm | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['fournisseurs', fournisseurId],
    queryFn: () => apiFetch<FournisseurDetailDto>(`/fournisseurs/${fournisseurId}`),
    enabled: peutLire && Boolean(fournisseurId),
  });
  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled: peutRecevoir,
  });
  const commandes = useQuery({
    queryKey: ['achats-commandes'],
    queryFn: () => apiFetch<CommandeAchatDto[]>('/achats/commandes'),
    enabled: peutLire && Boolean(fournisseurId),
  });
  const factures = useQuery({
    queryKey: ['achats-factures'],
    queryFn: () => apiFetch<FactureFournisseurDto[]>('/achats/factures'),
    enabled: peutLire && Boolean(fournisseurId),
  });

  const editer = useMutation({
    mutationFn: () =>
      apiFetch<FournisseurDto>(`/fournisseurs/${fournisseurId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nom: fiche!.nom.trim(),
          contact: fiche!.contact.trim() || undefined,
          telephone: fiche!.telephone.trim() || undefined,
          email: fiche!.email.trim() || undefined,
          adresse: fiche!.adresse.trim() || undefined,
          notes: fiche!.notes.trim() || undefined,
          actif: fiche!.actif,
        }),
      }),
    onSuccess: () => {
      setModalEdit(false);
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    },
    onError: (err) => setFormErr(messageDepuisApi(err, 'Échec de la mise à jour.')),
  });

  const payer = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>(`/achats/factures/${facturePaiementId}/paiements`, {
        method: 'POST',
        body: JSON.stringify({
          montant: Number(montantPaye),
          mode: modePaiement,
          reference: refPaiement.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setModalPaiement(false);
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['achats-factures'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    },
    onError: (err) => setFormErr(messageDepuisApi(err, 'Paiement refusé.')),
  });

  const cmds = useMemo(
    () => (commandes.data ?? []).filter((c) => c.fournisseurId === fournisseurId),
    [commandes.data, fournisseurId],
  );
  const facts = useMemo(
    () => (factures.data ?? []).filter((x) => x.fournisseurId === fournisseurId),
    [factures.data, fournisseurId],
  );
  const ouvertes = cmds.filter(
    (c) =>
      c.statut === 'CONFIRMEE' ||
      c.statut === 'PARTIELLEMENT_RECEPTIONNEE' ||
      c.statut === 'BROUILLON',
  );
  const encours = facts.filter(
    (x) => x.statut === 'COMPTABILISEE' || x.statut === 'PARTIELLEMENT_PAYEE',
  );
  const paiements = useMemo(() => {
    const lignes = facts.flatMap((facture) =>
      (facture.paiements ?? []).map((p) => ({
        ...p,
        factureId: facture.id,
        factureNumero: facture.numero,
      })),
    );
    return lignes.sort((a, b) => b.datePaiement.localeCompare(a.datePaiement));
  }, [facts]);
  const totalPaye = paiements.reduce((s, p) => s + Number(p.montant), 0);
  const totalReste = encours.reduce((s, x) => s + Number(x.resteAPayer), 0);
  const qTab = rechercheTab.trim().toLowerCase();
  const produitsFiltres = (detail.data?.produits ?? []).filter((p) => {
    if (!qTab) return true;
    return (
      p.designation.toLowerCase().includes(qTab) ||
      (p.reference ?? '').toLowerCase().includes(qTab)
    );
  });
  const receptionsFiltrees = (detail.data?.receptions ?? []).filter((r) => {
    if (!qTab) return true;
    return (
      (r.produit?.designation ?? '').toLowerCase().includes(qTab) ||
      (r.reference ?? '').toLowerCase().includes(qTab) ||
      (r.entrepot?.nom ?? '').toLowerCase().includes(qTab) ||
      (r.commande?.numero ?? '').toLowerCase().includes(qTab)
    );
  });

  function aller(id: Onglet) {
    setRechercheTab('');
    const next = new URLSearchParams(searchParams);
    if (id === 'apercu') next.delete('onglet');
    else next.set('onglet', id);
    setSearchParams(next, { replace: true });
  }

  if (!fournisseurId) return <p role="alert">Fournisseur introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux fournisseurs.</p>;
  if (detail.isLoading) return <LoadingState label="Chargement de la fiche..." />;
  if (detail.isError || !detail.data) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/fournisseurs')}>
          ← Fournisseurs
        </button>
        <p role="alert">Impossible de charger cette fiche.</p>
      </div>
    );
  }

  const f = detail.data;
  const manques = [
    !f.contact ? 'interlocuteur' : null,
    !f.telephone && !f.email ? 'contact' : null,
    !f.adresse ? 'adresse' : null,
    f.nombreReceptions === 0 ? 'première réception' : null,
  ].filter(Boolean) as string[];

  const tabs: Array<{ id: Onglet; label: string; icon: typeof LayoutDashboard; count?: number }> = [
    { id: 'apercu', label: 'Vue d’ensemble', icon: LayoutDashboard },
    { id: 'identite', label: 'Identité', icon: IdCard },
    { id: 'articles', label: 'Articles', icon: Package, count: f.produits.length },
    { id: 'receptions', label: 'Réceptions', icon: Warehouse, count: f.receptions.length },
    { id: 'commandes', label: 'Commandes', icon: ShoppingBag, count: cmds.length },
    { id: 'factures', label: 'Factures', icon: FileText, count: facts.length },
    { id: 'paiements', label: 'Paiements', icon: Banknote, count: paiements.length },
  ];

  function ouvrirPaiement(factureId?: string) {
    const cible = encours.find((x) => x.id === factureId) ?? encours[0];
    if (!cible) return;
    setFacturePaiementId(cible.id);
    setMontantPaye(cible.resteAPayer);
    setModePaiement('VIREMENT');
    setRefPaiement('');
    setFormErr(null);
    setModalPaiement(true);
  }

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/fournisseurs')}>
          ← Fournisseurs
        </button>
        <div className="client-workspace-toolbar-actions">
          <Link
            to={`/achats/commandes?fournisseurId=${f.id}&ouvrir=1`}
            className="stock-row-link"
          >
            Nouvelle commande
          </Link>
          <Link
            to={`/achats/factures?fournisseurId=${f.id}&ouvrir=1`}
            className="stock-row-link"
          >
            Facturer
          </Link>
          {peutPayer && encours.length > 0 && (
            <button type="button" className="btn-primary" onClick={() => ouvrirPaiement()}>
              Enregistrer un paiement
            </button>
          )}
          {peutGererFiche && (
            <button
              type="button"
              onClick={() => {
                setFiche(ficheDepuis(f));
                setFormErr(null);
                setModalEdit(true);
              }}
            >
              <Pencil size={14} /> Modifier
            </button>
          )}
          {peutRecevoir && f.actif && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setModalReception(true)}
            >
              Réception centrale
            </button>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          <Truck size={28} />
        </div>
        <div className="client-workspace-hero-main">
          <h1>{f.nom}</h1>
          <p className="client-workspace-hero-sub">
            {f.contact ?? 'Sans interlocuteur'}
            {f.telephone ? ` · ${f.telephone}` : ''}
            {f.email ? ` · ${f.email}` : ''}
          </p>
          <div className="client-workspace-chips">
            {f.actif ? (
              <span className="badge badge-ok">Actif</span>
            ) : (
              <span className="badge badge-neutral">Inactif</span>
            )}
            {f.nombreReceptions === 0 && f.actif && (
              <span className="badge badge-warning">Jamais livré</span>
            )}
            {ouvertes.length > 0 && (
              <span className="badge badge-warning">{ouvertes.length} commande(s) ouverte(s)</span>
            )}
            {encours.length > 0 && (
              <span className="badge badge-warning">{encours.length} facture(s) en encours</span>
            )}
            {paiements.length > 0 && (
              <span className="badge badge-ok">{paiements.length} paiement(s)</span>
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Cumul achats</strong> {fmtFcfa(f.montantCumule)}
            </span>
            <span>
              <strong>Dernière livraison</strong> {fmtDateHeure(f.derniereReceptionAt)}
            </span>
          </div>
        </div>
      </header>

      {!f.actif && (
        <p role="status">Fournisseur inactif — réceptions et nouvelles commandes bloquées.</p>
      )}

      <nav className="client-workspace-tabs" aria-label="Sections fiche fournisseur">
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
              <button type="button" className="client-kpi-card" onClick={() => aller('receptions')}>
                <div className="client-kpi-label">Réceptions</div>
                <div className="client-kpi-value">{f.nombreReceptions}</div>
                <div className="client-kpi-hint">{f.unitesRecues} unité(s)</div>
              </button>
              <button type="button" className="client-kpi-card" onClick={() => aller('articles')}>
                <div className="client-kpi-label">Cumul achats</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(f.montantCumule)}
                </div>
                <div className="client-kpi-hint">{f.produitsDistincts} article(s)</div>
              </button>
              <button
                type="button"
                className={`client-kpi-card${ouvertes.length > 0 ? ' kpi-actif' : ''}`}
                onClick={() => aller('commandes')}
              >
                <div className="client-kpi-label">Commandes ouvertes</div>
                <div className="client-kpi-value">{ouvertes.length}</div>
                <div className="client-kpi-hint">{cmds.length} au total</div>
              </button>
              <button
                type="button"
                className={`client-kpi-card${encours.length > 0 ? ' kpi-actif' : ''}`}
                onClick={() => aller('factures')}
              >
                <div className="client-kpi-label">Encours factures</div>
                <div className="client-kpi-value">{encours.length}</div>
                <div className="client-kpi-hint">
                  {fmtFcfa(totalReste)} restant
                </div>
              </button>
              <button
                type="button"
                className={`client-kpi-card${paiements.length > 0 ? ' kpi-actif' : ''}`}
                onClick={() => aller('paiements')}
              >
                <div className="client-kpi-label">Paiements</div>
                <div className="client-kpi-value">{paiements.length}</div>
                <div className="client-kpi-hint">{fmtFcfa(totalPaye)} versé(s)</div>
              </button>
            </div>
            {manques.length > 0 && (
              <p className="fiche-completude" style={{ marginTop: 16 }}>
                À compléter : {manques.join(', ')}.{' '}
                <button type="button" className="link-button" onClick={() => aller('identite')}>
                  Voir l’identité
                </button>
              </p>
            )}
            <dl className="clients-dl" style={{ marginTop: 16 }}>
              <div>
                <dt>Adresse</dt>
                <dd>{f.adresse ?? '—'}</dd>
              </div>
              <div>
                <dt>Créée le</dt>
                <dd>{fmtDateHeure(f.createdAt)}</dd>
              </div>
              {f.notes ? (
                <div>
                  <dt>Notes</dt>
                  <dd>{f.notes}</dd>
                </div>
              ) : null}
            </dl>

            {ouvertes.length > 0 && (
              <>
                <h2>Commandes à suivre</h2>
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Statut</th>
                        <th>Réception</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ouvertes.slice(0, 5).map((c) => (
                        <tr
                          key={c.id}
                          className="produit-row"
                          onClick={() => navigate(`/achats/commandes/${c.id}`)}
                        >
                          <td>
                            <strong>{c.numero}</strong>
                          </td>
                          <td>
                            <span className={badgeCommande(c.statut)}>
                              {STATUT_COMMANDE[c.statut]}
                            </span>
                          </td>
                          <td>
                            {c.quantiteRecue}/{c.quantite}
                          </td>
                          <td className="money">{fmtFcfa(c.montant)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {encours.length > 0 && (
              <>
                <h2>Factures en encours</h2>
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Statut</th>
                        <th>Reste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {encours.slice(0, 5).map((x) => (
                        <tr
                          key={x.id}
                          className="produit-row"
                          onClick={() => navigate(`/achats/factures/${x.id}`)}
                        >
                          <td>
                            <strong>{x.numero}</strong>
                          </td>
                          <td>
                            <span className={badgeFacture(x.statut)}>
                              {STATUT_FACTURE[x.statut]}
                            </span>
                          </td>
                          <td className="money">{fmtFcfa(x.resteAPayer)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {f.receptions.length > 0 && (
              <>
                <h2>Dernières réceptions</h2>
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Article</th>
                        <th>Qté</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.receptions.slice(0, 5).map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDate(r.dateReception)}</td>
                          <td>
                            {r.produitId ? (
                              <Link className="link-button" to={`/produits/${r.produitId}`}>
                                {r.produit?.designation ?? r.produitId}
                              </Link>
                            ) : (
                              r.produit?.designation ?? '—'
                            )}
                          </td>
                          <td>{r.quantite}</td>
                          <td className="money">{fmtFcfa(r.montant)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn-ghost" onClick={() => aller('receptions')}>
                  Voir tout l’historique
                </button>
              </>
            )}
          </div>
        )}

        {onglet === 'identite' && (
          <div className="client-workspace-section">
            <div className="table-actions" style={{ justifyContent: 'space-between' }}>
              <h2>Identité commerciale</h2>
              {peutGererFiche && (
                <button
                  type="button"
                  onClick={() => {
                    setFiche(ficheDepuis(f));
                    setFormErr(null);
                    setModalEdit(true);
                  }}
                >
                  <Pencil size={14} /> Modifier
                </button>
              )}
            </div>
            <dl className="clients-dl">
              <div>
                <dt>Nom</dt>
                <dd>{f.nom}</dd>
              </div>
              <div>
                <dt>Interlocuteur</dt>
                <dd>{f.contact ?? '—'}</dd>
              </div>
              <div>
                <dt>Téléphone</dt>
                <dd>{f.telephone ?? '—'}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{f.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Adresse</dt>
                <dd>{f.adresse ?? '—'}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{f.notes ?? '—'}</dd>
              </div>
              <div>
                <dt>Fiche créée</dt>
                <dd>{fmtDateHeure(f.createdAt)}</dd>
              </div>
              <div>
                <dt>Statut</dt>
                <dd>{f.actif ? 'Actif' : 'Inactif'}</dd>
              </div>
            </dl>
          </div>
        )}

        {onglet === 'articles' && (
          <div className="client-workspace-section">
            <h2>Articles livrés</h2>
            {f.produits.length === 0 ? (
              <p className="lead">Aucun article livré pour l’instant.</p>
            ) : (
              <>
                <div className="toolbar">
                  <input
                    type="search"
                    placeholder="Filtrer un article…"
                    value={rechercheTab}
                    onChange={(e) => setRechercheTab(e.target.value)}
                  />
                  <p className="lead">
                    {produitsFiltres.length}/{f.produits.length}
                  </p>
                </div>
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th>Unités</th>
                        <th>Cumul</th>
                        <th>Dernier prix</th>
                        <th>Variation</th>
                        <th>Dernière</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produitsFiltres.map((p) => (
                        <tr
                          key={p.produitId}
                          className="produit-row"
                          onClick={() => navigate(`/produits/${p.produitId}`)}
                        >
                          <td>
                            <strong>{p.designation}</strong>
                            {p.reference ? (
                              <div className="produit-ref">{p.reference}</div>
                            ) : null}
                          </td>
                          <td>{p.unites}</td>
                          <td className="money">{fmtFcfa(p.montant)}</td>
                          <td className="money">{fmtFcfa(p.dernierPrix)}</td>
                          <td>
                            {p.variationPct === null ? (
                              '—'
                            ) : (
                              <span
                                className={
                                  Number(p.variationPct) > 0 ? 'badge badge-warning' : 'badge'
                                }
                              >
                                {Number(p.variationPct) > 0 ? '+' : ''}
                                {p.variationPct} %
                              </span>
                            )}
                          </td>
                          <td>{fmtDate(p.derniereReceptionAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {onglet === 'receptions' && (
          <div className="client-workspace-section">
            <h2>Historique des réceptions</h2>
            {f.receptions.length === 0 ? (
              <p className="lead">
                Aucune réception. Seuls SI / Direction enregistrent l’entrée fournisseur au
                central.
              </p>
            ) : (
              <>
                <div className="toolbar">
                  <input
                    type="search"
                    placeholder="Article, BL, BC, entrepôt…"
                    value={rechercheTab}
                    onChange={(e) => setRechercheTab(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      exporterCsv(`receptions-${f.nom}.csv`, [
                        ['Date', 'Produit', 'Qté', 'Prix', 'Montant', 'Entrepôt', 'BL', 'BC', 'Opérateur'],
                        ...receptionsFiltrees.map((r) => [
                          r.dateReception,
                          r.produit?.designation ?? r.produitId,
                          String(r.quantite),
                          r.prixAchat,
                          r.montant,
                          r.entrepot?.nom ?? '',
                          r.reference ?? '',
                          r.commande?.numero ?? '',
                          r.utilisateur
                            ? `${r.utilisateur.prenom} ${r.utilisateur.nom}`
                            : '',
                        ]),
                      ])
                    }
                  >
                    <Download size={14} /> Export CSV
                  </button>
                </div>
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Produit</th>
                        <th>Qté</th>
                        <th>Prix</th>
                        <th>Montant</th>
                        <th>Entrepôt</th>
                        <th>BL</th>
                        <th>BC</th>
                        <th>Opérateur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receptionsFiltrees.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDateHeure(r.dateReception)}</td>
                          <td>
                            {r.produitId ? (
                              <Link className="link-button" to={`/produits/${r.produitId}`}>
                                {r.produit?.designation ?? r.produitId}
                              </Link>
                            ) : (
                              r.produit?.designation ?? '—'
                            )}
                          </td>
                          <td>{r.quantite}</td>
                          <td className="money">{fmtFcfa(r.prixAchat)}</td>
                          <td className="money">{fmtFcfa(r.montant)}</td>
                          <td>
                            {r.entrepotId ? (
                              <Link
                                className="link-button"
                                to={`/stocks/entrepots/${r.entrepotId}`}
                              >
                                {r.entrepot?.nom ?? r.entrepotId}
                              </Link>
                            ) : (
                              r.entrepot?.nom ?? '—'
                            )}
                          </td>
                          <td>{r.reference ?? '—'}</td>
                          <td>
                            {r.commande ? (
                              <Link to={`/achats/commandes/${r.commande.id}`}>
                                {r.commande.numero}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {onglet === 'commandes' && (
          <div className="client-workspace-section">
            <h2>Bons de commande</h2>
            {cmds.length === 0 ? (
              <p className="lead">
                Aucune commande.{' '}
                <Link to={`/achats/commandes?fournisseurId=${f.id}&ouvrir=1`}>
                  Créer un bon de commande
                </Link>
              </p>
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Réception</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cmds.map((c) => (
                      <tr
                        key={c.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/achats/commandes/${c.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/commandes/${c.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{c.numero}</strong>
                        </td>
                        <td>
                          <span className={badgeCommande(c.statut)}>
                            {STATUT_COMMANDE[c.statut]}
                          </span>
                        </td>
                        <td>{fmtDate(c.dateCommande)}</td>
                        <td className="money">{fmtFcfa(c.montant)}</td>
                        <td>
                          {c.quantiteRecue}/{c.quantite}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {onglet === 'factures' && (
          <div className="client-workspace-section">
            <h2>Factures</h2>
            {facts.length === 0 ? (
              <p className="lead">
                Aucune facture.{' '}
                <Link to={`/achats/factures?fournisseurId=${f.id}&ouvrir=1`}>
                  Facturer des réceptions
                </Link>
              </p>
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Reste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facts.map((x) => (
                      <tr
                        key={x.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/achats/factures/${x.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/factures/${x.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{x.numero}</strong>
                        </td>
                        <td>
                          <span className={badgeFacture(x.statut)}>{STATUT_FACTURE[x.statut]}</span>
                        </td>
                        <td>{fmtDate(x.dateFacture)}</td>
                        <td className="money">{fmtFcfa(x.montant)}</td>
                        <td className="money">{fmtFcfa(x.resteAPayer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {onglet === 'paiements' && (
          <div className="client-workspace-section">
            <div className="toolbar">
              <h2 style={{ margin: 0, flex: 1 }}>Paiements fournisseur</h2>
              {paiements.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    exporterCsv(`paiements-${f.nom}.csv`, [
                      ['Date', 'Facture', 'Mode', 'Montant', 'Référence', 'Opérateur'],
                      ...paiements.map((p) => [
                        fmtDateHeure(p.datePaiement),
                        p.factureNumero,
                        MODE_PAIEMENT_FOURN[p.mode] ?? p.mode,
                        p.montant,
                        p.reference ?? '',
                        p.utilisateur
                          ? `${p.utilisateur.prenom} ${p.utilisateur.nom}`
                          : '',
                      ]),
                    ])
                  }
                >
                  <Download size={14} /> Export CSV
                </button>
              )}
            </div>
            <p className="lead">
              Grand livre Achats (DAF / Caissier Central) — pas un mouvement de caisse boutique.
            </p>
            <div className="client-kpi-grid">
              <div className="client-kpi-card">
                <div className="client-kpi-label">Versé</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(totalPaye)}
                </div>
                <div className="client-kpi-hint">{paiements.length} règlement(s)</div>
              </div>
              <button
                type="button"
                className={`client-kpi-card${totalReste > 0 ? ' kpi-actif' : ''}`}
                onClick={() => aller('factures')}
              >
                <div className="client-kpi-label">Reste dû</div>
                <div className="client-kpi-value client-kpi-value-sm money">
                  {fmtFcfa(totalReste)}
                </div>
                <div className="client-kpi-hint">{encours.length} facture(s) ouverte(s)</div>
              </button>
              <div className="client-kpi-card">
                <div className="client-kpi-label">Dernier paiement</div>
                <div className="client-kpi-value client-kpi-value-sm">
                  {paiements[0] ? fmtDate(paiements[0].datePaiement) : '—'}
                </div>
                <div className="client-kpi-hint">
                  {paiements[0]
                    ? `${fmtFcfa(paiements[0].montant)} · ${MODE_PAIEMENT_FOURN[paiements[0].mode] ?? paiements[0].mode}`
                    : 'Aucun règlement'}
                </div>
              </div>
            </div>
            {peutPayer && encours.length > 0 && (
              <p className="table-actions" style={{ marginTop: 16 }}>
                <button type="button" className="btn-primary" onClick={() => ouvrirPaiement()}>
                  Enregistrer un paiement
                </button>
              </p>
            )}
            {paiements.length === 0 ? (
              <p className="lead" style={{ marginTop: 16 }}>
                Aucun paiement enregistré.{' '}
                {encours.length > 0 ? (
                  peutPayer ? (
                    <>Réglez une facture comptabilisée depuis cet onglet.</>
                  ) : (
                    <>
                      Les factures en encours se règlent depuis{' '}
                      <Link to={`/achats/factures?fournisseurId=${f.id}`}>Factures</Link> (DAF /
                      Caissier Central).
                    </>
                  )
                ) : (
                  <>
                    <Link to={`/achats/factures?fournisseurId=${f.id}&ouvrir=1`}>
                      Comptabiliser une facture
                    </Link>{' '}
                    avant de pouvoir payer.
                  </>
                )}
              </p>
            ) : (
              <div className="clients-table-wrap" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Facture</th>
                      <th>Mode</th>
                      <th>Montant</th>
                      <th>Réf.</th>
                      <th>Opérateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paiements.map((p) => (
                      <tr
                        key={p.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        onClick={() => navigate(`/achats/factures/${p.factureId}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/factures/${p.factureId}`);
                          }
                        }}
                      >
                        <td>{fmtDateHeure(p.datePaiement)}</td>
                        <td>
                          <Link
                            to={`/achats/factures/${p.factureId}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.factureNumero}
                          </Link>
                        </td>
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
      </section>

      {peutGererFiche && fiche && (
        <Modal open={modalEdit} onClose={() => setModalEdit(false)} title="Modifier la fiche">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editer.mutate();
            }}
          >
            <label htmlFor="edit-nom">Nom</label>
            <input
              id="edit-nom"
              value={fiche.nom}
              onChange={(e) => setFiche({ ...fiche, nom: e.target.value })}
              required
            />
            <label htmlFor="edit-contact">Interlocuteur</label>
            <input
              id="edit-contact"
              value={fiche.contact}
              onChange={(e) => setFiche({ ...fiche, contact: e.target.value })}
            />
            <label htmlFor="edit-tel">Téléphone</label>
            <input
              id="edit-tel"
              value={fiche.telephone}
              onChange={(e) => setFiche({ ...fiche, telephone: e.target.value })}
            />
            <label htmlFor="edit-email">E-mail</label>
            <input
              id="edit-email"
              type="email"
              value={fiche.email}
              onChange={(e) => setFiche({ ...fiche, email: e.target.value })}
            />
            <label htmlFor="edit-adresse">Adresse</label>
            <input
              id="edit-adresse"
              value={fiche.adresse}
              onChange={(e) => setFiche({ ...fiche, adresse: e.target.value })}
            />
            <label htmlFor="edit-notes">Notes</label>
            <textarea
              id="edit-notes"
              rows={3}
              value={fiche.notes}
              onChange={(e) => setFiche({ ...fiche, notes: e.target.value })}
            />
            <label>
              <input
                type="checkbox"
                checked={fiche.actif}
                onChange={(e) => setFiche({ ...fiche, actif: e.target.checked })}
              />{' '}
              Fournisseur actif
            </label>
            {formErr && <p role="alert">{formErr}</p>}
            <div className="table-actions">
              <button type="button" className="btn-ghost" onClick={() => setModalEdit(false)}>
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={editer.isPending}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {peutRecevoir && modalReception && (
        <Modal
          open
          onClose={() => setModalReception(false)}
          title="Enregistrer une réception"
          size="lg"
        >
          <ReceptionStockForm
            fournisseurId={f.id}
            produits={produits.data ?? []}
            onFerme={() => setModalReception(false)}
          />
        </Modal>
      )}

      {peutPayer && (
        <Modal
          open={modalPaiement}
          onClose={() => setModalPaiement(false)}
          title="Enregistrer un paiement fournisseur"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              payer.mutate();
            }}
          >
            <p className="lead">
              Grand livre Achats — n’écrit pas sur une caisse boutique.
            </p>
            <label htmlFor="pay-facture">Facture</label>
            <select
              id="pay-facture"
              value={facturePaiementId}
              onChange={(e) => {
                const id = e.target.value;
                setFacturePaiementId(id);
                const cible = encours.find((x) => x.id === id);
                if (cible) setMontantPaye(cible.resteAPayer);
              }}
              required
            >
              {encours.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.numero} — reste {fmtFcfa(x.resteAPayer)}
                </option>
              ))}
            </select>
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
              value={modePaiement}
              onChange={(e) => setModePaiement(e.target.value as ModePaiementFournisseur)}
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
              placeholder="N° virement, reçu, etc."
            />
            {formErr && <p role="alert">{formErr}</p>}
            <div className="table-actions">
              <button type="button" className="btn-ghost" onClick={() => setModalPaiement(false)}>
                Annuler
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={payer.isPending || !facturePaiementId}
              >
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
