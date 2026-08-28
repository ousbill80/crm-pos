import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Calendar,
  Copy,
  FileText,
  Gift,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  ShoppingBag,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CanalInteraction,
  NiveauFidelite,
  SegmentClient,
  TypeClient,
} from '@caisse-crm/shared';
import { libellePaiements } from '../lib/paiement-vente';
import { badgeDevis, STATUT_DEVIS, type StatutDevis } from '../lib/devis-ui';
import {
  badgeFacture,
  STATUT_FACTURE,
  type StatutFactureClient,
} from '../lib/facture-client-ui';
import { apiFetch } from '../lib/api';
import { LoadingState } from './LoadingState';
import { EmptyState } from './PageChrome';
import { InfoTooltip } from './InfoTooltip';
import { CrmKpiGrid, CrmKpiWidget } from './CrmKpiWidget';
import { CRM_KPI, pctPart } from '../lib/crm-kpi-accents';
import {
  badgeCanal,
  CANAL_META,
  LIBELLE_CANAL,
  statsParCanal,
} from '../lib/crm-interactions-ui';
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

export type OngletFicheClient =
  | 'apercu'
  | 'identite'
  | 'achats'
  | 'devis'
  | 'factures'
  | 'fidelite'
  | 'interactions';

type OngletFiche = OngletFicheClient;

const TYPES_INTERACTION = ['RELANCE', 'SAV', 'PROSPECTION', 'SUIVI', 'AUTRE'] as const;

function estMorale(c: ClientDto) {
  return c.typeClient === TypeClient.MORALE;
}

function libelleClient(c: ClientDto) {
  return estMorale(c) ? c.nom : `${c.prenom ?? ''} ${c.nom}`.trim();
}

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

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function ageAns(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1;
  return a >= 0 ? a : null;
}

function joursDepuis(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000),
  );
}

function lienContact(contact: string): { href: string; kind: 'tel' | 'mailto' } | null {
  const v = contact.trim();
  if (!v) return null;
  if (v.includes('@')) return { href: `mailto:${v}`, kind: 'mailto' };
  const digits = v.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length >= 6) return { href: `tel:${digits}`, kind: 'tel' };
  return null;
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

function ApercuSection({
  tdb,
  isLoading,
  isError,
  onOnglet,
}: {
  tdb: TableauDeBordClientDto | undefined;
  isLoading: boolean;
  isError: boolean;
  onOnglet: (id: OngletFiche) => void;
}) {
  if (isLoading) return <LoadingState label="Chargement des indicateurs..." />;
  if (isError || !tdb) return <p role="alert">Impossible de charger le tableau de bord.</p>;

  const dernierHint = tdb.dateDernierAchat
    ? `il y a ${joursDepuis(tdb.dateDernierAchat)} j`
    : 'aucune vente rattachée';

  return (
    <div className="client-apercu-stack">
      <CrmKpiGrid>
        <CrmKpiWidget
          label="Total dépensé"
          value={formatFcfa(tdb.totalDepense)}
          hint="Cumul réseau · fiche unique"
          icon={ShoppingBag}
          accent={CRM_KPI.accent}
          valueClassName="money is-compact"
          insight={insightTotalDepense(tdb.totalDepense, tdb.nombreAchats)}
          onClick={() => onOnglet('achats')}
        />
        <CrmKpiWidget
          label="Achats"
          value={tdb.nombreAchats}
          hint="Tickets rattachés"
          icon={FileText}
          accent={CRM_KPI.regulier}
          insight={insightNombreAchats(tdb.nombreAchats)}
          onClick={() => onOnglet('achats')}
        />
        <CrmKpiWidget
          label="Dernier achat"
          value={
            tdb.dateDernierAchat
              ? new Date(tdb.dateDernierAchat).toLocaleDateString('fr-FR')
              : '—'
          }
          hint={dernierHint}
          icon={Calendar}
          accent={CRM_KPI.nouveau}
          valueClassName="is-compact"
          insight={insightDernierAchat(tdb.dateDernierAchat)}
          onClick={() => onOnglet('achats')}
        />
        <CrmKpiWidget
          label="Fidélité"
          value={labelFidelite(tdb.niveauFidelite)}
          hint={`${tdb.pointsCumules} point(s)`}
          icon={Gift}
          accent={
            tdb.niveauFidelite === NiveauFidelite.OR
              ? CRM_KPI.or
              : tdb.niveauFidelite === NiveauFidelite.ARGENT
                ? CRM_KPI.argent
                : CRM_KPI.bronze
          }
          insight={insightFidelite(tdb.niveauFidelite, tdb.pointsCumules)}
          onClick={() => onOnglet('fidelite')}
        />
      </CrmKpiGrid>
      <div className="client-pdv-summary">
        <div className="client-kpi-label">Magasins fréquentés</div>
        {tdb.pointsDeVente.length === 0 ? (
          <p className="lead">Aucun passage rattaché — la vente anonyme reste possible.</p>
        ) : (
          <div className="client-pdv-chips">
            {tdb.pointsDeVente.map((p) => (
              <span
                key={p.id}
                className="badge badge-neutral"
                title={`${p.nombreAchats} achat(s) · ${formatFcfa(p.totalDepense)}`}
              >
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
      <EmptyState
        title="Pas encore de magasin"
        description="Les boutiques apparaissent ici dès qu’une vente est rattachée à cette fiche (le ticket anonyme reste possible)."
      />
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
              <td className="money">{formatFcfa(p.totalDepense)}</td>
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
    return (
      <EmptyState
        title="Aucun achat rattaché"
        description="Rattacher le prochain ticket POS à cette fiche pour construire l’historique réseau."
      />
    );
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
              <td className="money">{formatFcfa(v.montantTotal)}</td>
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

interface DevisClientItem {
  id: string;
  numero: string;
  statut: string;
  montantTotal: string;
  createdAt: string;
  _count: { lignes: number };
}

function DevisSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['devis', 'client', clientId],
    queryFn: () =>
      apiFetch<DevisClientItem[]>(
        `/devis?clientId=${encodeURIComponent(clientId)}`,
      ),
  });

  if (isLoading) return <LoadingState label="Chargement des devis…" />;
  if (isError) {
    return (
      <p role="alert">
        Impossible de charger les devis (droits lecture devis requis).
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Aucun devis"
        description="Créez un devis B2B depuis Ventes → Devis clients."
      />
    );
  }

  return (
    <div className="clients-table-wrap">
      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Statut</th>
            <th className="num">Montant HT</th>
            <th className="num">Lignes</th>
            <th>Créé</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.numero}</strong>
              </td>
              <td>
                <span className={badgeDevis(d.statut)}>
                  {STATUT_DEVIS[d.statut as StatutDevis] ?? d.statut}
                </span>
              </td>
              <td className="num money">{formatFcfa(d.montantTotal)}</td>
              <td className="num">{d._count.lignes}</td>
              <td>{new Date(d.createdAt).toLocaleString('fr-FR')}</td>
              <td>
                <Link to={`/ventes/devis/${d.id}`}>Ouvrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lead" style={{ marginTop: 12 }}>
        <Link to="/ventes/devis">Tous les devis →</Link>
      </p>
    </div>
  );
}

interface FactureClientItem {
  id: string;
  numero: string;
  statut: string;
  montantTtc: string;
  solde: string;
  createdAt: string;
  lignes: unknown[];
}

function FacturesSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['factures-client', 'client', clientId],
    queryFn: () =>
      apiFetch<FactureClientItem[]>(
        `/factures-client?clientId=${encodeURIComponent(clientId)}`,
      ),
  });

  if (isLoading) return <LoadingState label="Chargement des factures…" />;
  if (isError) {
    return (
      <p role="alert">
        Impossible de charger les factures (droits lecture facture requis).
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Aucune facture"
        description="Créez une facture B2B depuis Ventes → Factures clients, ou transformez un devis accepté."
      />
    );
  }

  return (
    <div className="clients-table-wrap">
      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Statut</th>
            <th className="num">TTC</th>
            <th className="num">Solde</th>
            <th>Créée</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((f) => (
            <tr key={f.id}>
              <td>
                <strong>{f.numero}</strong>
              </td>
              <td>
                <span className={badgeFacture(f.statut)}>
                  {STATUT_FACTURE[f.statut as StatutFactureClient] ?? f.statut}
                </span>
              </td>
              <td className="num money">{formatFcfa(f.montantTtc)}</td>
              <td className="num money">{formatFcfa(f.solde)}</td>
              <td>{new Date(f.createdAt).toLocaleString('fr-FR')}</td>
              <td>
                <Link to={`/ventes/factures/${f.id}`}>Ouvrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lead" style={{ marginTop: 12 }}>
        <Link to="/ventes/factures">Toutes les factures →</Link>
      </p>
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
          noValidate
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
  const [filtreCanal, setFiltreCanal] = useState('');

  const statsCanal = useMemo(() => statsParCanal(data ?? []), [data]);
  const timeline = useMemo(() => {
    const list = data ?? [];
    if (!filtreCanal) return list;
    return list.filter((i) => i.canal === filtreCanal);
  }, [data, filtreCanal]);

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

      {data && data.length > 0 && (
        <CrmKpiGrid className="crm-kpi-grid--scroll client-interactions-kpis">
          <CrmKpiWidget
            label="Interactions"
            value={data.length}
            hint={
              filtreCanal
                ? `${timeline.length} affichée(s) avec filtre`
                : 'Historique client'
            }
            icon={MessageSquare}
            accent={CRM_KPI.interactions}
            active={!filtreCanal}
            onClick={() => setFiltreCanal('')}
          />
          {Object.values(CanalInteraction)
            .filter((c) => (statsCanal[c] ?? 0) > 0)
            .map((c) => {
              const meta = CANAL_META[c];
              const n = statsCanal[c] ?? 0;
              return (
                <CrmKpiWidget
                  key={c}
                  label={LIBELLE_CANAL[c]}
                  value={n}
                  hint={meta.hint}
                  badge={pctPart(n, data.length)}
                  icon={meta.icon}
                  accent={meta.accent}
                  active={filtreCanal === c}
                  onClick={() => setFiltreCanal(filtreCanal === c ? '' : c)}
                />
              );
            })}
        </CrmKpiGrid>
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
        {data && data.length > 0 && timeline.length === 0 && (
          <div className="client-interactions-empty">
            <p className="lead">Aucune interaction pour ce canal.</p>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setFiltreCanal('')}
            >
              Voir tout l’historique
            </button>
          </div>
        )}
        {timeline.length > 0 && (
          <ul className="client-interactions-liste">
            {timeline.map((i) => (
              <li key={i.id}>
                <div className="client-interaction-meta">
                  <div className="client-interaction-badges">
                    <span className="badge badge-accent">
                      {LIBELLE_TYPE_INTERACTION[
                        i.type as (typeof TYPES_INTERACTION)[number]
                      ] ?? i.type}
                    </span>
                    {badgeCanal(i.canal as CanalInteraction)}
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
  ongletInitial,
}: {
  clientId: string;
  peutAdmin: boolean;
  peutCreer: boolean;
  onBack: () => void;
  ongletInitial?: OngletFicheClient;
}) {
  const queryClient = useQueryClient();
  const { data: client, isLoading, isError } = useClient(clientId);
  const tdbQ = useTableauDeBord(clientId);
  const interQ = useInteractions(clientId);
  const [onglet, setOnglet] = useState<OngletFiche>(ongletInitial ?? 'apercu');
  const [edition, setEdition] = useState(false);
  const [copieOk, setCopieOk] = useState(false);

  const recalcul = useMutation({
    mutationFn: () =>
      apiFetch<ClientDto>(`/crm/clients/${clientId}/segment/recalculer`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    },
  });

  function aller(id: OngletFiche) {
    setOnglet(id);
    setEdition(false);
  }

  async function copierContact(valeur: string) {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopieOk(true);
      window.setTimeout(() => setCopieOk(false), 1600);
    } catch {
      setCopieOk(false);
    }
  }

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
  const niveau = client.fidelite?.niveau ?? NiveauFidelite.BRONZE;
  const points = client.fidelite?.pointsCumules ?? 0;
  const initiales = (
    morale
      ? client.nom.slice(0, 2)
      : `${client.prenom?.[0] ?? ''}${client.nom[0] ?? ''}`
  ).toUpperCase();
  const tdb = tdbQ.data;
  const nbInter = interQ.data?.length ?? 0;
  const derniereInter = interQ.data?.[0];
  const contactLien = client.contact ? lienContact(client.contact) : null;
  const age = client.dateNaissance ? ageAns(client.dateNaissance) : null;

  const tabs: Array<{
    id: OngletFiche;
    label: string;
    icon: typeof User;
    count?: number;
  }> = [
    { id: 'apercu', label: "Vue d'ensemble", icon: User },
    { id: 'identite', label: 'Identité', icon: morale ? Building2 : User },
    { id: 'achats', label: 'Achats', icon: ShoppingBag, count: tdb?.nombreAchats },
    { id: 'devis', label: 'Devis', icon: FileText },
    { id: 'factures', label: 'Factures', icon: Receipt },
    { id: 'fidelite', label: 'Fidélité', icon: Gift },
    { id: 'interactions', label: 'Interactions', icon: MessageSquare, count: nbInter },
  ];

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Clients
        </button>
        <div className="client-workspace-toolbar-actions">
          {peutCreer && (
            <button type="button" onClick={() => aller('interactions')}>
              <MessageSquare size={14} /> Interaction
            </button>
          )}
          {peutAdmin && (
            <>
              <button
                type="button"
                disabled={recalcul.isPending}
                onClick={() => {
                  aller('identite');
                  recalcul.mutate();
                }}
              >
                <RefreshCw size={14} />
                {recalcul.isPending ? 'Recalcul…' : 'Recalculer le segment'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  aller('identite');
                  setEdition(true);
                }}
              >
                <Pencil size={14} /> Modifier
              </button>
            </>
          )}
        </div>
      </div>

      <header
        className={`client-workspace-hero fiche-client-hero fiche-client-hero-${niveau.toLowerCase()}`}
      >
        <div
          className={`client-workspace-avatar fiche-client-avatar fiche-client-avatar-${niveau.toLowerCase()}`}
          aria-hidden
        >
          {morale ? <Building2 size={28} /> : initiales || '?'}
        </div>
        <div className="client-workspace-hero-main">
          <h1>{titre}</h1>
          <p className="client-workspace-hero-sub">
            Fiche unique réseau
            <InfoTooltip insight={insightFicheReseau()} />
            {morale && client.prenom ? ` · Interlocuteur ${client.prenom}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span className={`badge-type badge-type-${client.typeClient.toLowerCase()}`}>
              {morale ? 'Personne morale' : 'Personne physique'}
            </span>
            <InfoTooltip insight={insightTypeClient(client.typeClient)} />
            <span className="badge badge-neutral">{labelSegment(client.segment)}</span>
            <span className={`badge badge-fidelite badge-fidelite-${niveau.toLowerCase()}`}>
              {labelFidelite(niveau)} · {points} pts
            </span>
            {client.consentementMarketing ? (
              <span className="badge badge-ok">Marketing autorisé</span>
            ) : (
              <span className="badge badge-warning">Hors campagnes</span>
            )}
            {!client.contact && (
              <span className="badge badge-warning">Sans contact</span>
            )}
          </div>
          <div className="client-workspace-meta fiche-client-meta">
            <span>
              <strong>Contact</strong>{' '}
              {client.contact ? (
                <span className="fiche-client-contact">
                  {contactLien ? (
                    <a href={contactLien.href}>
                      {contactLien.kind === 'mailto' ? (
                        <Mail size={12} />
                      ) : (
                        <Phone size={12} />
                      )}{' '}
                      {client.contact}
                    </a>
                  ) : (
                    client.contact
                  )}
                  <button
                    type="button"
                    className="btn-ghost fiche-client-copy"
                    onClick={() => void copierContact(client.contact!)}
                    aria-label="Copier le contact"
                    title="Copier"
                  >
                    <Copy size={12} />
                    {copieOk ? 'Copié' : ''}
                  </button>
                </span>
              ) : (
                '—'
              )}
            </span>
            {client.adresse && (
              <span>
                <strong>Adresse</strong> <MapPin size={12} /> {client.adresse}
              </span>
            )}
            {!morale && (
              <span>
                <strong>Naissance</strong>{' '}
                {client.dateNaissance
                  ? `${new Date(client.dateNaissance).toLocaleDateString('fr-FR')}${
                      age != null ? ` · ${age} ans` : ''
                    }`
                  : '—'}
              </span>
            )}
          </div>
        </div>
        <aside className="fiche-hero-stats" aria-label="Indicateurs rapides">
          <button type="button" onClick={() => aller('achats')}>
            <span>Cumul</span>
            <strong>
              {tdbQ.isLoading ? '…' : formatFcfa(tdb?.totalDepense ?? '0')}
            </strong>
          </button>
          <button type="button" onClick={() => aller('achats')}>
            <span>Tickets</span>
            <strong>{tdbQ.isLoading ? '…' : (tdb?.nombreAchats ?? 0)}</strong>
          </button>
          <button type="button" onClick={() => aller('achats')}>
            <span>Dernier achat</span>
            <strong>
              {tdbQ.isLoading
                ? '…'
                : tdb?.dateDernierAchat
                  ? `J-${joursDepuis(tdb.dateDernierAchat)}`
                  : '—'}
            </strong>
          </button>
        </aside>
      </header>

      <nav className="client-workspace-tabs" aria-label="Sections fiche client">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={onglet === tab.id ? 'actif' : ''}
            onClick={() => aller(tab.id)}
          >
            <tab.icon size={14} aria-hidden />
            {tab.label}
            {tab.count !== undefined ? (
              <span className="fiche-tab-count">{tab.count}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <section className="client-workspace-panel" aria-live="polite">
        {onglet === 'apercu' && (
          <div className="client-workspace-section">
            <h2>Indicateurs réseau</h2>
            <ApercuSection
              tdb={tdb}
              isLoading={tdbQ.isLoading}
              isError={tdbQ.isError}
              onOnglet={aller}
            />
            <div className="client-workspace-split">
              <div className="panel client-workspace-card">
                <div className="fiche-card-head">
                  <h3>Coordonnées</h3>
                  {peutAdmin ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        aller('identite');
                        setEdition(true);
                      }}
                    >
                      Compléter
                    </button>
                  ) : null}
                </div>
                <dl className="clients-dl">
                  <div>
                    <dt>Contact</dt>
                    <dd>
                      {client.contact ? (
                        contactLien ? (
                          <a href={contactLien.href}>{client.contact}</a>
                        ) : (
                          client.contact
                        )
                      ) : (
                        <span className="fiche-card-empty">Non renseigné — requis pour les campagnes</span>
                      )}
                    </dd>
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
                          ? `${new Date(client.dateNaissance).toLocaleDateString('fr-FR')}${
                              age != null ? ` (${age} ans)` : ''
                            }`
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
                    <dd>
                      {client.consentementMarketing
                        ? 'Oui — ciblable campagnes'
                        : 'Non — hors campagnes'}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="panel client-workspace-card">
                <div className="fiche-card-head">
                  <h3>Segmentation</h3>
                  {peutAdmin ? (
                    <button type="button" className="btn-ghost" onClick={() => aller('fidelite')}>
                      Fidélité
                    </button>
                  ) : null}
                </div>
                <dl className="clients-dl">
                  <div>
                    <dt>Type</dt>
                    <dd>{morale ? 'Personne morale' : 'Personne physique'}</dd>
                  </div>
                  <div>
                    <dt>Segment</dt>
                    <dd>{labelSegment(client.segment)}</dd>
                  </div>
                  <div>
                    <dt>Fidélité</dt>
                    <dd>
                      {labelFidelite(niveau)} · {points} point(s)
                    </dd>
                  </div>
                  <div>
                    <dt>Dernière interaction</dt>
                    <dd>
                      {derniereInter
                        ? `${LIBELLE_CANAL[derniereInter.canal]} · ${new Date(
                            derniereInter.date,
                          ).toLocaleDateString('fr-FR')}`
                        : 'Aucune'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="panel client-workspace-card">
              <div className="fiche-card-head">
                <h3>Magasins fréquentés</h3>
              </div>
              <p className="lead">
                Boutiques où ce client a déjà acheté — fiche unique réseau, pas de
                rattachement unique.
              </p>
              <PointsDeVenteFromTdb clientId={client.id} />
            </div>

            <div className="panel client-workspace-card">
              <div className="client-section-head">
                <h3>Historique des achats</h3>
                <button type="button" className="btn-ghost" onClick={() => aller('achats')}>
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
                    <dd>
                      {client.contact ? (
                        contactLien ? (
                          <a href={contactLien.href}>{client.contact}</a>
                        ) : (
                          client.contact
                        )
                      ) : (
                        '—'
                      )}
                    </dd>
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
                          ? `${new Date(client.dateNaissance).toLocaleDateString('fr-FR')}${
                              age != null ? ` · ${age} ans` : ''
                            }`
                          : '—'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Segment</dt>
                    <dd>{labelSegment(client.segment)}</dd>
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
            <p className="lead">
              Tous les tickets rattachés à cette fiche, tous magasins confondus (§6.6).
            </p>
            <div className="panel client-workspace-card">
              <AchatsSection clientId={client.id} />
            </div>
          </div>
        )}

        {onglet === 'devis' && (
          <div className="client-workspace-section">
            <h2>Devis B2B</h2>
            <p className="lead">
              Devis hors TVA liés à cette fiche — workflow documenté (hors CDC).
            </p>
            <div className="panel client-workspace-card">
              <DevisSection clientId={client.id} />
            </div>
          </div>
        )}

        {onglet === 'factures' && (
          <div className="client-workspace-section">
            <h2>Factures client</h2>
            <p className="lead">
              Pièces B2B (HT + TVA) — distinctes des tickets POS (§ facture client).
            </p>
            <div className="panel client-workspace-card">
              <FacturesSection clientId={client.id} />
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
