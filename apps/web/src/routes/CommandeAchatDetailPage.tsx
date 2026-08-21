import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type { CommandeAchatDto, EntrepotDto } from '../lib/types';

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

const ROLES_COMMANDE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

const ROLES_RECEPTION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

const STATUT: Record<CommandeAchatDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  CONFIRMEE: 'Confirmée',
  PARTIELLEMENT_RECEPTIONNEE: 'Réception partielle',
  RECEPTIONNEE: 'Réceptionnée',
  CLOTUREE: 'Clôturée',
  ANNULEE: 'Annulée',
};

function badge(statut: CommandeAchatDto['statut']) {
  if (statut === 'ANNULEE') return 'badge badge-neutral';
  if (statut === 'CLOTUREE' || statut === 'RECEPTIONNEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_RECEPTIONNEE') return 'badge badge-warning';
  return 'badge';
}

function fmt(n: string | number) {
  return Math.round(Number(n)).toLocaleString('fr-FR');
}

export function CommandeAchatDetailPage() {
  const { commandeId } = useParams<{ commandeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCommander = user !== null && ROLES_COMMANDE.includes(user.role);
  const peutRecevoir = user !== null && ROLES_RECEPTION.includes(user.role);

  const [ligneReception, setLigneReception] = useState<string | null>(null);
  const [qtyRec, setQtyRec] = useState('1');
  const [prixRec, setPrixRec] = useState('');
  const [entrepotId, setEntrepotId] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

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

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['achats-commandes'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
  }

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
  const pct = c.quantite === 0 ? 0 : Math.round((c.quantiteRecue / c.quantite) * 100);

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/achats/commandes')}>
          ← Commandes
        </button>
        <div className="client-workspace-toolbar-actions">
          <Link to={`/fournisseurs/${c.fournisseurId}`} className="stock-row-link">
            Fiche fournisseur
          </Link>
          <Link to="/achats/factures" className="stock-row-link">
            Facturer
          </Link>
          {peutCommander && c.statut === 'BROUILLON' && (
            <>
              <button type="button" className="btn-primary" onClick={() => confirmer.mutate()}>
                Confirmer
              </button>
              <button type="button" onClick={() => annuler.mutate()}>
                Annuler
              </button>
            </>
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
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          BC
        </div>
        <div className="client-workspace-hero-main">
          <h1>{c.numero}</h1>
          <p className="client-workspace-hero-sub">{c.fournisseur.nom}</p>
          <div className="client-workspace-chips">
            <span className={badge(c.statut)}>{STATUT[c.statut]}</span>
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Commandé</strong> {new Date(c.dateCommande).toLocaleString('fr-FR')}
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
          </div>
        </div>
      </header>

      {c.notes && <p>{c.notes}</p>}
      {formErr && <p role="alert">{formErr}</p>}

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">Montant</div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {fmt(c.montant)} FCFA
          </div>
          <div className="client-kpi-hint">qty × prix commandé</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">Réception</div>
          <div className="client-kpi-value">
            {c.quantiteRecue}/{c.quantite}
          </div>
          <div className="client-kpi-hint">{pct} % reçu</div>
          <div className="inventaire-progress" aria-hidden>
            <span style={{ width: `${pct}%` }} />
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
                <th>Commandé</th>
                <th>Reçu</th>
                <th>Reste</th>
                <th>Prix</th>
                <th>Montant</th>
                {peutRecevoir ? <th></th> : null}
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
                  <td className="money">{fmt(l.prixUnitaire)}</td>
                  <td className="money">{fmt(l.montant)} FCFA</td>
                  {peutRecevoir ? (
                    <td>
                      {l.quantiteRestante > 0 &&
                        (c.statut === 'CONFIRMEE' ||
                          c.statut === 'PARTIELLEMENT_RECEPTIONNEE') && (
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
            <label>Quantité</label>
            <input
              type="number"
              min="1"
              value={qtyRec}
              onChange={(e) => setQtyRec(e.target.value)}
            />
            <label>Prix d’achat réel</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={prixRec}
              onChange={(e) => setPrixRec(e.target.value)}
            />
            <label>Entrepôt</label>
            <select value={entrepotId} onChange={(e) => setEntrepotId(e.target.value)}>
              <option value="">Défaut</option>
              {(entrepots.data ?? []).map((e) => (
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
    </div>
  );
}
