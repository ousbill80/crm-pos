import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  BoutiqueDto,
  CaisseDto,
  EntrepotDto,
  SocieteDto,
  ZoneDto,
} from '../lib/types';

const ROLES_ADMIN: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

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

export function EntreprisePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN.includes(user.role);

  const societe = useQuery({
    queryKey: ['entreprise'],
    queryFn: () => apiFetch<SocieteDto>('/entreprise'),
    enabled: peutLire,
  });
  const zones = useQuery({
    queryKey: ['zones'],
    queryFn: () => apiFetch<ZoneDto[]>('/zones'),
    enabled: peutLire,
  });
  const boutiques = useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
    enabled: peutLire,
  });
  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const caisses = useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
    enabled: peutLire,
  });

  const [raisonSociale, setRaisonSociale] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [devise, setDevise] = useState('XOF');
  const [msg, setMsg] = useState<string | null>(null);

  const patchSociete = useMutation({
    mutationFn: () =>
      apiFetch<SocieteDto>('/entreprise', {
        method: 'PATCH',
        body: JSON.stringify({
          raisonSociale: raisonSociale || undefined,
          adresse: adresse || undefined,
          telephone: telephone || undefined,
          email: email || undefined,
          devise: devise || undefined,
        }),
      }),
    onSuccess: () => {
      setMsg('Société mise à jour.');
      void queryClient.invalidateQueries({ queryKey: ['entreprise'] });
    },
    onError: () => setMsg('Échec de la mise à jour.'),
  });

  const [nomBoutique, setNomBoutique] = useState('');
  const [adresseBoutique, setAdresseBoutique] = useState('');
  const [zoneId, setZoneId] = useState('');
  const createBoutique = useMutation({
    mutationFn: () =>
      apiFetch<BoutiqueDto>('/boutiques', {
        method: 'POST',
        body: JSON.stringify({
          nom: nomBoutique,
          adresse: adresseBoutique,
          zoneId,
        }),
      }),
    onSuccess: () => {
      setNomBoutique('');
      setAdresseBoutique('');
      void queryClient.invalidateQueries({ queryKey: ['boutiques'] });
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
    },
  });

  const [entrepotNom, setEntrepotNom] = useState('');
  const [entrepotCode, setEntrepotCode] = useState('');
  const [entrepotBoutiqueId, setEntrepotBoutiqueId] = useState('');
  const createEntrepot = useMutation({
    mutationFn: () =>
      apiFetch<EntrepotDto>('/entrepots', {
        method: 'POST',
        body: JSON.stringify({
          nom: entrepotNom,
          code: entrepotCode,
          boutiqueId: entrepotBoutiqueId,
          type: 'SECONDAIRE',
        }),
      }),
    onSuccess: () => {
      setEntrepotNom('');
      setEntrepotCode('');
      void queryClient.invalidateQueries({ queryKey: ['entrepots'] });
    },
  });

  const [caisseBoutiqueId, setCaisseBoutiqueId] = useState('');
  const createCaisse = useMutation({
    mutationFn: () =>
      apiFetch<CaisseDto>('/caisses', {
        method: 'POST',
        body: JSON.stringify({
          type: 'AUXILIAIRE',
          boutiqueId: caisseBoutiqueId,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
  });

  if (!peutLire) {
    return <p>Vous n’avez pas accès à la configuration entreprise.</p>;
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Entreprise</h1>
          <p className="lead">Société, magasins, entrepôts et caisses</p>
        </div>
      </header>

      {societe.isLoading && <p>Chargement...</p>}
      {societe.data && (
        <section>
          <h2>{societe.data.raisonSociale}</h2>
          <p>
            {societe.data.adresse} — {societe.data.devise}
            {societe.data.telephone ? ` — ${societe.data.telephone}` : ''}
            {societe.data.email ? ` — ${societe.data.email}` : ''}
          </p>
          {peutAdmin && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!raisonSociale && societe.data) {
                  setRaisonSociale(societe.data.raisonSociale);
                  setAdresse(societe.data.adresse);
                  setTelephone(societe.data.telephone ?? '');
                  setEmail(societe.data.email ?? '');
                  setDevise(societe.data.devise);
                }
                patchSociete.mutate();
              }}
            >
              <h3>Modifier la fiche société</h3>
              <label htmlFor="rs">Raison sociale</label>
              <input
                id="rs"
                value={raisonSociale || societe.data.raisonSociale}
                onChange={(e) => setRaisonSociale(e.target.value)}
              />
              <label htmlFor="adr">Adresse</label>
              <input
                id="adr"
                value={adresse || societe.data.adresse}
                onChange={(e) => setAdresse(e.target.value)}
              />
              <label htmlFor="tel">Téléphone</label>
              <input
                id="tel"
                value={telephone || societe.data.telephone || ''}
                onChange={(e) => setTelephone(e.target.value)}
              />
              <label htmlFor="em">Email</label>
              <input
                id="em"
                value={email || societe.data.email || ''}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="dev">Devise</label>
              <input
                id="dev"
                value={devise || societe.data.devise}
                onChange={(e) => setDevise(e.target.value)}
              />
              <button type="submit" disabled={patchSociete.isPending}>
                Enregistrer
              </button>
              {msg && <p>{msg}</p>}
            </form>
          )}
        </section>
      )}

      <section>
        <h2>Magasins</h2>
        {boutiques.data && (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Adresse</th>
                <th>Zone</th>
                <th>Actif</th>
              </tr>
            </thead>
            <tbody>
              {boutiques.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.nom}</td>
                  <td>{b.adresse}</td>
                  <td>{zones.data?.find((z) => z.id === b.zoneId)?.nomZone ?? b.zoneId.slice(0, 8)}</td>
                  <td>{b.actif === false ? 'Non' : 'Oui'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {peutAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createBoutique.mutate();
            }}
          >
            <h3>Nouveau magasin</h3>
            <label htmlFor="nb">Nom</label>
            <input id="nb" value={nomBoutique} onChange={(e) => setNomBoutique(e.target.value)} required />
            <label htmlFor="ab">Adresse</label>
            <input
              id="ab"
              value={adresseBoutique}
              onChange={(e) => setAdresseBoutique(e.target.value)}
              required
            />
            <label htmlFor="zb">Zone</label>
            <select
              id="zb"
              value={zoneId || zones.data?.[0]?.id || ''}
              onChange={(e) => setZoneId(e.target.value)}
              required
            >
              {(zones.data ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nomZone}
                </option>
              ))}
            </select>
            <button type="submit" disabled={createBoutique.isPending}>
              Créer le magasin
            </button>
          </form>
        )}
      </section>

      <section>
        <h2>Entrepôts</h2>
        {entrepots.data && (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Code</th>
                <th>Type</th>
                <th>Boutique</th>
                <th>Actif</th>
              </tr>
            </thead>
            <tbody>
              {entrepots.data.map((e) => (
                <tr key={e.id}>
                  <td>{e.nom}</td>
                  <td>{e.code}</td>
                  <td>{e.type}</td>
                  <td>{boutiques.data?.find((b) => b.id === e.boutiqueId)?.nom ?? e.boutiqueId.slice(0, 8)}</td>
                  <td>{e.actif ? 'Oui' : 'Non'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {peutAdmin && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              createEntrepot.mutate();
            }}
          >
            <h3>Nouvel entrepôt secondaire</h3>
            <label htmlFor="en">Nom</label>
            <input id="en" value={entrepotNom} onChange={(e) => setEntrepotNom(e.target.value)} required />
            <label htmlFor="ec">Code</label>
            <input id="ec" value={entrepotCode} onChange={(e) => setEntrepotCode(e.target.value)} required />
            <label htmlFor="eb">Boutique</label>
            <select
              id="eb"
              value={entrepotBoutiqueId || boutiques.data?.[0]?.id || ''}
              onChange={(e) => setEntrepotBoutiqueId(e.target.value)}
              required
            >
              {(boutiques.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
            <button type="submit" disabled={createEntrepot.isPending}>
              Créer l’entrepôt
            </button>
          </form>
        )}
      </section>

      <section>
        <h2>Caisses auxiliaires</h2>
        {caisses.data && (
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Type</th>
                <th>Boutique</th>
              </tr>
            </thead>
            <tbody>
              {caisses.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.id.slice(0, 8)}…</code>
                  </td>
                  <td>{c.type}</td>
                  <td>{boutiques.data?.find((b) => b.id === c.boutiqueId)?.nom ?? c.boutiqueId?.slice(0, 8) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {peutAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createCaisse.mutate();
            }}
          >
            <h3>Provisionner une caisse auxiliaire</h3>
            <label htmlFor="cb">Boutique</label>
            <select
              id="cb"
              value={caisseBoutiqueId || boutiques.data?.[0]?.id || ''}
              onChange={(e) => setCaisseBoutiqueId(e.target.value)}
              required
            >
              {(boutiques.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
            <button type="submit" disabled={createCaisse.isPending}>
              Créer la caisse
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
