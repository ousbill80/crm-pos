import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import {
  APP_PROFIL_IDS,
  APP_PROFIL_LIBELLES,
  FAMILLE_PROFIL_LIBELLES,
  LISTE_PROFILS,
  RoleLibelle,
  labelPerimetre,
  labelValidation,
  profilOf,
  rolesPourApp,
  type ProfilMetier,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import type { UtilisateurDto } from '../lib/types';

const ROLES_LECTURE: RoleLibelle[] = rolesPourApp('settings');

function menusDuProfil(profil: ProfilMetier): string[] {
  const lignes: string[] = [];
  for (const appId of APP_PROFIL_IDS) {
    const acces = profil.apps[appId];
    if (acces === undefined) continue;
    const nom = APP_PROFIL_LIBELLES[appId];
    if (acces === true) {
      lignes.push(nom);
    } else {
      lignes.push(`${nom} (${acces.join(', ')})`);
    }
  }
  return lignes;
}

export function ProfilsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);

  const selectedRole = (params.get('role') as RoleLibelle | null) ?? RoleLibelle.CAISSIER_BOUTIQUE;
  const profil = profilOf(selectedRole);

  const users = useQuery({
    queryKey: ['utilisateurs'],
    queryFn: () => apiFetch<UtilisateurDto[]>('/users'),
    enabled: peutLire,
  });

  const effectifs = useMemo(() => {
    const map = new Map<RoleLibelle, number>();
    for (const u of users.data ?? []) {
      const role = u.role.libelle;
      map.set(role, (map.get(role) ?? 0) + 1);
    }
    return map;
  }, [users.data]);

  if (!peutLire) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="profils-page">
      <PageHeader
        title="Profils"
        subtitle="Habilitations figées du cahier des charges (§4, §6.2) — on assigne un profil à un compte, on n’invente pas de droits."
      />

      <p className="lead profils-avertissement">
        Les 10 profils sont un catalogue fermé. Un caissier boutique ne peut pas
        recevoir le droit de réceptionner ou valider un versement.
      </p>

      <div className="profils-layout">
        <nav className="profils-liste" aria-label="Profils métier">
          {[...new Set(LISTE_PROFILS.map((p) => p.famille))].map((famille) => (
            <div key={famille} className="profils-famille">
              <h2>{FAMILLE_PROFIL_LIBELLES[famille]}</h2>
              {LISTE_PROFILS.filter((p) => p.famille === famille).map((p) => (
                <button
                  key={p.role}
                  type="button"
                  className={
                    p.role === selectedRole
                      ? 'profils-item actif'
                      : 'profils-item'
                  }
                  onClick={() => setParams({ role: p.role })}
                >
                  <strong>{p.libelle}</strong>
                  <span>
                    {labelPerimetre(p.perimetre)}
                    {users.isSuccess && (
                      <> · {effectifs.get(p.role) ?? 0} compte(s)</>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {profil && (
          <article className="profils-fiche panel">
            <header className="profils-fiche-head">
              <Shield size={20} />
              <div>
                <p className="pl-eyebrow">{FAMILLE_PROFIL_LIBELLES[profil.famille]}</p>
                <h2>{profil.libelle}</h2>
              </div>
            </header>

            <dl className="profils-dl">
              <div>
                <dt>Périmètre de données</dt>
                <dd>{labelPerimetre(profil.perimetre)}</dd>
              </div>
              <div>
                <dt>Réception / validation §6.4</dt>
                <dd>{labelValidation(profil.validationCircuit)}</dd>
              </div>
              <div>
                <dt>Boutique obligatoire</dt>
                <dd>{profil.boutiqueRequise ? 'Oui' : 'Non — profil réseau / système'}</dd>
              </div>
              <div>
                <dt>Écran d’accueil</dt>
                <dd>
                  <code>{profil.accueil}</code>
                </dd>
              </div>
            </dl>

            <p>{profil.resume}</p>
            <p className="profils-interdit">
              <strong>Interdit : </strong>
              {profil.interdit}
            </p>

            <h3>Applications</h3>
            <ul className="profils-apps">
              {menusDuProfil(profil).map((ligne) => (
                <li key={ligne}>{ligne}</li>
              ))}
            </ul>

            {users.isLoading && <LoadingState label="Comptes rattachés…" />}
            {users.isSuccess && (
              <p>
                <Link to={`/utilisateurs?profil=${profil.role}`}>
                  Voir les {effectifs.get(profil.role) ?? 0} utilisateur(s) sur ce
                  profil
                </Link>
              </p>
            )}
          </article>
        )}
      </div>

      <section className="panel profils-matrice" aria-label="Matrice applications">
        <h2>Matrice applications × profils</h2>
        <div className="table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Application</th>
                {LISTE_PROFILS.map((p) => (
                  <th key={p.role} title={p.libelle}>
                    {p.libelle.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APP_PROFIL_IDS.map((appId) => (
                <tr key={appId}>
                  <td>{APP_PROFIL_LIBELLES[appId]}</td>
                  {LISTE_PROFILS.map((p) => {
                    const ok = p.apps[appId] !== undefined;
                    const partiel = Array.isArray(p.apps[appId]);
                    return (
                      <td key={p.role} className="num">
                        {ok ? (partiel ? 'Partiel' : 'Oui') : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
