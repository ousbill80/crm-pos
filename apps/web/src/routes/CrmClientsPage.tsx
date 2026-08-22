import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Star, UserPlus, Building2, MailCheck, ListFilter, X } from 'lucide-react';
import {
  NiveauFidelite,
  RoleLibelle,
  SegmentClient,
  TypeClient,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { CrmKpiGrid, CrmKpiWidget } from '../components/CrmKpiWidget';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  insightAdresseClient,
  insightConsentementMarketing,
  insightContactClient,
  insightDateNaissanceClient,
  insightFicheReseau,
  insightTypeClient,
} from '../lib/insights/crm';
import { CRM_KPI, pctPart } from '../lib/crm-kpi-accents';
import type { ClientDto } from '../lib/types';

// Miroir de crm-roles.constants.ts (apps/api/src/crm) : ce module n'expose
// pas ces constantes via @caisse-crm/shared (limite du workspace), la liste
// est donc dupliquée ici pour le seul usage UX — le RBAC réel reste
// entièrement appliqué côté serveur (§6.6).
const ROLES_CREATION_CLIENT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_CRM,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

function labelSegment(s: string) {
  if (s === SegmentClient.VIP) return 'VIP';
  if (s === SegmentClient.REGULIER) return 'Régulier';
  if (s === SegmentClient.NOUVEAU) return 'Nouveau';
  return s;
}

function labelFidelite(n: string) {
  if (n === NiveauFidelite.OR) return 'Or';
  if (n === NiveauFidelite.ARGENT) return 'Argent';
  if (n === NiveauFidelite.BRONZE) return 'Bronze';
  return n;
}

type ClientsFiltres = {
  q: string;
  segment: string;
  niveauFidelite: string;
  typeClient: string;
  consentement: '' | 'oui' | 'non';
};

function useClients(filtres: ClientsFiltres) {
  const q = filtres.q.trim();
  const params = new URLSearchParams();
  if (filtres.segment) params.set('segment', filtres.segment);
  if (filtres.niveauFidelite) params.set('niveauFidelite', filtres.niveauFidelite);
  if (filtres.typeClient) params.set('typeClient', filtres.typeClient);
  if (filtres.consentement === 'oui') params.set('consentementMarketing', 'true');
  if (filtres.consentement === 'non') params.set('consentementMarketing', 'false');
  if (q.length >= 2) params.set('q', q);
  const qs = params.toString();

  return useQuery({
    queryKey: [
      'crm-clients',
      filtres.segment,
      filtres.niveauFidelite,
      filtres.typeClient,
      filtres.consentement,
      q.length >= 2 ? q : '',
    ],
    queryFn: () => apiFetch<ClientDto[]>(`/crm/clients${qs ? `?${qs}` : ''}`),
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
  const [adresse, setAdresse] = useState('');
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
          adresse: adresse.trim() || undefined,
          dateNaissance: estMorale ? undefined : dateNaissance || undefined,
          consentementMarketing,
        }),
      }),
    onSuccess: () => {
      setTypeClient(TypeClient.PHYSIQUE);
      setNom('');
      setPrenom('');
      setContact('');
      setAdresse('');
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
          <div className="form-field">
            <label htmlFor="client-adresse">
              Adresse
              <InfoTooltip insight={insightAdresseClient(adresse)} />
            </label>
            <input
              id="client-adresse"
              name="adresse"
              type="text"
              autoComplete="street-address"
              placeholder="ex. Cocody, Abidjan"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
            />
            <p className="field-hint">Optionnel — livraisons et suivi commercial.</p>
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
  const libelle =
    client.typeClient === TypeClient.MORALE
      ? client.nom
      : `${client.prenom ?? ''} ${client.nom}`.trim();
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
      aria-label={`Ouvrir la fiche de ${libelle}`}
    >
      <td>
        <span
          className={`badge-type badge-type-${client.typeClient.toLowerCase()}`}
        >
          {client.typeClient === TypeClient.MORALE ? 'Morale' : 'Physique'}
        </span>
      </td>
      <td>
        <strong>{client.nom}</strong>
        {client.prenom ? (
          <div className="lead" style={{ margin: 0 }}>
            {client.prenom}
          </div>
        ) : null}
      </td>
      <td>{client.contact ?? '—'}</td>
      <td>
        <span className="badge badge-neutral">{labelSegment(client.segment)}</span>
      </td>
      <td>
        {client.fidelite
          ? `${labelFidelite(client.fidelite.niveau)} · ${client.fidelite.pointsCumules} pts`
          : '—'}
      </td>
      <td>
        {client.consentementMarketing ? (
          <span className="badge badge-ok">Oui</span>
        ) : (
          <span className="badge badge-neutral">Non</span>
        )}
      </td>
    </tr>
  );
}

export function CrmClientsPage() {
  const { user } = useAuth();
  const magasin = useFiltreMagasinSiege();
  const [qInput, setQInput] = useState('');
  const qDeferred = useDeferredValue(qInput.trim());
  const [segment, setSegment] = useState('');
  const [niveauFidelite, setNiveauFidelite] = useState('');
  const [typeClient, setTypeClient] = useState('');
  const [consentement, setConsentement] = useState<'' | 'oui' | 'non'>('');
  const [modalNouveau, setModalNouveau] = useState(false);

  const filtres: ClientsFiltres = {
    q: qDeferred,
    segment,
    niveauFidelite,
    typeClient,
    consentement,
  };

  const { data: clientsBruts, isLoading, isError, isFetching } =
    useClients(filtres);

  const statsQ = useQuery({
    queryKey: ['crm-clients', 'stats-kpis', magasin.boutiqueId],
    queryFn: () => apiFetch<ClientDto[]>('/crm/clients'),
  });

  const statsClients = useMemo(() => {
    const list = statsQ.data ?? [];
    if (!magasin.boutiqueId) return list;
    return list.filter((c) => c.boutiqueOrigineId === magasin.boutiqueId);
  }, [statsQ.data, magasin.boutiqueId]);

  const kpis = useMemo(() => {
    return {
      total: statsClients.length,
      vip: statsClients.filter((c) => c.segment === SegmentClient.VIP).length,
      marketing: statsClients.filter((c) => c.consentementMarketing).length,
      morales: statsClients.filter((c) => c.typeClient === TypeClient.MORALE).length,
    };
  }, [statsClients]);

  const clients = useMemo(() => {
    if (!clientsBruts) return clientsBruts;
    if (!magasin.boutiqueId) return clientsBruts;
    return clientsBruts.filter((c) => c.boutiqueOrigineId === magasin.boutiqueId);
  }, [clientsBruts, magasin.boutiqueId]);

  const peutCreer = user !== null && ROLES_CREATION_CLIENT.includes(user.role);

  const filtresActifs =
    Boolean(segment) ||
    Boolean(niveauFidelite) ||
    Boolean(typeClient) ||
    Boolean(consentement) ||
    qInput.trim().length >= 2 ||
    Boolean(magasin.boutiqueId);

  function toggleFiltre<T extends string>(
    courant: T,
    valeur: T,
    setter: (v: T | '') => void,
  ) {
    setter(courant === valeur ? '' : valeur);
  }

  function resetFiltres() {
    setQInput('');
    setSegment('');
    setNiveauFidelite('');
    setTypeClient('');
    setConsentement('');
    magasin.setBoutiqueId('');
  }

  return (
    <div className="crm-clients-page">
      <PageHeader
        title="Clients"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Fichier CRM consolidé réseau — filtrez, puis ouvrez une fiche',
          texteBoutique:
            'Clients de la boutique — recherche téléphone sur tout le réseau',
        })}
        actions={
          peutCreer ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setModalNouveau(true)}
            >
              <UserPlus size={16} /> Nouveau client
            </button>
          ) : undefined
        }
      />

      <div className="toolbar crm-clients-filtres" role="search">
        <div className="crm-clients-search">
          <label htmlFor="crm-filtre-q">Recherche</label>
          <div className="crm-clients-search-wrap">
            <Search size={16} aria-hidden />
            <input
              id="crm-filtre-q"
              type="search"
              placeholder="Nom, prénom ou téléphone (2 car. min.)"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <FiltreMagasinSiege id="crm-filtre-magasin" />
        <div>
          <label htmlFor="filtre-type">Type</label>
          <select
            id="filtre-type"
            value={typeClient}
            onChange={(e) => setTypeClient(e.target.value)}
          >
            <option value="">Tous</option>
            <option value={TypeClient.PHYSIQUE}>Personne physique</option>
            <option value={TypeClient.MORALE}>Personne morale</option>
          </select>
        </div>
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
                {labelSegment(s)}
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
                {labelFidelite(n)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtre-consentement">Marketing</label>
          <select
            id="filtre-consentement"
            value={consentement}
            onChange={(e) =>
              setConsentement(e.target.value as '' | 'oui' | 'non')
            }
          >
            <option value="">Tous</option>
            <option value="oui">Consentement oui</option>
            <option value="non">Consentement non</option>
          </select>
        </div>
        {filtresActifs && (
          <div className="crm-clients-reset">
            <label>&nbsp;</label>
            <button type="button" className="btn-ghost" onClick={resetFiltres}>
              <X size={14} /> Réinitialiser
            </button>
          </div>
        )}
      </div>

      {!isLoading && clients && (
        <CrmKpiGrid className="crm-clients-kpis">
          <CrmKpiWidget
            label="Résultats"
            value={
              filtresActifs
                ? `${clients.length}${isFetching ? '…' : ''} / ${kpis.total}`
                : `${kpis.total}${isFetching ? '…' : ''}`
            }
            hint={
              filtresActifs
                ? 'Filtres actifs — cliquer pour réinitialiser'
                : 'Fiches sur le périmètre'
            }
            icon={ListFilter}
            accent={CRM_KPI.accent}
            active={filtresActifs}
            onClick={filtresActifs ? resetFiltres : undefined}
          />
          <CrmKpiWidget
            label="VIP"
            value={kpis.vip}
            hint="Segment haute valeur"
            badge={pctPart(kpis.vip, kpis.total)}
            icon={Star}
            accent={CRM_KPI.vip}
            active={segment === SegmentClient.VIP}
            onClick={() =>
              toggleFiltre(segment, SegmentClient.VIP, setSegment)
            }
          />
          <CrmKpiWidget
            label="Consentement marketing"
            value={kpis.marketing}
            hint="Campagnes ciblées autorisées"
            badge={pctPart(kpis.marketing, kpis.total)}
            icon={MailCheck}
            accent={CRM_KPI.marketing}
            active={consentement === 'oui'}
            onClick={() =>
              toggleFiltre(consentement, 'oui', setConsentement)
            }
          />
          <CrmKpiWidget
            label="Personnes morales"
            value={kpis.morales}
            hint="Entreprises / associations"
            badge={pctPart(kpis.morales, kpis.total)}
            icon={Building2}
            accent={CRM_KPI.morales}
            active={typeClient === TypeClient.MORALE}
            onClick={() =>
              toggleFiltre(typeClient, TypeClient.MORALE, setTypeClient)
            }
          />
        </CrmKpiGrid>
      )}

      {isLoading && <LoadingState label="Chargement des clients…" />}
      {isError && <p role="alert">Erreur lors du chargement des clients.</p>}

      {clients && (
        <ListPanel title={`Clients (${clients.length})`}>
          {clients.length === 0 ? (
            <EmptyState
              title="Aucun client"
              description={
                filtresActifs
                  ? 'Aucun résultat pour ces filtres — élargissez la recherche.'
                  : 'Aucun client enregistré pour ce périmètre.'
              }
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
            <div className="clients-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Identité</th>
                    <th>Contact</th>
                    <th>Segment</th>
                    <th>Fidélité</th>
                    <th>Marketing</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <ClientRow key={c.id} client={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ListPanel>
      )}

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
