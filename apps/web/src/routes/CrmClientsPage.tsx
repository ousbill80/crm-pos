import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CanalInteraction,
  NiveauFidelite,
  RoleLibelle,
  SegmentClient,
} from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  CampagneCrmDto,
  ClientDto,
  ContactCampagneDto,
  TableauDeBordClientDto,
  VenteHistoriqueDto,
} from '../lib/types';

// Miroir de crm-roles.constants.ts (apps/api/src/crm) : ce module n'expose
// pas ces constantes via @caisse-crm/shared (limite du workspace), la liste
// est donc dupliquée ici pour le seul usage UX — le RBAC réel reste
// entièrement appliqué côté serveur (§6.6).
const ROLES_CREATION_CLIENT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

// CRM_ROLES_ADMIN (crm-roles.constants.ts) : seul le Responsable CRM pilote
// les campagnes (propriétaire fonctionnel du module, §4).
const ROLES_ADMIN_CRM: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];

function useClients(segment: string, niveauFidelite: string) {
  const params = new URLSearchParams();
  if (segment) params.set('segment', segment);
  if (niveauFidelite) params.set('niveauFidelite', niveauFidelite);
  const qs = params.toString();

  return useQuery({
    queryKey: ['crm-clients', segment, niveauFidelite],
    queryFn: () => apiFetch<ClientDto[]>(`/crm/clients${qs ? `?${qs}` : ''}`),
  });
}

function useHistoriqueAchats(clientId: string | null) {
  return useQuery({
    queryKey: ['crm-clients', clientId, 'historique-achats'],
    queryFn: () => apiFetch<VenteHistoriqueDto[]>(`/crm/clients/${clientId}/historique-achats`),
    enabled: clientId !== null,
  });
}

function useTableauDeBord(clientId: string | null) {
  return useQuery({
    queryKey: ['crm-clients', clientId, 'tableau-de-bord'],
    queryFn: () =>
      apiFetch<TableauDeBordClientDto>(`/crm/clients/${clientId}/tableau-de-bord`),
    enabled: clientId !== null,
  });
}

function useCampagnes() {
  return useQuery({
    queryKey: ['crm-campagnes'],
    queryFn: () => apiFetch<CampagneCrmDto[]>('/crm/campagnes'),
  });
}

function useContactsCampagne(campagneId: string | null) {
  return useQuery({
    queryKey: ['crm-campagnes', campagneId, 'contacts'],
    queryFn: () =>
      apiFetch<ContactCampagneDto[]>(`/crm/campagnes/${campagneId}/contacts`),
    enabled: campagneId !== null,
  });
}

function NouveauClientForm() {
  const queryClient = useQueryClient();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [contact, setContact] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [consentementMarketing, setConsentementMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ClientDto>('/crm/clients', {
        method: 'POST',
        body: JSON.stringify({
          nom,
          prenom,
          contact: contact || undefined,
          dateNaissance: dateNaissance || undefined,
          consentementMarketing,
        }),
      }),
    onSuccess: () => {
      setNom('');
      setPrenom('');
      setContact('');
      setDateNaissance('');
      setConsentementMarketing(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    },
    onError: () => setError('Échec de la création du client.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Nouveau client</h2>
      <label htmlFor="nom">Nom</label>
      <input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
      <label htmlFor="prenom">Prénom</label>
      <input id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
      <label htmlFor="contact">Contact</label>
      <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
      <label htmlFor="dateNaissance">Date de naissance</label>
      <input
        id="dateNaissance"
        type="date"
        value={dateNaissance}
        onChange={(e) => setDateNaissance(e.target.value)}
      />
      <label htmlFor="consentementMarketing">
        <input
          id="consentementMarketing"
          type="checkbox"
          checked={consentementMarketing}
          onChange={(e) => setConsentementMarketing(e.target.checked)}
        />
        Consentement marketing
      </label>
      <button type="submit" disabled={mutation.isPending}>
        Créer
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function HistoriqueAchats({ clientId }: { clientId: string }) {
  const { data: ventes, isLoading, isError } = useHistoriqueAchats(clientId);

  if (isLoading) return <p>Chargement de l'historique...</p>;
  if (isError) return <p>Erreur lors du chargement de l'historique.</p>;
  if (!ventes || ventes.length === 0) return <p>Aucun achat enregistré pour ce client.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Montant total</th>
          <th>Caisse</th>
          <th>Articles</th>
        </tr>
      </thead>
      <tbody>
        {ventes.map((v) => (
          <tr key={v.id}>
            <td>{new Date(v.dateVente).toLocaleString()}</td>
            <td>{v.montantTotal}</td>
            <td>{v.caisseId}</td>
            <td>
              {v.lignes
                .map((l) => `${l.produit.designation} x${l.quantite}`)
                .join(', ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableauDeBordClient({ clientId }: { clientId: string }) {
  const { data: tdb, isLoading, isError } = useTableauDeBord(clientId);

  if (isLoading) return <p>Chargement du tableau de bord...</p>;
  if (isError || !tdb) return <p role="alert">Erreur lors du chargement du tableau de bord.</p>;

  return (
    <dl className="tableau-de-bord">
      <dt>Total dépensé</dt>
      <dd>{tdb.totalDepense}</dd>
      <dt>Nombre d’achats</dt>
      <dd>{tdb.nombreAchats}</dd>
      <dt>Dernier achat</dt>
      <dd>{tdb.dateDernierAchat ? new Date(tdb.dateDernierAchat).toLocaleString() : 'Aucun'}</dd>
      <dt>Fidélité</dt>
      <dd>
        {tdb.niveauFidelite} ({tdb.pointsCumules} pts)
      </dd>
    </dl>
  );
}

function ClientRow({ client }: { client: ClientDto }) {
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [tableauOuvert, setTableauOuvert] = useState(false);

  return (
    <>
      <tr>
        <td>{client.nom}</td>
        <td>{client.prenom}</td>
        <td>{client.contact ?? '—'}</td>
        <td>{client.segment}</td>
        <td>{client.fidelite ? `${client.fidelite.niveau} (${client.fidelite.pointsCumules} pts)` : '—'}</td>
        <td>
          <button type="button" onClick={() => setHistoriqueOuvert((v) => !v)}>
            {historiqueOuvert ? 'Masquer' : 'Historique d\u2019achats'}
          </button>
          <button type="button" onClick={() => setTableauOuvert((v) => !v)}>
            {tableauOuvert ? 'Masquer' : 'Tableau de bord'}
          </button>
        </td>
      </tr>
      {historiqueOuvert && (
        <tr>
          <td colSpan={6}>
            <HistoriqueAchats clientId={client.id} />
          </td>
        </tr>
      )}
      {tableauOuvert && (
        <tr>
          <td colSpan={6}>
            <TableauDeBordClient clientId={client.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function NouvelleCampagneForm() {
  const queryClient = useQueryClient();
  const [nom, setNom] = useState('');
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState('');
  const [niveauFidelite, setNiveauFidelite] = useState('');
  const [canal, setCanal] = useState<CanalInteraction>(CanalInteraction.SMS);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CampagneCrmDto>('/crm/campagnes', {
        method: 'POST',
        body: JSON.stringify({
          nom,
          message,
          canal,
          ...(segment ? { segment } : {}),
          ...(niveauFidelite ? { niveauFidelite } : {}),
        }),
      }),
    onSuccess: () => {
      setNom('');
      setMessage('');
      setSegment('');
      setNiveauFidelite('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['crm-campagnes'] });
    },
    onError: () => setError('Échec de la création de la campagne.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Nouvelle campagne</h3>
      <label htmlFor="campagne-nom">Nom</label>
      <input id="campagne-nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
      <label htmlFor="campagne-message">Message</label>
      <textarea
        id="campagne-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
      />
      <label htmlFor="campagne-segment">Segment ciblé</label>
      <select
        id="campagne-segment"
        value={segment}
        onChange={(e) => setSegment(e.target.value)}
      >
        <option value="">Tous segments</option>
        {Object.values(SegmentClient).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label htmlFor="campagne-niveau">Palier de fidélité ciblé</label>
      <select
        id="campagne-niveau"
        value={niveauFidelite}
        onChange={(e) => setNiveauFidelite(e.target.value)}
      >
        <option value="">Tous paliers</option>
        {Object.values(NiveauFidelite).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label htmlFor="campagne-canal">Canal</label>
      <select
        id="campagne-canal"
        value={canal}
        onChange={(e) => setCanal(e.target.value as CanalInteraction)}
      >
        {Object.values(CanalInteraction).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button type="submit" disabled={mutation.isPending}>
        Créer la campagne
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function CampagneItem({ campagne }: { campagne: CampagneCrmDto }) {
  const [ouvert, setOuvert] = useState(false);
  const { data: contacts, isLoading } = useContactsCampagne(ouvert ? campagne.id : null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exporter() {
    try {
      setExportError(null);
      await apiDownload(
        `/crm/campagnes/${campagne.id}/contacts/export.csv`,
        `campagne-${campagne.nom.replace(/\s+/g, '-')}-contacts.csv`,
      );
    } catch {
      setExportError('Échec de l’export CSV.');
    }
  }

  return (
    <li className="campagne-item">
      <div>
        <strong>{campagne.nom}</strong> — {campagne.canal}
        {campagne.segment && <> · segment {campagne.segment}</>}
        {campagne.niveauFidelite && <> · palier {campagne.niveauFidelite}</>}
      </div>
      <p>{campagne.message}</p>
      <button type="button" onClick={() => setOuvert((v) => !v)}>
        {ouvert ? 'Masquer les contacts' : 'Voir les contacts ciblés'}
      </button>
      <button type="button" onClick={() => void exporter()}>
        Exporter CSV
      </button>
      {exportError && <p role="alert">{exportError}</p>}
      {ouvert &&
        (isLoading ? (
          <p>Chargement des contacts...</p>
        ) : (
          <ul>
            {(contacts ?? []).map((c) => (
              <li key={c.clientId}>
                {c.nom} {c.prenom} — {c.contact ?? 'sans contact'} ({c.pointsCumules} pts)
              </li>
            ))}
            {(contacts ?? []).length === 0 && <li>Aucun contact ciblé.</li>}
          </ul>
        ))}
    </li>
  );
}

function CampagnesSection({ peutGerer }: { peutGerer: boolean }) {
  const { data: campagnes, isLoading, isError } = useCampagnes();

  return (
    <section className="campagnes-crm">
      <h2>Campagnes CRM</h2>
      {peutGerer && <NouvelleCampagneForm />}
      {isLoading && <p>Chargement des campagnes...</p>}
      {isError && <p role="alert">Erreur lors du chargement des campagnes.</p>}
      {campagnes && campagnes.length === 0 && <p>Aucune campagne créée.</p>}
      {campagnes && campagnes.length > 0 && (
        <ul className="campagnes-liste">
          {campagnes.map((c) => (
            <CampagneItem key={c.id} campagne={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function CrmClientsPage() {
  const { user } = useAuth();
  const [segment, setSegment] = useState('');
  const [niveauFidelite, setNiveauFidelite] = useState('');
  const { data: clients, isLoading, isError } = useClients(segment, niveauFidelite);
  const peutCreer = user !== null && ROLES_CREATION_CLIENT.includes(user.role);
  const peutGererCampagnes = user !== null && ROLES_ADMIN_CRM.includes(user.role);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="lead">Fichier CRM consolidé — segments et fidélité</p>
        </div>
      </header>

      {peutCreer && <NouveauClientForm />}

      <div className="toolbar">
        <div>
          <label htmlFor="filtre-segment">Segment</label>
          <select
            id="filtre-segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="">Tous</option>
            {Object.values(SegmentClient).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtre-fidelite">Fidélité</label>
          <select
            id="filtre-fidelite"
            value={niveauFidelite}
            onChange={(e) => setNiveauFidelite(e.target.value)}
          >
            <option value="">Tous</option>
            {Object.values(NiveauFidelite).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p>Chargement des clients...</p>}
      {isError && <p role="alert">Erreur lors du chargement des clients.</p>}

      {clients && (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Contact</th>
              <th>Segment</th>
              <th>Fidélité</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <ClientRow key={c.id} client={c} />
            ))}
          </tbody>
        </table>
      )}

      <CampagnesSection peutGerer={peutGererCampagnes} />
    </div>
  );
}
