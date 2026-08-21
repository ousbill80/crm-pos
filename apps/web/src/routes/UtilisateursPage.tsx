import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, UserPlus } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type { BoutiqueDto, UtilisateurDto } from '../lib/types';

// Administration des comptes utilisateurs (§4, §6.2) — miroir des
// constantes access-scope.constants.ts côté API.
const ROLES_ADMIN: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];
const ROLES_LECTURE: RoleLibelle[] = [
  ...ROLES_ADMIN,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];
const ROLES_BOUTIQUE_REQUISE: RoleLibelle[] = [
  RoleLibelle.SUPERVISEUR_ZONE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
  RoleLibelle.CONVOYEUR,
];
const TOUS_LES_ROLES: RoleLibelle[] = Object.values(RoleLibelle);

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

function estVerrouille(lockedUntil: string | null): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now();
}

type FicheForm = {
  login: string;
  nom: string;
  prenom: string;
  role: RoleLibelle;
  boutiqueId: string;
  password: string;
};

const FICHE_VIDE: FicheForm = {
  login: '',
  nom: '',
  prenom: '',
  role: RoleLibelle.CAISSIER_BOUTIQUE,
  boutiqueId: '',
  password: '',
};

function useBoutiques() {
  return useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
  });
}

export function UtilisateursPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN.includes(user.role);

  const [modalNouveau, setModalNouveau] = useState(false);
  const [fiche, setFiche] = useState<FicheForm>(FICHE_VIDE);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [motDePasseTemporaire, setMotDePasseTemporaire] = useState<{
    login: string;
    password: string;
  } | null>(null);

  const { data: boutiques } = useBoutiques();
  const liste = useQuery({
    queryKey: ['utilisateurs'],
    queryFn: () => apiFetch<UtilisateurDto[]>('/users'),
    enabled: peutLire,
  });

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
  }

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<UtilisateurDto & { temporaryPassword: string }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          login: fiche.login.trim(),
          nom: fiche.nom.trim(),
          prenom: fiche.prenom.trim(),
          role: fiche.role,
          boutiqueId: ROLES_BOUTIQUE_REQUISE.includes(fiche.role)
            ? fiche.boutiqueId || undefined
            : undefined,
          password: fiche.password.trim() || undefined,
        }),
      }),
    onSuccess: (created) => {
      setModalNouveau(false);
      setFiche(FICHE_VIDE);
      setFormErr(null);
      setMotDePasseTemporaire({ login: created.login, password: created.temporaryPassword });
      invalider();
      navigate(`/utilisateurs/${created.id}`);
    },
    onError: (err) => setFormErr(messageDepuisApi(err, "Échec de la création de l'utilisateur.")),
  });

  const boutiqueRequisePourFiche = ROLES_BOUTIQUE_REQUISE.includes(fiche.role);

  const lignes = useMemo(() => liste.data ?? [], [liste.data]);

  if (!peutLire) {
    return <p>Vous n’avez pas accès à la gestion des utilisateurs.</p>;
  }

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes, rôles et sécurité des accès — administration réservée Responsable SI / Direction Générale (§4, §6.2)"
        actions={
          peutAdmin && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFiche(FICHE_VIDE);
                setFormErr(null);
                setModalNouveau(true);
              }}
            >
              <UserPlus size={16} /> Nouvel utilisateur
            </button>
          )
        }
      />

      {motDePasseTemporaire && (
        <div className="panel" role="alert" style={{ borderColor: 'var(--warning)' }}>
          <p>
            Mot de passe temporaire pour <strong>{motDePasseTemporaire.login}</strong> :{' '}
            <code>{motDePasseTemporaire.password}</code>
          </p>
          <p className="lead">
            À transmettre à l’utilisateur par un canal sûr — il ne sera plus jamais affiché et devra
            être changé à la prochaine connexion.
          </p>
          <button type="button" onClick={() => setMotDePasseTemporaire(null)}>
            Fermer
          </button>
        </div>
      )}

      {liste.isLoading && <LoadingState label="Chargement des utilisateurs..." />}
      {liste.isError && <p role="alert">Erreur lors du chargement des utilisateurs.</p>}

      {!liste.isLoading && !liste.isError && (
        <ListPanel title="Annuaire des comptes">
          {lignes.length === 0 ? (
            <EmptyState title="Aucun utilisateur" description="Créez le premier compte." />
          ) : (
            <div className="clients-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Boutique</th>
                    <th>Statut</th>
                    <th>Créé le</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((u) => (
                    <tr
                      key={u.id}
                      className="produit-row"
                      tabIndex={0}
                      role="link"
                      aria-label={`Ouvrir ${u.prenom} ${u.nom}`}
                      onClick={() => navigate(`/utilisateurs/${u.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/utilisateurs/${u.id}`);
                        }
                      }}
                    >
                      <td>
                        <strong>
                          {u.prenom} {u.nom}
                        </strong>
                        <br />
                        <span className="lead">{u.login}</span>
                      </td>
                      <td>{u.role.libelle}</td>
                      <td>{boutiques?.find((b) => b.id === u.boutiqueId)?.nom ?? '—'}</td>
                      <td>
                        {!u.actif && <span className="badge">Inactif</span>}{' '}
                        {u.mustChangePassword && (
                          <span className="badge badge-warning">Mdp à changer</span>
                        )}{' '}
                        {estVerrouille(u.lockedUntil) && (
                          <span className="badge badge-critical">
                            <ShieldAlert size={12} /> Verrouillé jusqu’à {fmtDate(u.lockedUntil)}
                          </span>
                        )}
                        {u.actif && !u.mustChangePassword && !estVerrouille(u.lockedUntil) && (
                          <span className="badge badge-ok">Actif</span>
                        )}
                      </td>
                      <td>{fmtDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ListPanel>
      )}

      {peutAdmin && (
        <Modal open={modalNouveau} onClose={() => setModalNouveau(false)} title="Nouvel utilisateur">
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              creer.mutate();
            }}
          >
            <div>
              <label htmlFor="user-login">Identifiant de connexion</label>
              <input
                id="user-login"
                value={fiche.login}
                onChange={(e) => setFiche({ ...fiche, login: e.target.value })}
                required
                minLength={2}
              />
            </div>
            <div>
              <label htmlFor="user-nom">Nom</label>
              <input
                id="user-nom"
                value={fiche.nom}
                onChange={(e) => setFiche({ ...fiche, nom: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="user-prenom">Prénom</label>
              <input
                id="user-prenom"
                value={fiche.prenom}
                onChange={(e) => setFiche({ ...fiche, prenom: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="user-role">Rôle</label>
              <select
                id="user-role"
                value={fiche.role}
                onChange={(e) => setFiche({ ...fiche, role: e.target.value as RoleLibelle })}
              >
                {TOUS_LES_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            {boutiqueRequisePourFiche && (
              <div>
                <label htmlFor="user-boutique">Boutique</label>
                <select
                  id="user-boutique"
                  value={fiche.boutiqueId}
                  onChange={(e) => setFiche({ ...fiche, boutiqueId: e.target.value })}
                  required
                >
                  <option value="">— Choisir —</option>
                  {(boutiques ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="user-password">Mot de passe temporaire (optionnel)</label>
              <input
                id="user-password"
                type="password"
                value={fiche.password}
                onChange={(e) => setFiche({ ...fiche, password: e.target.value })}
                minLength={8}
                placeholder="Laisser vide pour générer automatiquement"
              />
            </div>
            <p className="lead">
              L’utilisateur devra changer ce mot de passe dès sa première connexion.
            </p>
            <button type="submit" className="btn-primary" disabled={creer.isPending}>
              Créer
            </button>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}

    </div>
  );
}
