import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  Package,
  Pencil,
  Search,
  Truck,
  Wallet,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightHaussesPrix,
  insightListeFournisseurs,
  insightMontantAchats,
  insightPrixAchatVsCmp,
  insightReceptionStock,
} from '../lib/insights/fournisseurs';
import type {
  EntrepotDto,
  FournisseurDetailDto,
  FournisseurDto,
  FournisseursSyntheseDto,
  ProduitDto,
  ReceptionStockDto,
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
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

function fmtMoney(value: string | number): string {
  return Math.round(Number(value)).toLocaleString('fr-FR');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

function telechargerCsv(filename: string, lignes: string[][]) {
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

const FICHE_VIDE: FicheForm = {
  nom: '',
  contact: '',
  telephone: '',
  email: '',
  adresse: '',
  notes: '',
  actif: true,
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

function payloadFiche(form: FicheForm, avecActif: boolean) {
  return {
    nom: form.nom.trim(),
    contact: form.contact.trim() || undefined,
    telephone: form.telephone.trim() || undefined,
    email: form.email.trim() || undefined,
    adresse: form.adresse.trim() || undefined,
    notes: form.notes.trim() || undefined,
    ...(avecActif ? { actif: form.actif } : {}),
  };
}

function FicheFournisseurFields({
  form,
  onChange,
  avecActif,
}: {
  form: FicheForm;
  onChange: (next: FicheForm) => void;
  avecActif: boolean;
}) {
  function set<K extends keyof FicheForm>(key: K, value: FicheForm[K]) {
    onChange({ ...form, [key]: value });
  }
  return (
    <>
      <div>
        <label htmlFor="fourn-nom">Nom</label>
        <input
          id="fourn-nom"
          value={form.nom}
          onChange={(e) => set('nom', e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="fourn-contact">Interlocuteur</label>
        <input
          id="fourn-contact"
          value={form.contact}
          onChange={(e) => set('contact', e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="fourn-tel">Téléphone</label>
        <input
          id="fourn-tel"
          value={form.telephone}
          onChange={(e) => set('telephone', e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="fourn-email">E-mail</label>
        <input
          id="fourn-email"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="fourn-adresse">Adresse</label>
        <input
          id="fourn-adresse"
          value={form.adresse}
          onChange={(e) => set('adresse', e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="fourn-notes">Notes internes</label>
        <textarea
          id="fourn-notes"
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
      {avecActif && (
        <label>
          <input
            type="checkbox"
            checked={form.actif}
            onChange={(e) => set('actif', e.target.checked)}
          />{' '}
          Fournisseur actif (une fiche inactive ne peut plus réceptionner)
        </label>
      )}
    </>
  );
}

function ReceptionStockForm({
  fournisseurId,
  produits,
  onFerme,
}: {
  fournisseurId: string;
  produits: ProduitDto[];
  onFerme: () => void;
}) {
  const queryClient = useQueryClient();
  const actifs = produits.filter((p) => p.actif);
  const [rechercheProduit, setRechercheProduit] = useState('');
  const [produitId, setProduitId] = useState(actifs[0]?.id ?? '');
  const [quantite, setQuantite] = useState('1');
  const [prixAchat, setPrixAchat] = useState('');
  const [entrepotId, setEntrepotId] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<ReceptionStockDto | null>(null);

  const { data: entrepots } = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
  });

  const produitsFiltres = actifs.filter((p) => {
    const q = rechercheProduit.trim().toLowerCase();
    if (!q) return true;
    return (
      p.designation.toLowerCase().includes(q) ||
      (p.reference ?? '').toLowerCase().includes(q)
    );
  });

  const produitSelectionne = actifs.find((p) => p.id === produitId);
  const prixNum = prixAchat.trim() === '' ? null : Number(prixAchat);
  const qtyNum = Number(quantite);
  const cmpNum =
    produitSelectionne && Number(produitSelectionne.coutMoyenPondere) > 0
      ? Number(produitSelectionne.coutMoyenPondere)
      : null;

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ReceptionStockDto>(`/fournisseurs/${fournisseurId}/receptions`, {
        method: 'POST',
        body: JSON.stringify({
          produitId,
          quantite: Number(quantite),
          prixAchat: Number(prixAchat),
          ...(entrepotId ? { entrepotId } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      }),
    onSuccess: (reception) => {
      setError(null);
      setSucces(reception);
      setQuantite('1');
      setPrixAchat('');
      setReference('');
      void queryClient.invalidateQueries({ queryKey: ['produits'] });
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Échec de la réception : vérifiez produit, quantité et prix.')),
  });

  if (actifs.length === 0) {
    return <p>Aucun produit actif au catalogue pour enregistrer une réception.</p>;
  }

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="lead">
        Réception de stock <InfoTooltip insight={insightReceptionStock()} />
      </p>
      <div>
        <label htmlFor="rech-produit">Rechercher un article</label>
        <input
          id="rech-produit"
          type="search"
          placeholder="Désignation ou SKU…"
          value={rechercheProduit}
          onChange={(e) => setRechercheProduit(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`produit-${fournisseurId}`}>Produit</label>
        <select
          id={`produit-${fournisseurId}`}
          value={produitId}
          onChange={(e) => setProduitId(e.target.value)}
        >
          {produitsFiltres.map((p) => (
            <option key={p.id} value={p.id}>
              {p.designation}
              {p.reference ? ` · ${p.reference}` : ''} (stock {p.stock})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`entrepot-${fournisseurId}`}>Entrepôt de réception</label>
        <select
          id={`entrepot-${fournisseurId}`}
          value={entrepotId || entrepots?.find((e) => e.type === 'PRINCIPAL')?.id || ''}
          onChange={(e) => setEntrepotId(e.target.value)}
        >
          {(entrepots ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom} ({e.code}){e.boutique ? ` — ${e.boutique.nom}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`quantite-${fournisseurId}`}>Quantité reçue</label>
        <input
          id={`quantite-${fournisseurId}`}
          type="number"
          min="1"
          step="1"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`prix-achat-${fournisseurId}`}>
          Prix d’achat unitaire{' '}
          <InfoTooltip
            insight={insightPrixAchatVsCmp(
              prixNum,
              cmpNum,
              produitSelectionne?.designation,
            )}
          />
        </label>
        <input
          id={`prix-achat-${fournisseurId}`}
          type="number"
          min="0.01"
          step="0.01"
          value={prixAchat}
          onChange={(e) => setPrixAchat(e.target.value)}
          required
        />
        {produitSelectionne && Number(produitSelectionne.coutMoyenPondere) > 0 && (
          <p className="lead">CMP actuel : {fmtMoney(produitSelectionne.coutMoyenPondere)} FCFA</p>
        )}
      </div>
      <div>
        <label htmlFor={`bl-${fournisseurId}`}>Référence BL (optionnel)</label>
        <input
          id={`bl-${fournisseurId}`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="N° de bon de livraison"
        />
      </div>
      {prixNum && qtyNum > 0 && (
        <p className="lead">
          Montant de la ligne : {fmtMoney(prixNum * qtyNum)} FCFA
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        Enregistrer la réception
      </button>
      <button type="button" onClick={onFerme}>
        Fermer
      </button>
      {error && <p role="alert">{error}</p>}
      {succes && (
        <p>
          Réception enregistrée : +{succes.quantite} unité(s)
          {succes.montant ? ` — ${fmtMoney(succes.montant)} FCFA` : ''} — stock mis à jour.
        </p>
      )}
    </form>
  );
}

export function FournisseursPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutGererFiche = user !== null && ROLES_FICHE.includes(user.role);
  const peutRecevoir = user !== null && ROLES_RECEPTION.includes(user.role);

  const [recherche, setRecherche] = useState('');
  const [masquerInactifs, setMasquerInactifs] = useState(true);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [modalEdit, setModalEdit] = useState(false);
  const [modalReception, setModalReception] = useState(false);
  const [fiche, setFiche] = useState<FicheForm>(FICHE_VIDE);
  const [formErr, setFormErr] = useState<string | null>(null);

  const synthese = useQuery({
    queryKey: ['fournisseurs-synthese'],
    queryFn: () => apiFetch<FournisseursSyntheseDto>('/fournisseurs/synthese'),
    enabled: peutLire,
  });
  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled: peutRecevoir,
  });
  const detail = useQuery({
    queryKey: ['fournisseurs', selectionId],
    queryFn: () => apiFetch<FournisseurDetailDto>(`/fournisseurs/${selectionId}`),
    enabled: peutLire && selectionId !== null,
  });

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
  }

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<FournisseurDto>('/fournisseurs', {
        method: 'POST',
        body: JSON.stringify(payloadFiche(fiche, false)),
      }),
    onSuccess: (created) => {
      setModalNouveau(false);
      setFiche(FICHE_VIDE);
      setFormErr(null);
      setSelectionId(created.id);
      invalider();
    },
    onError: (err) => setFormErr(messageDepuisApi(err, 'Échec de la création du fournisseur.')),
  });

  const editer = useMutation({
    mutationFn: () =>
      apiFetch<FournisseurDto>(`/fournisseurs/${selectionId}`, {
        method: 'PATCH',
        body: JSON.stringify(payloadFiche(fiche, true)),
      }),
    onSuccess: () => {
      setModalEdit(false);
      setFormErr(null);
      invalider();
      if (selectionId) {
        void queryClient.invalidateQueries({ queryKey: ['fournisseurs', selectionId] });
      }
    },
    onError: (err) => setFormErr(messageDepuisApi(err, 'Échec de la mise à jour.')),
  });

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (synthese.data?.fournisseurs ?? []).filter((f) => {
      if (masquerInactifs && !f.actif) return false;
      if (!q) return true;
      return [f.nom, f.contact, f.telephone, f.email, f.adresse]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [synthese.data, recherche, masquerInactifs]);

  if (!peutLire) {
    return <p>Vous n’avez pas accès aux fournisseurs.</p>;
  }

  const kpis = synthese.data?.kpis;
  const selectionListe = liste.find((f) => f.id === selectionId) ?? synthese.data?.fournisseurs.find((f) => f.id === selectionId);

  return (
    <div>
      <PageHeader
        title="Fournisseurs"
        subtitle="Module Achats — fiches, commandes, réceptions, factures et paiements (hors caisse boutique §6.4)"
        actions={
          <div className="table-actions">
            {synthese.data && (
              <button
                type="button"
                onClick={() =>
                  telechargerCsv('fournisseurs.csv', [
                    ['Nom', 'Contact', 'Téléphone', 'E-mail', 'Réceptions', 'Unités', 'Montant', 'Dernière', 'Actif'],
                    ...synthese.data!.fournisseurs.map((f) => [
                      f.nom,
                      f.contact ?? '',
                      f.telephone ?? '',
                      f.email ?? '',
                      String(f.nombreReceptions),
                      String(f.unitesRecues),
                      f.montantCumule,
                      f.derniereReceptionAt ?? '',
                      f.actif ? 'oui' : 'non',
                    ]),
                  ])
                }
              >
                <Download size={16} /> Export CSV
              </button>
            )}
            {peutGererFiche && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setFiche(FICHE_VIDE);
                  setFormErr(null);
                  setModalNouveau(true);
                }}
              >
                Nouveau fournisseur
              </button>
            )}
          </div>
        }
      />

      {synthese.isLoading && <LoadingState label="Chargement des fournisseurs..." />}
      {synthese.isError && <p role="alert">Erreur lors du chargement du module Achats.</p>}

      {kpis && (
        <>
          <div className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Truck size={16} />
                </span>
                <InfoTooltip
                  insight={insightListeFournisseurs(kpis.fournisseurs, kpis.jamaisLivres)}
                />
              </div>
              <div className="kpi-label">Fournisseurs</div>
              <div className="kpi-value">{kpis.actifs}</div>
              <div className="kpi-hint">
                {kpis.fournisseurs} fiche(s) · {kpis.jamaisLivres} jamais livré(s)
              </div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Package size={16} />
                </span>
              </div>
              <div className="kpi-label">Réceptions 30 j</div>
              <div className="kpi-value">{kpis.receptions30j}</div>
              <div className="kpi-hint">{kpis.unites30j} unité(s) entrée(s)</div>
            </article>
            <article
              className={
                Number(kpis.montant30j) > 0 ? 'kpi-card dash-kpi' : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Wallet size={16} />
                </span>
                <InfoTooltip
                  insight={insightMontantAchats(Number(kpis.montant30j), kpis.receptions30j)}
                />
              </div>
              <div className="kpi-label">Valeur entrée 30 j</div>
              <div className="kpi-value">{fmtMoney(kpis.montant30j)}</div>
              <div className="kpi-hint">FCFA — qty × prix d’achat</div>
            </article>
            <article
              className={
                (synthese.data?.haussesPrix.length ?? 0) > 0
                  ? 'kpi-card dash-kpi kpi-warning'
                  : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <AlertTriangle size={16} />
                </span>
                <InfoTooltip
                  insight={insightHaussesPrix(synthese.data?.haussesPrix.length ?? 0)}
                />
              </div>
              <div className="kpi-label">Hausses de prix</div>
              <div className="kpi-value">{synthese.data?.haussesPrix.length ?? 0}</div>
              <div className="kpi-hint">vs livraison précédente</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Package size={16} />
                </span>
              </div>
              <div className="kpi-label">Commandes ouvertes</div>
              <div className="kpi-value">{kpis.commandesOuvertes ?? 0}</div>
              <div className="kpi-hint">
                {kpis.unitesARecevoir ?? 0} unité(s) à réceptionner ·{' '}
                <Link to="/achats/commandes">Commandes</Link>
              </div>
            </article>
            <article
              className={
                Number(kpis.encours ?? 0) > 0
                  ? 'kpi-card dash-kpi kpi-warning'
                  : 'kpi-card dash-kpi'
              }
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Wallet size={16} />
                </span>
              </div>
              <div className="kpi-label">Encours factures</div>
              <div className="kpi-value">{fmtMoney(kpis.encours ?? 0)}</div>
              <div className="kpi-hint">
                {kpis.facturesImpayees ?? 0} facture(s) ·{' '}
                <Link to="/achats/factures">Factures</Link>
              </div>
            </article>
          </div>

          {(synthese.data?.haussesPrix.length ?? 0) > 0 && (
            <ListPanel title="Hausses de prix d’achat">
              <table>
                <thead>
                  <tr>
                    <th>Fournisseur</th>
                    <th>Article</th>
                    <th>Prix précédent</th>
                    <th>Prix actuel</th>
                    <th>Variation</th>
                  </tr>
                </thead>
                <tbody>
                  {synthese.data!.haussesPrix.map((h) => (
                    <tr key={`${h.fournisseurId}-${h.produitId}`}>
                      <td>
                        <button type="button" onClick={() => setSelectionId(h.fournisseurId)}>
                          {h.fournisseurNom}
                        </button>
                      </td>
                      <td>{h.designation}</td>
                      <td className="money">{fmtMoney(h.prixPrecedent)} FCFA</td>
                      <td className="money">{fmtMoney(h.prixActuel)} FCFA</td>
                      <td>+{h.variationPct} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ListPanel>
          )}

          <div className="toolbar">
            <div>
              <label htmlFor="filtre-fournisseur">Rechercher</label>
              <div className="table-actions">
                <Search size={16} />
                <input
                  id="filtre-fournisseur"
                  type="search"
                  placeholder="Nom, contact, téléphone, e-mail…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
            </div>
            <label>
              <input
                type="checkbox"
                checked={masquerInactifs}
                onChange={(e) => setMasquerInactifs(e.target.checked)}
              />{' '}
              Masquer les inactifs
            </label>
          </div>

          <div
            className="dash-layout"
            style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)' }}
          >
            <ListPanel title="Annuaire">
              {synthese.data!.fournisseurs.length === 0 ? (
                <EmptyState
                  title="Aucun fournisseur"
                  description="Créez une fiche pour saisir des réceptions de stock."
                  action={
                    peutGererFiche ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setModalNouveau(true)}
                      >
                        Nouveau fournisseur
                      </button>
                    ) : undefined
                  }
                />
              ) : liste.length === 0 ? (
                <EmptyState
                  title="Aucun résultat"
                  description="Aucun fournisseur ne correspond à cette recherche."
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Contact</th>
                      <th>Réceptions</th>
                      <th>Montant cumulé</th>
                      <th>Dernière</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((f) => (
                      <tr
                        key={f.id}
                        onClick={() => setSelectionId(f.id)}
                        style={{
                          cursor: 'pointer',
                          background: f.id === selectionId ? 'var(--surface-muted, #f4f4f5)' : undefined,
                        }}
                      >
                        <td>
                          {f.nom}{' '}
                          {!f.actif && <span className="badge">Inactif</span>}
                          {f.nombreReceptions === 0 && f.actif && (
                            <span className="badge">Jamais livré</span>
                          )}
                        </td>
                        <td>
                          {f.contact ?? '—'}
                          {f.telephone ? (
                            <>
                              <br />
                              <span className="lead">{f.telephone}</span>
                            </>
                          ) : null}
                        </td>
                        <td>{f.nombreReceptions}</td>
                        <td className="money">{fmtMoney(f.montantCumule)} FCFA</td>
                        <td>{fmtDate(f.derniereReceptionAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ListPanel>

            <ListPanel title={selectionListe ? selectionListe.nom : 'Fiche fournisseur'}>
              {!selectionId && (
                <EmptyState
                  title="Sélectionnez un fournisseur"
                  description="Cliquez une ligne pour voir la fiche, l’historique et les prix."
                />
              )}
              {selectionId && detail.isLoading && (
                <LoadingState label="Chargement de la fiche..." />
              )}
              {detail.data && (
                <>
                  <p className="lead">
                    {detail.data.contact ?? 'Sans interlocuteur'}
                    {detail.data.telephone ? ` · ${detail.data.telephone}` : ''}
                    {detail.data.email ? ` · ${detail.data.email}` : ''}
                  </p>
                  {detail.data.adresse && <p className="lead">{detail.data.adresse}</p>}
                  {detail.data.notes && <p>{detail.data.notes}</p>}
                  <p className="lead">
                    {detail.data.nombreReceptions} réception(s) · {detail.data.unitesRecues}{' '}
                    unité(s) · {fmtMoney(detail.data.montantCumule)} FCFA ·{' '}
                    {detail.data.produitsDistincts} article(s)
                  </p>
                  <div className="table-actions">
                    {peutGererFiche && (
                      <button
                        type="button"
                        onClick={() => {
                          setFiche(ficheDepuis(detail.data!));
                          setFormErr(null);
                          setModalEdit(true);
                        }}
                      >
                        <Pencil size={14} /> Modifier la fiche
                      </button>
                    )}
                    {peutRecevoir && detail.data.actif && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setModalReception(true)}
                      >
                        Enregistrer une réception
                      </button>
                    )}
                  </div>
                  {!detail.data.actif && (
                    <p role="status">Fournisseur inactif — les réceptions sont bloquées.</p>
                  )}

                  {detail.data.produits.length > 0 && (
                    <>
                      <h3>Articles livrés</h3>
                      <table>
                        <thead>
                          <tr>
                            <th>Article</th>
                            <th>Unités</th>
                            <th>Dernier prix</th>
                            <th>Variation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.data.produits.map((p) => (
                            <tr key={p.produitId}>
                              <td>
                                {p.designation}
                                {p.reference ? ` · ${p.reference}` : ''}
                              </td>
                              <td>{p.unites}</td>
                              <td className="money">{fmtMoney(p.dernierPrix)} FCFA</td>
                              <td>
                                {p.variationPct === null
                                  ? '—'
                                  : `${Number(p.variationPct) > 0 ? '+' : ''}${p.variationPct} %`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  <h3>Historique des réceptions</h3>
                  {detail.data.receptions.length === 0 ? (
                    <p>Aucune réception enregistrée pour ce fournisseur.</p>
                  ) : (
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
                        </tr>
                      </thead>
                      <tbody>
                        {detail.data.receptions.map((r) => (
                          <tr key={r.id}>
                            <td>{fmtDate(r.dateReception)}</td>
                            <td>{r.produit?.designation ?? r.produitId}</td>
                            <td>{r.quantite}</td>
                            <td className="money">{fmtMoney(r.prixAchat)} FCFA</td>
                            <td className="money">{fmtMoney(r.montant)} FCFA</td>
                            <td>{r.entrepot?.nom ?? '—'}</td>
                            <td>{r.reference ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </ListPanel>
          </div>

          <ListPanel title="Journal des réceptions (récentes)">
            {(synthese.data?.receptionsRecentes.length ?? 0) === 0 ? (
              <p>Aucune réception enregistrée.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Fournisseur</th>
                    <th>Produit</th>
                    <th>Qté</th>
                    <th>Montant</th>
                    <th>Entrepôt</th>
                  </tr>
                </thead>
                <tbody>
                  {synthese.data!.receptionsRecentes.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.dateReception)}</td>
                      <td>
                        <button type="button" onClick={() => setSelectionId(r.fournisseurId)}>
                          {r.fournisseur?.nom ?? r.fournisseurId}
                        </button>
                      </td>
                      <td>{r.produit?.designation ?? r.produitId}</td>
                      <td>{r.quantite}</td>
                      <td className="money">{fmtMoney(r.montant)} FCFA</td>
                      <td>{r.entrepot?.nom ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ListPanel>
        </>
      )}

      {peutGererFiche && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouveau fournisseur"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              creer.mutate();
            }}
          >
            <FicheFournisseurFields form={fiche} onChange={setFiche} avecActif={false} />
            <button type="submit" className="btn-primary" disabled={creer.isPending}>
              Créer
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}

      {peutGererFiche && (
        <Modal
          open={modalEdit}
          onClose={() => setModalEdit(false)}
          title="Modifier la fiche"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editer.mutate();
            }}
          >
            <FicheFournisseurFields form={fiche} onChange={setFiche} avecActif />
            <button type="submit" className="btn-primary" disabled={editer.isPending}>
              Enregistrer
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}

      {peutRecevoir && selectionId && (
        <Modal
          open={modalReception}
          onClose={() => setModalReception(false)}
          title={`Réception de stock — ${detail.data?.nom ?? ''}`}
        >
          <ReceptionStockForm
            fournisseurId={selectionId}
            produits={produits.data ?? []}
            onFerme={() => setModalReception(false)}
          />
        </Modal>
      )}
    </div>
  );
}
