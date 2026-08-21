import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type { CommandeAchatDto, FournisseurDto, ProduitDto } from '../lib/types';

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

type LigneForm = { produitId: string; quantite: string; prixUnitaire: string };

export function CommandesAchatsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCommander = user !== null && ROLES_COMMANDE.includes(user.role);

  const [filtreStatut, setFiltreStatut] = useState<CommandeAchatDto['statut'] | ''>('');
  const [modalNouveau, setModalNouveau] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneForm[]>([
    { produitId: '', quantite: '1', prixUnitaire: '' },
  ]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const commandes = useQuery({
    queryKey: ['achats-commandes'],
    queryFn: () => apiFetch<CommandeAchatDto[]>('/achats/commandes'),
    enabled: peutLire,
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

  const actifs = useMemo(
    () => (produits.data ?? []).filter((p) => p.actif),
    [produits.data],
  );
  const fournActifs = useMemo(
    () => (fournisseurs.data ?? []).filter((f) => f.actif),
    [fournisseurs.data],
  );
  const liste = useMemo(
    () =>
      (commandes.data ?? []).filter((c) =>
        filtreStatut ? c.statut === filtreStatut : true,
      ),
    [commandes.data, filtreStatut],
  );

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
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['achats-commandes'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
      navigate(`/achats/commandes/${c.id}`);
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Création refusée.')),
  });

  if (!peutLire) return <p>Vous n’avez pas accès aux commandes d’achat.</p>;

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
        <>
          <div className="toolbar">
            <div>
              <label htmlFor="filtre-bc-statut">Statut</label>
              <select
                id="filtre-bc-statut"
                value={filtreStatut}
                onChange={(e) =>
                  setFiltreStatut(e.target.value as CommandeAchatDto['statut'] | '')
                }
              >
                <option value="">Tous</option>
                {(Object.keys(STATUT) as CommandeAchatDto['statut'][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUT[s]}
                  </option>
                ))}
              </select>
            </div>
            <p className="lead">
              {liste.length} commande(s)
              {filtreStatut ? ` · ${STATUT[filtreStatut]}` : ''}
            </p>
          </div>
          <ListPanel title="Commandes">
            {commandes.data.length === 0 ? (
              <EmptyState
                title="Aucune commande"
                description="Créez un bon de commande puis confirmez-le avant de réceptionner."
              />
            ) : liste.length === 0 ? (
              <EmptyState
                title="Aucun résultat"
                description="Aucune commande ne correspond à ce statut."
              />
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Fournisseur</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Réception</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((row) => (
                      <tr
                        key={row.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        aria-label={`Ouvrir ${row.numero}`}
                        onClick={() => navigate(`/achats/commandes/${row.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/commandes/${row.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{row.numero}</strong>
                        </td>
                        <td>{row.fournisseur.nom}</td>
                        <td>
                          <span className={badge(row.statut)}>{STATUT[row.statut]}</span>
                        </td>
                        <td>{new Date(row.dateCommande).toLocaleDateString('fr-FR')}</td>
                        <td className="money">{fmt(row.montant)} FCFA</td>
                        <td>
                          {row.quantiteRecue}/{row.quantite}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ListPanel>
        </>
      )}

      {peutCommander && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouveau bon de commande"
          size="lg"
        >
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
              <textarea
                id="bc-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={creer.isPending}>
              Enregistrer le brouillon
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}
    </div>
  );
}
