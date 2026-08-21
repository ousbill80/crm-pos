import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/PageChrome';
import type {
  BoutiqueDto,
  JournalAuditPageDto,
  UtilisateurDto,
} from '../lib/types';

const ROLES_ADMIN: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];
const ROLES_LECTURE: RoleLibelle[] = [
  ...ROLES_ADMIN,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];
const ROLES_LECTURE_AUDIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
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

type Onglet = 'identite' | 'securite' | 'activite';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

function estVerrouille(lockedUntil: string | null): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now();
}

export function UtilisateurDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN.includes(user.role);
  const peutLireAudit =
    user !== null && ROLES_LECTURE_AUDIT.includes(user.role);

  const [onglet, setOnglet] = useState<Onglet>('identite');
  const [error, setError] = useState<string | null>(null);
  const [mdpTemp, setMdpTemp] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['utilisateurs', userId],
    queryFn: () => apiFetch<UtilisateurDto>(`/users/${userId}`),
    enabled: peutLire && !!userId,
  });

  const boutiques = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: peutLire,
  });

  const activite = useQuery({
    queryKey: ['audit', 'user', userId],
    queryFn: () =>
      apiFetch<JournalAuditPageDto>(
        `/audit?utilisateurId=${userId}&limit=50&page=1`,
      ),
    enabled: peutLireAudit && !!userId && onglet === 'activite',
  });

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [role, setRole] = useState<RoleLibelle>(RoleLibelle.CAISSIER_BOUTIQUE);
  const [boutiqueId, setBoutiqueId] = useState('');

  useEffect(() => {
    if (!detail.data) return;
    setNom(detail.data.nom);
    setPrenom(detail.data.prenom);
    setRole(detail.data.role.libelle);
    setBoutiqueId(detail.data.boutiqueId ?? '');
  }, [detail.data]);

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
    void queryClient.invalidateQueries({ queryKey: ['utilisateurs', userId] });
  }

  const modifier = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<UtilisateurDto>(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setError(null);
      invalider();
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Échec de la modification.')),
  });

  const resetMdp = useMutation({
    mutationFn: () =>
      apiFetch<{ temporaryPassword: string }>(
        `/users/${userId}/reset-password`,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    onSuccess: (res) => {
      setMdpTemp(res.temporaryPassword);
      invalider();
    },
    onError: (err) =>
      setError(messageDepuisApi(err, 'Échec de la réinitialisation.')),
  });

  if (!userId) {
    return <p role="alert">Utilisateur introuvable.</p>;
  }
  if (!user) {
    return <LoadingState label="Chargement…" />;
  }
  if (!peutLire) {
    return <p>Vous n’avez pas accès à la gestion des utilisateurs.</p>;
  }
  if (detail.isLoading) {
    return <LoadingState label="Chargement de l’utilisateur…" />;
  }
  if (detail.isError || !detail.data) {
    return (
      <p role="alert">
        Impossible de charger cet utilisateur.{' '}
        <Link to="/utilisateurs">Retour</Link>
      </p>
    );
  }

  const u = detail.data;
  const boutiqueNom =
    boutiques.data?.find((b) => b.id === u.boutiqueId)?.nom ?? '—';
  const boutiqueRequise = ROLES_BOUTIQUE_REQUISE.includes(role);

  function onSaveIdentite(e: FormEvent) {
    e.preventDefault();
    modifier.mutate({
      nom: nom.trim(),
      prenom: prenom.trim(),
      role,
      boutiqueId: boutiqueRequise ? boutiqueId || null : null,
    });
  }

  return (
    <div className="user-fiche">
      <button
        type="button"
        className="btn-ghost user-fiche-back"
        onClick={() => navigate('/utilisateurs')}
      >
        <ArrowLeft size={16} /> Annuaire
      </button>

      <header className="user-fiche-hero">
        <div>
          <h1>
            {u.prenom} {u.nom}
          </h1>
          <p className="lead">
            {u.login} · {u.role.libelle}
            {u.boutiqueId ? ` · ${boutiqueNom}` : ' · Réseau entier'}
          </p>
        </div>
        <div className="cfg-chip-row">
          {!u.actif && <span className="badge">Inactif</span>}
          {u.mustChangePassword && (
            <span className="badge badge-warning">Mdp à changer</span>
          )}
          {estVerrouille(u.lockedUntil) && (
            <span className="badge badge-critical">
              <ShieldAlert size={12} /> Verrouillé
            </span>
          )}
          {u.actif && !u.mustChangePassword && !estVerrouille(u.lockedUntil) && (
            <span className="badge badge-ok">Actif</span>
          )}
        </div>
      </header>

      {mdpTemp && (
        <div className="panel" role="alert" style={{ borderColor: 'var(--warning)' }}>
          <p>
            Mot de passe temporaire : <code>{mdpTemp}</code>
          </p>
          <p className="lead">
            À transmettre par un canal sûr — changement forcé à la prochaine
            connexion.
          </p>
          <button type="button" onClick={() => setMdpTemp(null)}>
            Fermer
          </button>
        </div>
      )}

      <nav className="user-fiche-tabs" aria-label="Sections fiche">
        {(
          [
            ['identite', 'Identité'],
            ['securite', 'Sécurité'],
            ...(peutLireAudit ? [['activite', 'Activité'] as const] : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={onglet === id ? 'actif' : ''}
            onClick={() => setOnglet(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {onglet === 'identite' && (
        <section className="panel">
          {peutAdmin ? (
            <form className="cfg-form" onSubmit={onSaveIdentite}>
              <div className="cfg-form-grid">
                <div>
                  <label htmlFor="u-login">Login</label>
                  <input id="u-login" value={u.login} disabled />
                </div>
                <div>
                  <label htmlFor="u-created">Créé le</label>
                  <input id="u-created" value={fmtDate(u.createdAt)} disabled />
                </div>
                <div>
                  <label htmlFor="u-nom">Nom</label>
                  <input
                    id="u-nom"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="u-prenom">Prénom</label>
                  <input
                    id="u-prenom"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="u-role">Rôle</label>
                  <select
                    id="u-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as RoleLibelle)}
                  >
                    {TOUS_LES_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                {boutiqueRequise && (
                  <div>
                    <label htmlFor="u-boutique">Boutique</label>
                    <select
                      id="u-boutique"
                      value={boutiqueId}
                      onChange={(e) => setBoutiqueId(e.target.value)}
                      required
                    >
                      <option value="">— Choisir —</option>
                      {(boutiques.data ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="cfg-form-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={modifier.isPending}
                >
                  {modifier.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          ) : (
            <dl className="user-fiche-dl">
              <div>
                <dt>Login</dt>
                <dd>{u.login}</dd>
              </div>
              <div>
                <dt>Nom</dt>
                <dd>
                  {u.prenom} {u.nom}
                </dd>
              </div>
              <div>
                <dt>Rôle</dt>
                <dd>{u.role.libelle}</dd>
              </div>
              <div>
                <dt>Boutique</dt>
                <dd>{boutiqueNom}</dd>
              </div>
              <div>
                <dt>Créé le</dt>
                <dd>{fmtDate(u.createdAt)}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {onglet === 'securite' && (
        <section className="panel">
          <dl className="user-fiche-dl">
            <div>
              <dt>Statut</dt>
              <dd>{u.actif ? 'Actif' : 'Inactif'}</dd>
            </div>
            <div>
              <dt>Mot de passe</dt>
              <dd>
                {u.mustChangePassword
                  ? 'Changement forcé à la prochaine connexion'
                  : 'À jour'}
              </dd>
            </div>
            <div>
              <dt>Échecs de connexion</dt>
              <dd>{u.failedLoginAttempts}</dd>
            </div>
            <div>
              <dt>Verrouillage</dt>
              <dd>
                {estVerrouille(u.lockedUntil)
                  ? `Jusqu’à ${fmtDate(u.lockedUntil)}`
                  : 'Non'}
              </dd>
            </div>
          </dl>
          {peutAdmin && (
            <div className="cfg-form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={resetMdp.isPending}
                onClick={() => resetMdp.mutate()}
              >
                <KeyRound size={14} /> Réinitialiser le mot de passe
              </button>
              {u.id !== user.userId && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={modifier.isPending}
                  onClick={() => modifier.mutate({ actif: !u.actif })}
                >
                  {u.actif ? 'Désactiver le compte' : 'Réactiver le compte'}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {onglet === 'activite' && peutLireAudit && (
        <section className="panel">
          {activite.isLoading && (
            <LoadingState label="Chargement de l’activité…" />
          )}
          {activite.isError && (
            <p role="alert">Impossible de charger le journal d’audit.</p>
          )}
          {activite.data && activite.data.data.length === 0 && (
            <EmptyState
              title="Aucune activité"
              description="Aucune entrée d’audit pour ce compte."
            />
          )}
          {activite.data && activite.data.data.length > 0 && (
            <div className="clients-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Entité</th>
                    <th>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {activite.data.data.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.dateHeure)}</td>
                      <td>
                        <span className="badge badge-ok">{e.action}</span>
                      </td>
                      <td>
                        {e.entite}{' '}
                        <span className="lead">{e.entiteId.slice(0, 8)}…</span>
                      </td>
                      <td className="lead">
                        {e.details
                          ? e.details.length > 80
                            ? `${e.details.slice(0, 80)}…`
                            : e.details
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
