import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NiveauFidelite, RoleLibelle, SegmentClient } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ClientDto, VenteHistoriqueDto } from '../lib/types';

// Miroir de crm-roles.constants.ts (apps/api/src/crm) : ce module n'expose
// pas ces constantes via @caisse-crm/shared (limite du workspace), la liste
// est donc dupliquée ici pour le seul usage UX — le RBAC réel reste
// entièrement appliqué côté serveur (§6.6).
const ROLES_CREATION_CLIENT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

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

function ClientRow({ client }: { client: ClientDto }) {
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

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
        </td>
      </tr>
      {historiqueOuvert && (
        <tr>
          <td colSpan={6}>
            <HistoriqueAchats clientId={client.id} />
          </td>
        </tr>
      )}
    </>
  );
}

export function CrmClientsPage() {
  const { user } = useAuth();
  const [segment, setSegment] = useState('');
  const [niveauFidelite, setNiveauFidelite] = useState('');
  const { data: clients, isLoading, isError } = useClients(segment, niveauFidelite);
  const peutCreer = user !== null && ROLES_CREATION_CLIENT.includes(user.role);

  return (
    <div>
      <h1>Clients</h1>

      {peutCreer && <NouveauClientForm />}

      <h2>Liste des clients</h2>
      <label htmlFor="filtre-segment">Segment</label>
      <select id="filtre-segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
        <option value="">Tous</option>
        {Object.values(SegmentClient).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
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

      {isLoading && <p>Chargement des clients...</p>}
      {isError && <p>Erreur lors du chargement des clients.</p>}

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
    </div>
  );
}
