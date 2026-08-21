import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CanalInteraction,
  NiveauFidelite,
  SegmentClient,
  TypeClient,
} from '@caisse-crm/shared';
import { libellePaiements } from '../lib/paiement-vente';
import { apiFetch } from '../lib/api';
import { LoadingState } from './LoadingState';
import { InfoTooltip } from './InfoTooltip';
import {
  insightAdresseClient,
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
  const [adresse, setAdresse] = useState(client.adresse ?? '');
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
          adresse: adresse.trim() || undefined,
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
      <div className="form-field">
        <label htmlFor="edit-adresse">
          Adresse <InfoTooltip insight={insightAdresseClient(adresse)} />
        </label>
        <input id="edit-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
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
    <div className="client-apercu-stack">
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
      <div className="client-pdv-summary">
        <div className="client-kpi-label">Points de vente</div>
        {tdb.pointsDeVente.length === 0 ? (
          <p className="lead">Aucun passage en boutique pour l’instant.</p>
        ) : (
          <div className="client-pdv-chips">
            {tdb.pointsDeVente.map((p) => (
              <span key={p.id} className="badge badge-neutral" title={`${p.nombreAchats} achat(s)`}>
                {p.nom}
                <span className="client-pdv-chip-meta"> · {p.nombreAchats}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function libelleCaisse(v: VenteHistoriqueDto) {
  const boutique = v.caisse.boutique?.nom;
  const type = v.caisse.type === 'MAGASIN' ? 'Caisse boutique' : 'Caisse';
  return boutique ? `${boutique} · ${type}` : type;
}

function libelleEnregistreur(v: VenteHistoriqueDto) {
  if (!v.enregistrePar) return '—';
  return `${v.enregistrePar.prenom} ${v.enregistrePar.nom}`.trim();
}


function PointsDeVenteFromTdb({ clientId }: { clientId: string }) {
  const { data: tdb, isLoading, isError } = useTableauDeBord(clientId);
  if (isLoading) return <LoadingState label="Chargement des points de vente..." />;
  if (isError || !tdb) {
    return <p role="alert">Impossible de charger les points de vente.</p>;
  }
  return <PointsDeVenteSection pointsDeVente={tdb.pointsDeVente} />;
}

function PointsDeVenteSection({
  pointsDeVente,
}: {
  pointsDeVente: TableauDeBordClientDto['pointsDeVente'];
}) {
  if (pointsDeVente.length === 0) {
    return (
      <p className="lead">
        Aucun point de vente pour l’instant — le client n’a pas encore d’achat
        rattaché.
      </p>
    );
  }

  return (
    <div className="clients-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Point de vente</th>
            <th>Achats</th>
            <th>Total dépensé</th>
            <th>Dernier passage</th>
          </tr>
        </thead>
        <tbody>
          {pointsDeVente.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.nom}</strong>
              </td>
              <td>{p.nombreAchats}</td>
              <td className="money">{p.totalDepense}</td>
              <td>{new Date(p.dateDernierAchat).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AchatsSection({
  clientId,
  limite,
}: {
  clientId: string;
  limite?: number;
}) {
  const { data: ventes, isLoading, isError } = useHistoriqueAchats(clientId);
  if (isLoading) return <LoadingState label="Chargement de l'historique..." />;
  if (isError) return <p role="alert">Erreur lors du chargement de l'historique.</p>;
  if (!ventes || ventes.length === 0) {
    return <p className="lead">Aucun achat enregistré pour ce client.</p>;
  }

  const liste = limite ? ventes.slice(0, limite) : ventes;

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
          {liste.map((v) => (
            <tr key={v.id}>
              <td>{new Date(v.dateVente).toLocaleString()}</td>
              <td className="money">{v.montantTotal}</td>
              <td>
                <span
                  className={`badge badge-paiement badge-paiement-${v.modePaiement.toLowerCase()}`}
                >
                  {libellePaiements(v)}
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
      {limite && ventes.length > limite && (
        <p className="lead client-achats-more">
          {ventes.length - limite} autre(s) achat(s) — voir l’onglet Achats.
        </p>
      )}
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
    mutationFn: (nb: number) =>
      apiFetch(`/crm/clients/${client.id}/fidelite/points`, {
        method: 'POST',
        body: JSON.stringify({
          points: nb,
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

  const niveau = client.fidelite?.niveau ?? NiveauFidelite.BRONZE;
  const pointsCumules = client.fidelite?.pointsCumules ?? 0;
  // Miroir de crm-thresholds.constants.ts (seuils programme fidélité §6.6).
  const SEUIL_ARGENT = 500;
  const SEUIL_OR = 2000;
  const prochain =
    niveau === NiveauFidelite.OR
      ? null
      : niveau === NiveauFidelite.ARGENT
        ? { libelle: 'OR', seuil: SEUIL_OR }
        : { libelle: 'ARGENT', seuil: SEUIL_ARGENT };
  const progress = prochain
    ? Math.min(100, Math.round((pointsCumules / prochain.seuil) * 100))
    : 100;
  const restant = prochain ? Math.max(0, prochain.seuil - pointsCumules) : 0;

  function crediter(nb: number) {
    if (!Number.isInteger(nb) || nb < 1) {
      setError('Indiquez un nombre de points entier ≥ 1.');
      return;
    }
    setError(null);
    credit.mutate(nb);
  }

  return (
    <div className="client-fidelite">
      <div className={`client-fidelite-hero client-fidelite-${niveau.toLowerCase()}`}>
        <div className="client-fidelite-hero-main">
          <span className="client-fidelite-tier">{niveau}</span>
          <InfoTooltip insight={insightFidelite(niveau, pointsCumules)} />
          <p className="client-fidelite-sub">
            {niveau === NiveauFidelite.OR
              ? 'Palier le plus élevé du programme'
              : niveau === NiveauFidelite.ARGENT
                ? 'Palier intermédiaire'
                : "Palier d'entrée du programme"}
          </p>
        </div>
        <div className="client-fidelite-points">
          <div className="client-fidelite-points-value">{pointsCumules}</div>
          <div className="client-fidelite-points-label">points cumulés</div>
        </div>
      </div>

      <div className="client-fidelite-progress">
        <div className="client-fidelite-progress-head">
          <span>BRONZE</span>
          <span>ARGENT · {SEUIL_ARGENT}</span>
          <span>OR · {SEUIL_OR}</span>
        </div>
        <div
          className="client-fidelite-progress-bar"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression vers le prochain palier"
        >
          <div style={{ width: `${progress}%` }} />
        </div>
        <p className="lead">
          {prochain
            ? `Encore ${restant} point(s) pour atteindre ${prochain.libelle}.`
            : 'Palier maximum atteint.'}
        </p>
      </div>

      {peutAdmin && (
        <form
          className="client-fiche-form client-fidelite-credit"
          onSubmit={(e) => {
            e.preventDefault();
            crediter(Number(points));
          }}
        >
          <h3>Créditer des points</h3>
          <p className="lead">Réservé au Responsable CRM — crédit uniquement (pas de débit).</p>
          <div className="client-fidelite-rapides">
            {[10, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                disabled={credit.isPending}
                onClick={() => {
                  setPoints(String(n));
                  crediter(n);
                }}
              >
                +{n}
              </button>
            ))}
          </div>
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
                placeholder="Ex. geste commercial"
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

const LIBELLE_TYPE_INTERACTION: Record<(typeof TYPES_INTERACTION)[number], string> = {
  RELANCE: 'Relance',
  SAV: 'SAV',
  PROSPECTION: 'Prospection',
  SUIVI: 'Suivi',
  AUTRE: 'Autre',
};

const LIBELLE_CANAL: Record<CanalInteraction, string> = {
  [CanalInteraction.APPEL]: 'Appel',
  [CanalInteraction.SMS]: 'SMS',
  [CanalInteraction.WHATSAPP]: 'WhatsApp',
  [CanalInteraction.VISITE]: 'Visite',
  [CanalInteraction.CAMPAGNE]: 'Campagne',
};

function InteractionsSection({
  clientId,
  peutCreer,
}: {
  clientId: string;
  peutCreer: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useInteractions(clientId);
  const [type, setType] = useState<(typeof TYPES_INTERACTION)[number]>('RELANCE');
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
    <div className="client-interactions">
      {peutCreer && (
        <form
          className="client-fiche-form client-interactions-form"
          onSubmit={(e) => {
            e.preventDefault();
            creation.mutate();
          }}
        >
          <h3>Nouvelle interaction</h3>
          <p className="lead">Tracer un contact CRM (appel, SMS, visite…).</p>

          <div className="form-field">
            <span className="client-chip-label">Type</span>
            <div className="client-chip-row" role="group" aria-label="Type d'interaction">
              {TYPES_INTERACTION.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={type === t ? 'actif' : ''}
                  onClick={() => setType(t)}
                >
                  {LIBELLE_TYPE_INTERACTION[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <span className="client-chip-label">Canal</span>
            <div className="client-chip-row" role="group" aria-label="Canal">
              {Object.values(CanalInteraction).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={canal === c ? 'actif' : ''}
                  onClick={() => setCanal(c)}
                >
                  {LIBELLE_CANAL[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="inter-contenu">Compte-rendu</label>
            <textarea
              id="inter-contenu"
              rows={3}
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder="Résumé du contact (optionnel)"
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={creation.isPending}>
            {creation.isPending ? 'Enregistrement…' : 'Enregistrer l’interaction'}
          </button>
        </form>
      )}

      <div className="client-interactions-timeline">
        <h3>Historique</h3>
        {isLoading && <LoadingState label="Chargement des interactions..." />}
        {isError && <p role="alert">Erreur lors du chargement des interactions.</p>}
        {data && data.length === 0 && (
          <div className="client-interactions-empty">
            <p className="lead">Aucune interaction enregistrée pour ce client.</p>
            {peutCreer && (
              <p className="lead">Utilisez le formulaire ci-dessus pour tracer le premier contact.</p>
            )}
          </div>
        )}
        {data && data.length > 0 && (
          <ul className="client-interactions-liste">
            {data.map((i) => (
              <li key={i.id}>
                <div className="client-interaction-meta">
                  <div className="client-interaction-badges">
                    <span className="badge badge-accent">
                      {LIBELLE_TYPE_INTERACTION[
                        i.type as (typeof TYPES_INTERACTION)[number]
                      ] ?? i.type}
                    </span>
                    <span className="badge badge-neutral">
                      {LIBELLE_CANAL[i.canal] ?? i.canal}
                    </span>
                  </div>
                  <time dateTime={i.date}>{new Date(i.date).toLocaleString()}</time>
                </div>
                {i.contenu ? (
                  <p className="client-interaction-contenu">{i.contenu}</p>
                ) : (
                  <p className="client-interaction-contenu muted">Sans compte-rendu</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
                  <div>
                    <dt>Adresse</dt>
                    <dd>{client.adresse ?? '—'}</dd>
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

            <div className="panel client-workspace-card">
              <h3>Points de vente fréquentés</h3>
              <p className="lead">
                Boutiques où ce client a déjà acheté — fiche unique réseau, pas de
                rattachement unique.
              </p>
              <PointsDeVenteFromTdb clientId={client.id} />
            </div>

            <div className="panel client-workspace-card">
              <div className="client-section-head">
                <h3>Historique des achats</h3>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setOnglet('achats');
                    setEdition(false);
                  }}
                >
                  Voir tout
                </button>
              </div>
              <AchatsSection clientId={client.id} limite={5} />
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
                  <div>
                    <dt>Adresse</dt>
                    <dd>{client.adresse ?? '—'}</dd>
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
