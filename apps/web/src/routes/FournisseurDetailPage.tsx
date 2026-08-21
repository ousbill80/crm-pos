import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { ReceptionStockForm } from './FournisseursPage';
import type { FournisseurDetailDto, FournisseurDto, ProduitDto } from '../lib/types';

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutGererFiche = user !== null && ROLES_FICHE.includes(user.role);
  const peutRecevoir = user !== null && ROLES_RECEPTION.includes(user.role);

  const [modalEdit, setModalEdit] = useState(false);
  const [modalReception, setModalReception] = useState(false);
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

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/fournisseurs')}>
          ← Fournisseurs
        </button>
        <div className="client-workspace-toolbar-actions">
          <Link to="/achats/commandes" className="stock-row-link">
            Commandes
          </Link>
          <Link to="/achats/factures" className="stock-row-link">
            Factures
          </Link>
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
              Réception
            </button>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          {f.nom.slice(0, 2).toUpperCase()}
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
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Adresse</strong> {f.adresse ?? '—'}
            </span>
            <span>
              <strong>Dernière réception</strong> {fmtDate(f.derniereReceptionAt)}
            </span>
          </div>
        </div>
      </header>

      {!f.actif && (
        <p role="status">Fournisseur inactif — les réceptions sont bloquées.</p>
      )}
      {f.notes && <p>{f.notes}</p>}

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">Réceptions</div>
          <div className="client-kpi-value">{f.nombreReceptions}</div>
          <div className="client-kpi-hint">{f.unitesRecues} unité(s)</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Montant cumulé</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {fmtMoney(f.montantCumule)} FCFA
          </div>
          <div className="client-kpi-hint">qty × prix d’achat</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Articles</div>
          <div className="client-kpi-value">{f.produitsDistincts}</div>
          <div className="client-kpi-hint">références distinctes</div>
        </article>
      </div>

      {f.produits.length > 0 && (
        <section className="client-workspace-section">
          <h2>Articles livrés</h2>
          <div className="clients-table-wrap">
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
                {f.produits.map((p) => (
                  <tr key={p.produitId}>
                    <td>
                      <Link className="link-button" to={`/produits/${p.produitId}`}>
                        {p.designation}
                      </Link>
                      {p.reference ? (
                        <div className="kpi-hint" style={{ margin: 0 }}>
                          {p.reference}
                        </div>
                      ) : null}
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
          </div>
        </section>
      )}

      <section className="client-workspace-section">
        <h2>Historique des réceptions</h2>
        {f.receptions.length === 0 ? (
          <p className="lead">Aucune réception enregistrée pour ce fournisseur.</p>
        ) : (
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
                </tr>
              </thead>
              <tbody>
                {f.receptions.map((r) => (
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
                    <td className="money">{fmtMoney(r.prixAchat)} FCFA</td>
                    <td className="money">{fmtMoney(r.montant)} FCFA</td>
                    <td>
                      {r.entrepotId ? (
                        <Link className="link-button" to={`/stocks/entrepots/${r.entrepotId}`}>
                          {r.entrepot?.nom ?? r.entrepotId}
                        </Link>
                      ) : (
                        r.entrepot?.nom ?? '—'
                      )}
                    </td>
                    <td>{r.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {peutGererFiche && fiche && (
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
    </div>
  );
}
