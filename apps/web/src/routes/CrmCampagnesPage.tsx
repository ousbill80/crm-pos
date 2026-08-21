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
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import type { CampagneCrmDto, ContactCampagneDto } from '../lib/types';

// CRM_ROLES_ADMIN : seul le Responsable CRM pilote les campagnes (§4, §6.6).
const ROLES_ADMIN_CRM: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];

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

export function CrmCampagnesPage() {
  const { user } = useAuth();
  const peutGerer = user !== null && ROLES_ADMIN_CRM.includes(user.role);
  const { data: campagnes, isLoading, isError } = useCampagnes();
  const [modalCampagne, setModalCampagne] = useState(false);

  return (
    <div>
      <PageHeader
        title="Campagnes"
        subtitle="Ciblage CRM par segment / palier — export CSV des contacts (§6.6)"
        actions={
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

      <ListPanel title="Campagnes CRM">
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
    </div>
  );
}
