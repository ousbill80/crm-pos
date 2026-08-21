import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CanalInteraction,
  NiveauFidelite,
  RoleLibelle,
  SegmentClient,
  TypeClient,
} from '@caisse-crm/shared';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightConsentementMarketing,
  insightContactClient,
  insightDateNaissanceClient,
  insightFicheReseau,
  insightTypeClient,
} from '../lib/insights/crm';
import type {
  CampagneCrmDto,
  ClientDto,
  ContactCampagneDto,
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

function NouveauClientForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [typeClient, setTypeClient] = useState<TypeClient>(TypeClient.PHYSIQUE);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [contact, setContact] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [consentementMarketing, setConsentementMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estMorale = typeClient === TypeClient.MORALE;
  const nomTrim = nom.trim();
  const prenomTrim = prenom.trim();
  const contactTrim = contact.trim();
  const apercu = estMorale
    ? nomTrim || 'Nouvelle entreprise'
    : nomTrim || prenomTrim
      ? `${prenomTrim} ${nomTrim}`.trim()
      : 'Nouveau client';
  const formulaireValide = estMorale
    ? nomTrim.length > 0
    : nomTrim.length > 0 && prenomTrim.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ClientDto>('/crm/clients', {
        method: 'POST',
        body: JSON.stringify({
          typeClient,
          nom: nomTrim,
          prenom: prenomTrim || undefined,
          contact: contactTrim || undefined,
          dateNaissance: estMorale ? undefined : dateNaissance || undefined,
          consentementMarketing,
        }),
      }),
    onSuccess: () => {
      setTypeClient(TypeClient.PHYSIQUE);
      setNom('');
      setPrenom('');
      setContact('');
      setDateNaissance('');
      setConsentementMarketing(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
      onSuccess?.();
    },
    onError: () =>
      setError('Échec de la création du client. Vérifiez les champs et réessayez.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formulaireValide) {
      setError(
        estMorale
          ? 'La raison sociale est obligatoire.'
          : 'Le nom et le prénom sont obligatoires.',
      );
      return;
    }
    setError(null);
    mutation.mutate();
  }

  function choisirType(nouveau: TypeClient) {
    setTypeClient(nouveau);
    setError(null);
    if (nouveau === TypeClient.MORALE) {
      setDateNaissance('');
    }
  }

  return (
    <form className="modal-form client-form" onSubmit={handleSubmit}>
      <div className="client-form-body">
        <div className="client-form-banner">
          <div className="client-form-avatar" aria-hidden>
            {estMorale
              ? (nomTrim[0] ?? 'E').toUpperCase()
              : (prenomTrim[0] ?? nomTrim[0] ?? '?').toUpperCase()}
          </div>
          <div className="client-form-banner-text">
            <strong>{apercu}</strong>
            <span>
              {estMorale ? 'Personne morale' : 'Personne physique'} · fiche unique réseau
              <InfoTooltip insight={insightFicheReseau()} />
            </span>
          </div>
        </div>

        <fieldset className="client-form-section">
          <legend>
            Type de client
            <InfoTooltip insight={insightTypeClient(typeClient)} />
          </legend>
          <div className="type-client-toggle" role="group" aria-label="Type de client">
            <button
              type="button"
              className={typeClient === TypeClient.PHYSIQUE ? 'actif' : ''}
              aria-pressed={typeClient === TypeClient.PHYSIQUE}
              onClick={() => choisirType(TypeClient.PHYSIQUE)}
            >
              Personne physique
            </button>
            <button
              type="button"
              className={typeClient === TypeClient.MORALE ? 'actif' : ''}
              aria-pressed={typeClient === TypeClient.MORALE}
              onClick={() => choisirType(TypeClient.MORALE)}
            >
              Personne morale
            </button>
          </div>
        </fieldset>

        <fieldset className="client-form-section">
          <legend>Identité</legend>
          {estMorale ? (
            <div className="form-field">
              <label htmlFor="client-raison-sociale">
                Raison sociale <span className="req">*</span>
              </label>
              <input
                id="client-raison-sociale"
                name="nom"
                autoComplete="organization"
                placeholder="ex. Marché des Accessoires SARL"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                autoFocus
              />
            </div>
          ) : (
            <div className="form-grid-2">
              <div className="form-field">
                <label htmlFor="client-prenom">
                  Prénom <span className="req">*</span>
                </label>
                <input
                  id="client-prenom"
                  name="prenom"
                  autoComplete="given-name"
                  placeholder="ex. Aminata"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label htmlFor="client-nom">
                  Nom <span className="req">*</span>
                </label>
                <input
                  id="client-nom"
                  name="nom"
                  autoComplete="family-name"
                  placeholder="ex. Diop"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
          {estMorale && (
            <div className="form-field">
              <label htmlFor="client-interlocuteur">Interlocuteur</label>
              <input
                id="client-interlocuteur"
                name="prenom"
                autoComplete="name"
                placeholder="ex. Responsable achats"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
              <p className="field-hint">Optionnel — personne à contacter chez le client.</p>
            </div>
          )}
        </fieldset>

        <fieldset className="client-form-section">
          <legend>Coordonnées</legend>
          <div className={estMorale ? 'form-field' : 'form-grid-2'}>
            <div className="form-field">
              <label htmlFor="client-contact">
                Contact
                <InfoTooltip insight={insightContactClient(contact)} />
              </label>
              <input
                id="client-contact"
                name="contact"
                type="text"
                autoComplete="tel email"
                placeholder={estMorale ? 'Tél. ou e-mail professionnel' : 'Tél. ou e-mail'}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
              <p className="field-hint">Recommandé pour les campagnes CRM.</p>
            </div>
            {!estMorale && (
              <div className="form-field">
                <label htmlFor="client-naissance">
                  Date de naissance
                  <InfoTooltip insight={insightDateNaissanceClient(dateNaissance)} />
                </label>
                <input
                  id="client-naissance"
                  name="dateNaissance"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                />
                <p className="field-hint">Optionnel — anniversaires.</p>
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="client-form-section">
          <legend>
            Consentement
            <InfoTooltip insight={insightConsentementMarketing(consentementMarketing)} />
          </legend>
          <label
            htmlFor="client-consentement"
            className={`consent-card${consentementMarketing ? ' actif' : ''}`}
          >
            <input
              id="client-consentement"
              type="checkbox"
              checked={consentementMarketing}
              onChange={(e) => setConsentementMarketing(e.target.checked)}
            />
            <span className="consent-card-body">
              <strong>Autoriser les communications marketing</strong>
              <span>
                Accord explicite pour les campagnes SMS / e-mail (§6.6). Sans
                accord, la fiche reste utilisable en caisse, hors campagnes.
              </span>
            </span>
          </label>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="modal-footer">
        <button
          type="button"
          className="btn-ghost"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={mutation.isPending || !formulaireValide}
        >
          {mutation.isPending ? 'Création…' : 'Créer le client'}
        </button>
      </div>
    </form>
  );
}



function ClientRow({ client }: { client: ClientDto }) {
  const navigate = useNavigate();
  return (
    <tr
      className="client-row"
      onClick={() => navigate(`/clients/${client.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/clients/${client.id}`);
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Ouvrir la fiche de ${client.nom}`}
    >
      <td>
        <span className={`badge-type badge-type-${client.typeClient.toLowerCase()}`}>
          {client.typeClient === TypeClient.MORALE ? 'Morale' : 'Physique'}
        </span>
      </td>
      <td>{client.nom}</td>
      <td>{client.prenom ?? '—'}</td>
      <td>{client.contact ?? '—'}</td>
      <td>{client.segment}</td>
      <td>
        {client.fidelite
          ? `${client.fidelite.niveau} (${client.fidelite.pointsCumules} pts)`
          : '—'}
      </td>
    </tr>
  );
}

function NouvelleCampagneForm({ onSuccess }: { onSuccess?: () => void }) {
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
      onSuccess?.();
    },
    onError: () => setError('Échec de la création de la campagne.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit}>
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
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
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
      <div className="table-actions">
        <button type="button" onClick={() => setOuvert((v) => !v)}>
          {ouvert ? 'Masquer les contacts' : 'Voir les contacts ciblés'}
        </button>
        <button type="button" onClick={() => void exporter()}>
          Exporter CSV
        </button>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      {ouvert &&
        (isLoading ? (
          <LoadingState label="Chargement des contacts..." />
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
  const [modalCampagne, setModalCampagne] = useState(false);

  return (
    <>
      <ListPanel
        title="Campagnes CRM"
        toolbar={
          peutGerer ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setModalCampagne(true)}
            >
              Nouvelle campagne
            </button>
          ) : undefined
        }
      >
        {isLoading && <LoadingState label="Chargement des campagnes..." />}
        {isError && <p role="alert">Erreur lors du chargement des campagnes.</p>}
        {campagnes && campagnes.length === 0 && (
          <EmptyState
            title="Aucune campagne"
            description="Aucune campagne créée pour le moment."
            action={
              peutGerer ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setModalCampagne(true)}
                >
                  Nouvelle campagne
                </button>
              ) : undefined
            }
          />
        )}
        {campagnes && campagnes.length > 0 && (
          <ul className="campagnes-liste">
            {campagnes.map((c) => (
              <CampagneItem key={c.id} campagne={c} />
            ))}
          </ul>
        )}
      </ListPanel>

      {peutGerer && (
        <Modal
          open={modalCampagne}
          onClose={() => setModalCampagne(false)}
          title="Nouvelle campagne"
        >
          <NouvelleCampagneForm onSuccess={() => setModalCampagne(false)} />
        </Modal>
      )}
    </>
  );
}

export function CrmClientsPage() {
  const { user } = useAuth();
  const [segment, setSegment] = useState('');
  const [niveauFidelite, setNiveauFidelite] = useState('');
  const [modalNouveau, setModalNouveau] = useState(false);
  const { data: clients, isLoading, isError } = useClients(segment, niveauFidelite);
  const peutCreer = user !== null && ROLES_CREATION_CLIENT.includes(user.role);
  const peutAdmin = user !== null && ROLES_ADMIN_CRM.includes(user.role);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Fichier CRM consolidé — cliquez une ligne pour ouvrir la fiche"
        actions={
          peutCreer ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setModalNouveau(true)}
            >
              Nouveau client
            </button>
          ) : undefined
        }
      />

      {isLoading && <LoadingState label="Chargement des clients..." />}
      {isError && <p role="alert">Erreur lors du chargement des clients.</p>}

      {clients && (
        <ListPanel
          title="Clients"
          toolbar={
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
          }
        >
          {clients.length === 0 ? (
            <EmptyState
              title="Aucun client"
              description="Aucun client pour ces filtres."
              action={
                peutCreer ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setModalNouveau(true)}
                  >
                    Nouveau client
                  </button>
                ) : undefined
              }
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Nom / Raison sociale</th>
                  <th>Prénom / Interlocuteur</th>
                  <th>Contact</th>
                  <th>Segment</th>
                  <th>Fidélité</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <ClientRow key={c.id} client={c} />
                ))}
              </tbody>
            </table>
          )}
        </ListPanel>
      )}

      <CampagnesSection peutGerer={peutAdmin} />

      {peutCreer && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouveau client"
          description="Fiche unique pour tout le réseau — historique d’achats partagé entre boutiques."
          size="lg"
        >
          <NouveauClientForm
            onSuccess={() => setModalNouveau(false)}
            onCancel={() => setModalNouveau(false)}
          />
        </Modal>
      )}
    </div>
  );
}
