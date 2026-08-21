import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type {
  CommandeAchatDto,
  EntrepotDto,
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
  if (statut === 'ANNULEE') return 'badge';
  if (statut === 'CLOTUREE' || statut === 'RECEPTIONNEE') return 'badge badge-ok';
  if (statut === 'PARTIELLEMENT_RECEPTIONNEE') return 'badge badge-warning';
  return 'badge';
}

function fmt(n: string | number) {
  return Math.round(Number(n)).toLocaleString('fr-FR');
}

type LigneForm = { produitId: string; quantite: string; prixUnitaire: string };

export function CommandesAchatsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCommander = user !== null && ROLES_COMMANDE.includes(user.role);
  const peutRecevoir = user !== null && ROLES_RECEPTION.includes(user.role);

  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneForm[]>([
    { produitId: '', quantite: '1', prixUnitaire: '' },
  ]);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [ligneReception, setLigneReception] = useState<string | null>(null);
  const [qtyRec, setQtyRec] = useState('1');
  const [prixRec, setPrixRec] = useState('');
  const [entrepotId, setEntrepotId] = useState('');

  const commandes = useQuery({
    queryKey: ['achats-commandes'],
    queryFn: () => apiFetch<CommandeAchatDto[]>('/achats/commandes'),
    enabled: peutLire,
  });
  const detail = useQuery({
    queryKey: ['achats-commandes', selectionId],
    queryFn: () => apiFetch<CommandeAchatDto>(`/achats/commandes/${selectionId}`),
    enabled: peutLire && selectionId !== null,
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: () => apiFetch<FournisseurDto[]>('/fournisseurs'),
    enabled: peutCommander,
  });
  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled: peutCommander,
  });
  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutRecevoir,
  });

  const actifs = useMemo(
    () => (produits.data ?? []).filter((p) => p.actif),
    [produits.data],
  );
  const fournActifs = useMemo(
    () => (fournisseurs.data ?? []).filter((f) => f.actif),
    [fournisseurs.data],
  );

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['achats-commandes'] });
    void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
  }

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>('/achats/commandes', {
        method: 'POST',
        body: JSON.stringify({
          fournisseurId,
          notes: notes.trim() || undefined,
          lignes: lignes
            .filter((l) => l.produitId && Number(l.quantite) > 0 && Number(l.prixUnitaire) > 0)
            .map((l) => ({
              produitId: l.produitId,
              quantite: Number(l.quantite),
              prixUnitaire: Number(l.prixUnitaire),
            })),
        }),
      }),
    onSuccess: (c) => {
      setModalNouveau(false);
      setSelectionId(c.id);
      setFormErr(null);
      invalider();
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Création refusée.')),
  });

  function action(path: string) {
    return apiFetch<CommandeAchatDto>(path, { method: 'POST' });
  }

  const confirmer = useMutation({
    mutationFn: () => action(`/achats/commandes/${selectionId}/confirmer`),
    onSuccess: invalider,
  });
  const annuler = useMutation({
    mutationFn: () => action(`/achats/commandes/${selectionId}/annuler`),
    onSuccess: invalider,
  });
  const cloturer = useMutation({
    mutationFn: () => action(`/achats/commandes/${selectionId}/cloturer`),
    onSuccess: invalider,
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
      invalider();
      if (selectionId) {
        void queryClient.invalidateQueries({ queryKey: ['achats-commandes', selectionId] });
      }
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Réception refusée.')),
  });

  if (!peutLire) return <p>Vous n’avez pas accès aux commandes d’achat.</p>;

  const c = detail.data;

  return (
    <div>
      <PageHeader
        title="Bons de commande"
        subtitle="Cycle Achats : brouillon → confirmée → réception (plafonnée à la quantité commandée) → clôture. Pas d’écriture de caisse."
        actions={
          peutCommander ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFournisseurId(fournActifs[0]?.id ?? '');
                setLignes([
                  {
                    produitId: actifs[0]?.id ?? '',
                    quantite: '1',
                    prixUnitaire: '',
                  },
                ]);
                setNotes('');
                setFormErr(null);
                setModalNouveau(true);
              }}
            >
              Nouvelle commande
            </button>
          ) : undefined
        }
      />

      {commandes.isLoading && <LoadingState label="Chargement des commandes..." />}
      {commandes.isError && <p role="alert">Erreur de chargement des commandes.</p>}

      {commandes.data && (
        <div
          className="dash-layout"
          style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}
        >
          <ListPanel title="Commandes">
            {commandes.data.length === 0 ? (
              <EmptyState
                title="Aucune commande"
                description="Créez un bon de commande puis confirmez-le avant de réceptionner."
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fournisseur</th>
                    <th>Statut</th>
                    <th>Montant</th>
                    <th>Réception</th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.data.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectionId(row.id)}
                      style={{
                        cursor: 'pointer',
                        background:
                          row.id === selectionId ? 'var(--surface-muted, #f4f4f5)' : undefined,
                      }}
                    >
                      <td>{row.numero}</td>
                      <td>{row.fournisseur.nom}</td>
                      <td>
                        <span className={badge(row.statut)}>{STATUT[row.statut]}</span>
                      </td>
                      <td className="money">{fmt(row.montant)} FCFA</td>
                      <td>
                        {row.quantiteRecue}/{row.quantite}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ListPanel>

          <ListPanel title={c ? c.numero : 'Détail'}>
            {!selectionId && (
              <EmptyState title="Sélectionnez une commande" description="Cliquez une ligne." />
            )}
            {selectionId && detail.isLoading && <LoadingState label="Chargement..." />}
            {c && (
              <>
                <p className="lead">
                  {c.fournisseur.nom} · {STATUT[c.statut]} · {fmt(c.montant)} FCFA
                </p>
                {c.notes && <p>{c.notes}</p>}
                <div className="table-actions">
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
                    <button type="button" onClick={() => cloturer.mutate()}>
                      Clôturer
                    </button>
                  )}
                  <Link to="/achats/factures">Facturer les réceptions →</Link>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th>Commandé</th>
                      <th>Reçu</th>
                      <th>Reste</th>
                      <th>Prix</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lignes.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.designation}
                          {l.reference ? ` · ${l.reference}` : ''}
                        </td>
                        <td>{l.quantite}</td>
                        <td>{l.quantiteRecue}</td>
                        <td>{l.quantiteRestante}</td>
                        <td className="money">{fmt(l.prixUnitaire)}</td>
                        <td>
                          {peutRecevoir &&
                            l.quantiteRestante > 0 &&
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </ListPanel>
        </div>
      )}

      {peutCommander && (
        <Modal open={modalNouveau} onClose={() => setModalNouveau(false)} title="Nouveau bon de commande">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              creer.mutate();
            }}
          >
            <div>
              <label htmlFor="bc-fourn">Fournisseur</label>
              <select
                id="bc-fourn"
                value={fournisseurId}
                onChange={(e) => setFournisseurId(e.target.value)}
                required
              >
                {fournActifs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
            </div>
            {lignes.map((l, i) => (
              <div key={i} className="table-actions" style={{ alignItems: 'end' }}>
                <div>
                  <label>Article</label>
                  <select
                    value={l.produitId}
                    onChange={(e) => {
                      const next = [...lignes];
                      next[i] = { ...next[i], produitId: e.target.value };
                      setLignes(next);
                    }}
                  >
                    {actifs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.designation}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Qté</label>
                  <input
                    type="number"
                    min="1"
                    value={l.quantite}
                    onChange={(e) => {
                      const next = [...lignes];
                      next[i] = { ...next[i], quantite: e.target.value };
                      setLignes(next);
                    }}
                  />
                </div>
                <div>
                  <label>Prix achat</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={l.prixUnitaire}
                    onChange={(e) => {
                      const next = [...lignes];
                      next[i] = { ...next[i], prixUnitaire: e.target.value };
                      setLignes(next);
                    }}
                    required
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setLignes([
                  ...lignes,
                  { produitId: actifs[0]?.id ?? '', quantite: '1', prixUnitaire: '' },
                ])
              }
            >
              Ajouter une ligne
            </button>
            <div>
              <label htmlFor="bc-notes">Notes</label>
              <textarea id="bc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={creer.isPending}>
              Enregistrer le brouillon
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}

      {c && ligneReception && (
        <Modal
          open
          onClose={() => setLigneReception(null)}
          title="Réception sur commande"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              receptionner.mutate();
            }}
          >
            <p className="lead">La quantité ne peut pas dépasser le reste commandé.</p>
            <div>
              <label>Quantité</label>
              <input type="number" min="1" value={qtyRec} onChange={(e) => setQtyRec(e.target.value)} />
            </div>
            <div>
              <label>Prix d’achat réel</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={prixRec}
                onChange={(e) => setPrixRec(e.target.value)}
              />
            </div>
            <div>
              <label>Entrepôt</label>
              <select value={entrepotId} onChange={(e) => setEntrepotId(e.target.value)}>
                <option value="">Défaut</option>
                {(entrepots.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={receptionner.isPending}>
              Enregistrer
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}
    </div>
  );
}
