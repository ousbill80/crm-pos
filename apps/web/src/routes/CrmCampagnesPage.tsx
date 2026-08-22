import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CanalInteraction,
  NiveauFidelite,
  RoleLibelle,
  SegmentClient,
} from '@caisse-crm/shared';
import {
  Download,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiDownload, apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import { CRM_KPI, pctPart } from '../lib/crm-kpi-accents';
import type { CampagneCrmDto, ContactCampagneDto } from '../lib/types';

const ROLES_ADMIN_CRM: RoleLibelle[] = [RoleLibelle.RESPONSABLE_CRM];

const LIBELLE_CANAL: Record<CanalInteraction, string> = {
  [CanalInteraction.APPEL]: 'Appel',
  [CanalInteraction.SMS]: 'SMS',
  [CanalInteraction.WHATSAPP]: 'WhatsApp',
  [CanalInteraction.VISITE]: 'Visite',
  [CanalInteraction.CAMPAGNE]: 'Campagne',
  [CanalInteraction.EMAIL]: 'E-mail',
};

const CANAL_META: Record<CanalInteraction, { icon: LucideIcon; accent: string }> = {
  [CanalInteraction.APPEL]: { icon: Phone, accent: CRM_KPI.appel },
  [CanalInteraction.SMS]: { icon: MessageSquare, accent: CRM_KPI.sms },
  [CanalInteraction.WHATSAPP]: { icon: MessageCircle, accent: CRM_KPI.whatsapp },
  [CanalInteraction.VISITE]: { icon: UserRound, accent: CRM_KPI.visite },
  [CanalInteraction.CAMPAGNE]: { icon: Megaphone, accent: CRM_KPI.campagneCanal },
  [CanalInteraction.EMAIL]: { icon: Mail, accent: CRM_KPI.email },
};

function labelSegment(s: string | null) {
  if (s === SegmentClient.VIP) return 'VIP';
  if (s === SegmentClient.REGULIER) return 'Régulier';
  if (s === SegmentClient.NOUVEAU) return 'Nouveau';
  return 'Tous segments';
}

function labelPalier(n: string | null) {
  if (n === NiveauFidelite.OR) return 'Or';
  if (n === NiveauFidelite.ARGENT) return 'Argent';
  if (n === NiveauFidelite.BRONZE) return 'Bronze';
  return 'Tous paliers';
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
    <form className="form-grid crm-campagne-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="campagne-nom">Nom</label>
        <input
          id="campagne-nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="campagne-canal">Canal</label>
        <select
          id="campagne-canal"
          value={canal}
          onChange={(e) => setCanal(e.target.value as CanalInteraction)}
        >
          {Object.values(CanalInteraction).map((c) => (
            <option key={c} value={c}>
              {LIBELLE_CANAL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="campagne-message">Message</label>
        <textarea
          id="campagne-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="campagne-segment">Segment ciblé</label>
        <select
          id="campagne-segment"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
        >
          <option value="">Tous segments</option>
          {Object.values(SegmentClient).map((s) => (
            <option key={s} value={s}>
              {labelSegment(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="campagne-niveau">Palier de fidélité ciblé</label>
        <select
          id="campagne-niveau"
          value={niveauFidelite}
          onChange={(e) => setNiveauFidelite(e.target.value)}
        >
          <option value="">Tous paliers</option>
          {Object.values(NiveauFidelite).map((n) => (
            <option key={n} value={n}>
              {labelPalier(n)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Création…' : 'Créer la campagne'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function CampagneItem({ campagne }: { campagne: CampagneCrmDto }) {
  const [ouvert, setOuvert] = useState(false);
  const { data: contacts, isLoading } = useContactsCampagne(
    ouvert ? campagne.id : null,
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const meta = CANAL_META[campagne.canal];
  const Icon = meta.icon;

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
    <article className="crm-campagne-card campagne-item">
      <div className="crm-campagne-card-head">
        <span
          className="crm-campagne-canal-icon"
          style={{ '--canal-accent': meta.accent } as CSSProperties}
        >
          <Icon size={18} aria-hidden />
        </span>
        <div className="crm-campagne-card-main">
          <strong>{campagne.nom}</strong>
          <div className="crm-campagne-card-meta">
            <span
              className="crm-interaction-canal-badge"
              style={{ '--canal-accent': meta.accent } as CSSProperties}
            >
              {LIBELLE_CANAL[campagne.canal]}
            </span>
            <span className="badge badge-neutral">
              {labelSegment(campagne.segment)}
            </span>
            <span className="badge badge-neutral">
              {labelPalier(campagne.niveauFidelite)}
            </span>
            {campagne.dateEnvoi ? (
              <span className="badge badge-ok">Envoyée</span>
            ) : (
              <span className="badge badge-neutral">CSV seulement</span>
            )}
          </div>
        </div>
        <time className="crm-campagne-date" dateTime={campagne.dateCreation}>
          {new Date(campagne.dateCreation).toLocaleDateString('fr-FR')}
        </time>
      </div>
      <p className="crm-campagne-message">{campagne.message}</p>
      <div className="table-actions crm-campagne-actions">
        <button type="button" className="btn-secondary" onClick={() => setOuvert((v) => !v)}>
          {ouvert ? 'Masquer les contacts' : 'Voir les contacts ciblés'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void exporter()}>
          <Download size={14} aria-hidden /> Exporter CSV
        </button>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      {ouvert &&
        (isLoading ? (
          <LoadingState label="Chargement des contacts..." />
        ) : (
          <ul className="crm-campagne-contacts">
            {(contacts ?? []).map((c) => (
              <li key={c.clientId}>
                <Link to={`/clients/${c.clientId}`}>
                  {c.prenom ? `${c.prenom} ${c.nom}` : c.nom}
                </Link>
                <span>{c.contact ?? 'sans contact'}</span>
                <span>{c.pointsCumules} pts</span>
              </li>
            ))}
            {(contacts ?? []).length === 0 && (
              <li className="crm-campagne-contacts-empty">Aucun contact ciblé.</li>
            )}
          </ul>
        ))}
    </article>
  );
}

export function CrmCampagnesPage() {
  const { user } = useAuth();
  const peutGerer = user !== null && ROLES_ADMIN_CRM.includes(user.role);
  const { data: campagnes, isLoading, isError } = useCampagnes();
  const [modalCampagne, setModalCampagne] = useState(false);
  const [filtreCanal, setFiltreCanal] = useState('');
  const [filtreEnvoi, setFiltreEnvoi] = useState<'tous' | 'envoyee' | 'csv'>('tous');

  const kpis = useMemo(() => {
    const list = campagnes ?? [];
    const byCanal: Record<string, number> = {};
    let envoyees = 0;
    for (const c of list) {
      byCanal[c.canal] = (byCanal[c.canal] ?? 0) + 1;
      if (c.dateEnvoi) envoyees += 1;
    }
    return { total: list.length, byCanal, envoyees, csv: list.length - envoyees };
  }, [campagnes]);

  const campagnesFiltrees = useMemo(() => {
    let list = campagnes ?? [];
    if (filtreCanal) {
      list = list.filter((c) => c.canal === filtreCanal);
    }
    if (filtreEnvoi === 'envoyee') {
      list = list.filter((c) => Boolean(c.dateEnvoi));
    }
    if (filtreEnvoi === 'csv') {
      list = list.filter((c) => !c.dateEnvoi);
    }
    return list;
  }, [campagnes, filtreCanal, filtreEnvoi]);

  return (
    <div className="crm-campagnes-page">
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

      {!isLoading && campagnes && (
        <CrmKpiGrid className="crm-kpi-grid--scroll">
          <CrmKpiWidget
            label="Campagnes"
            value={kpis.total}
            hint="Créées sur le réseau"
            icon={Megaphone}
            accent={CRM_KPI.campagnes}
            active={!filtreCanal && filtreEnvoi === 'tous'}
            onClick={() => {
              setFiltreCanal('');
              setFiltreEnvoi('tous');
            }}
          />
          <CrmKpiWidget
            label="Envoyées"
            value={kpis.envoyees}
            hint="Diffusion effectuée"
            badge={pctPart(kpis.envoyees, kpis.total)}
            icon={Send}
            accent={CRM_KPI.marketing}
            active={filtreEnvoi === 'envoyee'}
            onClick={() =>
              setFiltreEnvoi(filtreEnvoi === 'envoyee' ? 'tous' : 'envoyee')
            }
          />
          <CrmKpiWidget
            label="CSV seulement"
            value={kpis.csv}
            hint="Export contacts sans envoi"
            badge={pctPart(kpis.csv, kpis.total)}
            icon={Download}
            accent={CRM_KPI.nouveau}
            active={filtreEnvoi === 'csv'}
            onClick={() => setFiltreEnvoi(filtreEnvoi === 'csv' ? 'tous' : 'csv')}
          />
          {Object.values(CanalInteraction)
            .filter((c) => (kpis.byCanal[c] ?? 0) > 0)
            .map((c) => {
              const meta = CANAL_META[c];
              const n = kpis.byCanal[c] ?? 0;
              return (
                <CrmKpiWidget
                  key={c}
                  label={LIBELLE_CANAL[c]}
                  value={n}
                  badge={pctPart(n, kpis.total)}
                  icon={meta.icon}
                  accent={meta.accent}
                  active={filtreCanal === c}
                  onClick={() => setFiltreCanal(filtreCanal === c ? '' : c)}
                />
              );
            })}
        </CrmKpiGrid>
      )}

      <ListPanel title={`Campagnes CRM (${campagnesFiltrees.length})`}>
        {isLoading && <LoadingState label="Chargement des campagnes..." />}
        {isError && <p role="alert">Erreur lors du chargement des campagnes.</p>}
        {campagnes && campagnesFiltrees.length === 0 && (
          <EmptyState
            title={campagnes.length === 0 ? 'Aucune campagne' : 'Aucun résultat'}
            description={
              campagnes.length === 0
                ? 'Aucune campagne créée pour le moment.'
                : 'Élargissez les filtres KPI ci-dessus.'
            }
            action={
              peutGerer && campagnes.length === 0 ? (
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
        {campagnesFiltrees.length > 0 && (
          <div className="crm-campagnes-list">
            {campagnesFiltrees.map((c) => (
              <CampagneItem key={c.id} campagne={c} />
            ))}
          </div>
        )}
      </ListPanel>

      {peutGerer && (
        <Modal
          open={modalCampagne}
          onClose={() => setModalCampagne(false)}
          title="Nouvelle campagne"
          description="Ciblage par segment et palier — seuls les clients avec consentement marketing et contact joignable sont exportables."
        >
          <NouvelleCampagneForm onSuccess={() => setModalCampagne(false)} />
        </Modal>
      )}
    </div>
  );
}
