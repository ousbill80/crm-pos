import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CanalInteraction,
  ModePaiement,
  NiveauFidelite,
  SegmentClient,
  TypeClient,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { LoadingState } from './LoadingState';
import { InfoTooltip } from './InfoTooltip';
import {
  insightConsentementMarketing,
  insightContactClient,
  insightDateNaissanceClient,
  insightDernierAchat,
  insightFicheReseau,
  insightFidelite,
  insightNombreAchats,
  insightTotalDepense,
  insightTypeClient,
} from '../lib/insights/crm';
import type {
  ClientDto,
  InteractionCrmDto,
  TableauDeBordClientDto,
  VenteHistoriqueDto,
} from '../lib/types';

type OngletFiche = 'apercu' | 'identite' | 'achats' | 'fidelite' | 'interactions';

const TYPES_INTERACTION = ['RELANCE', 'SAV', 'PROSPECTION', 'SUIVI', 'AUTRE'] as const;

function estMorale(c: ClientDto) {
  return c.typeClient === TypeClient.MORALE;
}

function libelleClient(c: ClientDto) {
  return estMorale(c) ? c.nom : `${c.prenom ?? ''} ${c.nom}`.trim();
}

function useClient(clientId: string) {
  return useQuery({
    queryKey: ['crm-clients', clientId],
    queryFn: () => apiFetch<ClientDto>(`/crm/clients/${clientId}`),
  });
}

function useHistoriqueAchats(clientId: string) {
  return useQuery({
    queryKey: ['crm-clients', clientId, 'historique-achats'],
    queryFn: () =>
      apiFetch<VenteHistoriqueDto[]>(`/crm/clients/${clientId}/historique-achats`),
  });
}

function useTableauDeBord(clientId: string) {
  return useQuery({
    queryKey: ['crm-clients', clientId, 'tableau-de-bord'],
    queryFn: () =>
      apiFetch<TableauDeBordClientDto>(`/crm/clients/${clientId}/tableau-de-bord`),
  });
}

function useInteractions(clientId: string) {
  return useQuery({
    queryKey: ['crm-clients', clientId, 'interactions'],
    queryFn: () =>
      apiFetch<InteractionCrmDto[]>(`/crm/clients/${clientId}/interactions`),
  });
}

function IdentiteForm({ client, onDone }: { client: ClientDto; onDone: () => void }) {
  const queryClient = useQueryClient();
  const morale = estMorale(client);
  const [nom, setNom] = useState(client.nom);
  const [prenom, setPrenom] = useState(client.prenom ?? '');
  const [contact, setContact] = useState(client.contact ?? '');
  const [dateNaissance, setDateNaissance] = useState(
    client.dateNaissance ? client.dateNaissance.slice(0, 10) : '',
  );
  const [consentementMarketing, setConsentementMarketing] = useState(
    client.consentementMarketing,
  );
  const [segment, setSegment] = useState<SegmentClient>(client.segment);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<ClientDto>(`/crm/clients/${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nom: nom.trim(),
          prenom: prenom.trim() || undefined,
          contact: contact.trim() || undefined,
          dateNaissance: morale ? undefined : dateNaissance || undefined,
          consentementMarketing,
          segment,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
      onDone();
    },
    onError: () => setError('Échec de la mise à jour de la fiche.'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim() || (!morale && !prenom.trim())) {
      setError(
        morale
          ? 'La raison sociale est obligatoire.'
          : 'Le nom et le prénom sont obligatoires.',
      );
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <form className="client-fiche-form" onSubmit={handleSubmit}>
      {morale ? (
        <div className="form-field">
          <label htmlFor="edit-raison">Raison sociale</label>
          <input id="edit-raison" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </div>
      ) : (
        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor="edit-prenom">Prénom</label>
            <input
              id="edit-prenom"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-nom">Nom</label>
            <input id="edit-nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>
        </div>
      )}
      {morale && (
        <div className="form-field">
          <label htmlFor="edit-interlocuteur">Interlocuteur</label>
          <input
            id="edit-interlocuteur"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
          />
        </div>
      )}
      <div className="form-field">
        <label htmlFor="edit-contact">
          Contact <InfoTooltip insight={insightContactClient(contact)} />
        </label>
        <input id="edit-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      {!morale && (
        <div className="form-field">
          <label htmlFor="edit-naissance">
            Date de naissance <InfoTooltip insight={insightDateNaissanceClient(dateNaissance)} />
          </label>
          <input
            id="edit-naissance"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={dateNaissance}
            onChange={(e) => setDateNaissance(e.target.value)}
          />
        </div>
      )}
      <div className="form-field">
        <label htmlFor="edit-segment">Segment</label>
        <select
          id="edit-segment"
          value={segment}
          onChange={(e) => setSegment(e.target.value as SegmentClient)}
        >
          {Object.values(SegmentClient).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <label
        htmlFor="edit-consentement"
        className={`consent-card${consentementMarketing ? ' actif' : ''}`}
      >
        <input
          id="edit-consentement"
          type="checkbox"
          checked={consentementMarketing}
          onChange={(e) => setConsentementMarketing(e.target.checked)}
        />
        <span className="consent-card-body">
          <strong>Consentement marketing</strong>
          <span>
            <InfoTooltip insight={insightConsentementMarketing(consentementMarketing)} /> Autorise
            les campagnes SMS / e-mail.
          </span>
        </span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="table-actions">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function ApercuSection({ clientId }: { clientId: string }) {
  const { data: tdb, isLoading, isError } = useTableauDeBord(clientId);
  if (isLoading) return <LoadingState label="Chargement des indicateurs..." />;
  if (isError || !tdb) return <p role="alert">Impossible de charger le tableau de bord.</p>;

  return (
    <div className="client-kpi-grid">
      <article className="client-kpi-card">
        <div className="client-kpi-label">
          Total dépensé
          <InfoTooltip insight={insightTotalDepense(tdb.totalDepense, tdb.nombreAchats)} />
        </div>
        <div className="client-kpi-value money">{tdb.totalDepense}</div>
        <div className="client-kpi-hint">FCFA · réseau entier</div>
      </article>
      <article className="client-kpi-card">
        <div className="client-kpi-label">
          Achats
          <InfoTooltip insight={insightNombreAchats(tdb.nombreAchats)} />
        </div>
        <div className="client-kpi-value">{tdb.nombreAchats}</div>
        <div className="client-kpi-hint">tickets rattachés</div>
      </article>
      <article className="client-kpi-card">
        <div className="client-kpi-label">
          Dernier achat
          <InfoTooltip insight={insightDernierAchat(tdb.dateDernierAchat)} />
        </div>
        <div className="client-kpi-value client-kpi-value-sm">
          {tdb.dateDernierAchat
            ? new Date(tdb.dateDernierAchat).toLocaleDateString()
            : '—'}
        </div>
        <div className="client-kpi-hint">
          {tdb.dateDernierAchat
            ? new Date(tdb.dateDernierAchat).toLocaleTimeString()
            : 'aucune vente'}
        </div>
      </article>
      <article className="client-kpi-card">
        <div className="client-kpi-label">
          Fidélité
          <InfoTooltip insight={insightFidelite(tdb.niveauFidelite, tdb.pointsCumules)} />
        </div>
        <div className="client-kpi-value">{tdb.niveauFidelite}</div>
        <div className="client-kpi-hint">{tdb.pointsCumules} points</div>
      </article>
    </div>
  );
}

const LIBELLE_MODE_PAIEMENT: Record<ModePaiement, string> = {
  [ModePaiement.ESPECES]: 'Espèces',
  [ModePaiement.CARTE]: 'Carte',
  [ModePaiement.MOBILE_MONEY]: 'Mobile Money',
};

function libelleCaisse(v: VenteHistoriqueDto) {
  const boutique = v.caisse.boutique?.nom;
  const type = v.caisse.type === 'AUXILIAIRE' ? 'Caisse boutique' : 'Caisse';
  return boutique ? `${boutique} · ${type}` : type;
}

function libelleEnregistreur(v: VenteHistoriqueDto) {
  if (!v.enregistrePar) return '—';
  return `${v.enregistrePar.prenom} ${v.enregistrePar.nom}`.trim();
}

function AchatsSection({ clientId }: { clientId: string }) {
  const { data: ventes, isLoading, isError } = useHistoriqueAchats(clientId);
  if (isLoading) return <LoadingState label="Chargement de l'historique..." />;
  if (isError) return <p role="alert">Erreur lors du chargement de l'historique.</p>;
  if (!ventes || ventes.length === 0) {
    return <p className="lead">Aucun achat enregistré pour ce client.</p>;
  }

  return (
    <div className="clients-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Montant</th>
            <th>Paiement</th>
            <th>Enregistré par</th>
            <th>Point de vente</th>
            <th>Articles</th>
          </tr>
        </thead>
        <tbody>
          {ventes.map((v) => (
            <tr key={v.id}>
              <td>{new Date(v.dateVente).toLocaleString()}</td>
              <td className="money">{v.montantTotal}</td>
              <td>
                <span
                  className={`badge badge-paiement badge-paiement-${v.modePaiement.toLowerCase()}`}
                >
                  {LIBELLE_MODE_PAIEMENT[v.modePaiement] ?? v.modePaiement}
                </span>
              </td>
              <td>{libelleEnregistreur(v)}</td>
              <td>{libelleCaisse(v)}</td>
              <td>
                {v.lignes
                  .map((l) => `${l.produit.designation} ×${l.quantite}`)
                  .join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FideliteSection({
  client,
  peutAdmin,
}: {
  client: ClientDto;
  peutAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [points, setPoints] = useState('10');
  const [motif, setMotif] = useState('');
  const [error, setError] = useState<string | null>(null);

  const credit = useMutation({
    mutationFn: () =>
      apiFetch(`/crm/clients/${client.id}/fidelite/points`, {
        method: 'POST',
        body: JSON.stringify({
          points: Number(points),
          motif: motif.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setMotif('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    },
    onError: () => setError('Échec du crédit de points.'),
  });

  const fidelite = client.fidelite;

  return (
    <div className="client-fiche-fidelite">
      <dl className="clients-dl">
        <div>
          <dt>Palier</dt>
          <dd>
            {fidelite?.niveau ?? NiveauFidelite.BRONZE}
            <InfoTooltip
              insight={insightFidelite(
                fidelite?.niveau ?? NiveauFidelite.BRONZE,
                fidelite?.pointsCumules ?? 0,
              )}
            />
          </dd>
        </div>
        <div>
          <dt>Points cumulés</dt>
          <dd>{fidelite?.pointsCumules ?? 0}</dd>
        </div>
      </dl>

      {peutAdmin && (
        <form
          className="client-fiche-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!Number.isInteger(Number(points)) || Number(points) < 1) {
              setError('Indiquez un nombre de points entier ≥ 1.');
              return;
            }
            setError(null);
            credit.mutate();
          }}
        >
          <h3>Créditer des points</h3>
          <div className="form-grid-2">
            <div className="form-field">
              <label htmlFor="pts">Points</label>
              <input
                id="pts"
                type="number"
                min={1}
                step={1}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="motif">Motif</label>
              <input
                id="motif"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={credit.isPending}>
            {credit.isPending ? 'Crédit…' : 'Créditer'}
          </button>
        </form>
      )}
    </div>
  );
}

function InteractionsSection({
  clientId,
  peutCreer,
}: {
  clientId: string;
  peutCreer: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useInteractions(clientId);
  const [type, setType] = useState('RELANCE');
  const [canal, setCanal] = useState<CanalInteraction>(CanalInteraction.APPEL);
  const [contenu, setContenu] = useState('');
  const [error, setError] = useState<string | null>(null);

  const creation = useMutation({
    mutationFn: () =>
      apiFetch<InteractionCrmDto>(`/crm/clients/${clientId}/interactions`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          canal,
          contenu: contenu.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setContenu('');
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ['crm-clients', clientId, 'interactions'],
      });
    },
    onError: () => setError("Échec de l'enregistrement de l'interaction."),
  });

  return (
    <div className="client-fiche-interactions">
      {peutCreer && (
        <form
          className="client-fiche-form"
          onSubmit={(e) => {
            e.preventDefault();
            creation.mutate();
          }}
        >
          <h3>Nouvelle interaction</h3>
          <div className="form-grid-2">
            <div className="form-field">
              <label htmlFor="inter-type">Type</label>
              <select id="inter-type" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES_INTERACTION.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="inter-canal">Canal</label>
              <select
                id="inter-canal"
                value={canal}
                onChange={(e) => setCanal(e.target.value as CanalInteraction)}
              >
                {Object.values(CanalInteraction).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="inter-contenu">Compte-rendu</label>
            <textarea
              id="inter-contenu"
              rows={3}
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder="Optionnel"
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={creation.isPending}>
            {creation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      {isLoading && <LoadingState label="Chargement des interactions..." />}
      {isError && <p role="alert">Erreur lors du chargement des interactions.</p>}
      {data && data.length === 0 && <p className="lead">Aucune interaction enregistrée.</p>}
      {data && data.length > 0 && (
        <ul className="client-interactions-liste">
          {data.map((i) => (
            <li key={i.id}>
              <div className="client-interaction-meta">
                <strong>
                  {i.type} · {i.canal}
                </strong>
                <time dateTime={i.date}>{new Date(i.date).toLocaleString()}</time>
              </div>
              {i.contenu && <p>{i.contenu}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FicheClient({
  clientId,
  peutAdmin,
  peutCreer,
  onBack,
}: {
  clientId: string;
  peutAdmin: boolean;
  peutCreer: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: client, isLoading, isError } = useClient(clientId);
  const [onglet, setOnglet] = useState<OngletFiche>('apercu');
  const [edition, setEdition] = useState(false);

  const recalcul = useMutation({
    mutationFn: () =>
      apiFetch<ClientDto>(`/crm/clients/${clientId}/segment/recalculer`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    },
  });

  if (isLoading) return <LoadingState label="Chargement de la fiche..." />;
  if (isError || !client) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Retour aux clients
        </button>
        <p role="alert">Impossible de charger la fiche client.</p>
      </div>
    );
  }

  const titre = libelleClient(client);
  const morale = estMorale(client);
  const initiales = (
    morale
      ? client.nom.slice(0, 2)
      : `${client.prenom?.[0] ?? ''}${client.nom[0] ?? ''}`
  ).toUpperCase();

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Clients
        </button>
        <div className="client-workspace-toolbar-actions">
          {peutAdmin && onglet === 'identite' && !edition && (
            <>
              <button type="button" onClick={() => setEdition(true)}>
                Modifier
              </button>
              <button
                type="button"
                disabled={recalcul.isPending}
                onClick={() => recalcul.mutate()}
              >
                {recalcul.isPending ? 'Recalcul…' : 'Recalculer le segment'}
              </button>
            </>
          )}
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          {initiales || '?'}
        </div>
        <div className="client-workspace-hero-main">
          <h1>{titre}</h1>
          <p className="client-workspace-hero-sub">
            Fiche unique réseau
            <InfoTooltip insight={insightFicheReseau()} />
          </p>
          <div className="client-workspace-chips">
            <span className={`badge-type badge-type-${client.typeClient.toLowerCase()}`}>
              {morale ? 'Personne morale' : 'Personne physique'}
            </span>
            <InfoTooltip insight={insightTypeClient(client.typeClient)} />
            <span className="badge badge-neutral">{client.segment}</span>
            {client.fidelite && (
              <span className="badge badge-accent">
                {client.fidelite.niveau} · {client.fidelite.pointsCumules} pts
              </span>
            )}
            {client.consentementMarketing ? (
              <span className="badge badge-ok">Marketing autorisé</span>
            ) : (
              <span className="badge badge-neutral">Hors campagnes</span>
            )}
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Contact</strong> {client.contact ?? '—'}
            </span>
            {!morale && (
              <span>
                <strong>Naissance</strong>{' '}
                {client.dateNaissance
                  ? new Date(client.dateNaissance).toLocaleDateString()
                  : '—'}
              </span>
            )}
            {morale && client.prenom && (
              <span>
                <strong>Interlocuteur</strong> {client.prenom}
              </span>
            )}
          </div>
        </div>
      </header>

      <nav className="client-workspace-tabs" aria-label="Sections fiche client">
        {(
          [
            ['apercu', "Vue d'ensemble"],
            ['identite', 'Identité'],
            ['achats', 'Achats'],
            ['fidelite', 'Fidélité'],
            ['interactions', 'Interactions'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={onglet === id ? 'actif' : ''}
            onClick={() => {
              setOnglet(id);
              setEdition(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="client-workspace-panel" aria-live="polite">
        {onglet === 'apercu' && (
          <div className="client-workspace-section">
            <h2>Indicateurs réseau</h2>
            <ApercuSection clientId={client.id} />
            <div className="client-workspace-split">
              <div className="panel client-workspace-card">
                <h3>Coordonnées</h3>
                <dl className="clients-dl">
                  <div>
                    <dt>Contact</dt>
                    <dd>{client.contact ?? '—'}</dd>
                  </div>
                  {!morale && (
                    <div>
                      <dt>Date de naissance</dt>
                      <dd>
                        {client.dateNaissance
                          ? new Date(client.dateNaissance).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                  )}
                  {morale && (
                    <div>
                      <dt>Interlocuteur</dt>
                      <dd>{client.prenom ?? '—'}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Consentement</dt>
                    <dd>{client.consentementMarketing ? 'Oui' : 'Non'}</dd>
                  </div>
                </dl>
              </div>
              <div className="panel client-workspace-card">
                <h3>Segmentation</h3>
                <dl className="clients-dl">
                  <div>
                    <dt>Type</dt>
                    <dd>{morale ? 'Morale' : 'Physique'}</dd>
                  </div>
                  <div>
                    <dt>Segment</dt>
                    <dd>{client.segment}</dd>
                  </div>
                  <div>
                    <dt>Fidélité</dt>
                    <dd>
                      {client.fidelite
                        ? `${client.fidelite.niveau} (${client.fidelite.pointsCumules} pts)`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {onglet === 'identite' && (
          <div className="client-workspace-section">
            <h2>Identité</h2>
            {edition && peutAdmin ? (
              <div className="panel client-workspace-card">
                <IdentiteForm client={client} onDone={() => setEdition(false)} />
              </div>
            ) : (
              <div className="panel client-workspace-card">
                <dl className="clients-dl">
                  <div>
                    <dt>{morale ? 'Raison sociale' : 'Nom'}</dt>
                    <dd>{client.nom}</dd>
                  </div>
                  <div>
                    <dt>{morale ? 'Interlocuteur' : 'Prénom'}</dt>
                    <dd>{client.prenom ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Contact</dt>
                    <dd>{client.contact ?? '—'}</dd>
                  </div>
                  {!morale && (
                    <div>
                      <dt>Naissance</dt>
                      <dd>
                        {client.dateNaissance
                          ? new Date(client.dateNaissance).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Segment</dt>
                    <dd>{client.segment}</dd>
                  </div>
                  <div>
                    <dt>Consentement</dt>
                    <dd>{client.consentementMarketing ? 'Oui' : 'Non'}</dd>
                  </div>
                </dl>
                {peutAdmin && (
                  <div className="table-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setEdition(true)}
                    >
                      Modifier la fiche
                    </button>
                    <button
                      type="button"
                      disabled={recalcul.isPending}
                      onClick={() => recalcul.mutate()}
                    >
                      {recalcul.isPending ? 'Recalcul…' : 'Recalculer le segment'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {onglet === 'achats' && (
          <div className="client-workspace-section">
            <h2>Historique d’achats</h2>
            <div className="panel client-workspace-card">
              <AchatsSection clientId={client.id} />
            </div>
          </div>
        )}

        {onglet === 'fidelite' && (
          <div className="client-workspace-section">
            <h2>Programme de fidélité</h2>
            <div className="panel client-workspace-card">
              <FideliteSection client={client} peutAdmin={peutAdmin} />
            </div>
          </div>
        )}

        {onglet === 'interactions' && (
          <div className="client-workspace-section">
            <h2>Interactions CRM</h2>
            <div className="panel client-workspace-card">
              <InteractionsSection clientId={client.id} peutCreer={peutCreer} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
