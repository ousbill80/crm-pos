import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import { insightInventaireAvancement } from '../lib/insights/stocks';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import type {
  EntrepotDto,
  InventairePrioriteDto,
  SessionInventaireDto,
  StockSyntheseDto,
} from '../lib/types';

type ColonneSession =
  | 'entrepot'
  | 'statut'
  | 'ouvert'
  | 'initiateur'
  | 'motif'
  | 'avancement'
  | 'ecarts';

const MOTIFS_SUGGERES = [
  'Inventaire périodique',
  'Contrôle interne',
  'Récolement après transfert',
  'Comptage suite à alerte stock',
  'Inventaire de clôture',
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

const ROLES_COMPTAGE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const STATUT_LABEL: Record<SessionInventaireDto['statut'], string> = {
  EN_COURS: 'En cours',
  VALIDE: 'Validé',
  ANNULE: 'Annulé',
};

function libelleDernierInventaire(p: InventairePrioriteDto | undefined): string {
  if (!p) return 'Historique indisponible pour cet entrepôt.';
  if (!p.dernierInventaireAt) {
    return `Jamais inventorié — cible ${p.frequenceCibleJours} jours.`;
  }
  const date = new Date(p.dernierInventaireAt).toLocaleDateString('fr-FR');
  const delai =
    p.joursDepuis === null ? '' : ` · il y a ${p.joursDepuis} j`;
  return `Dernier validé le ${date}${delai} (cible ${p.frequenceCibleJours} j).`;
}

function messageErreur(err: unknown): string {
  if (!(err instanceof Error)) return 'Une erreur est survenue.';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(' ');
  } catch {
    /* raw */
  }
  return err.message;
}

function OuvrirInventaireForm({
  entrepotId,
  motif,
  error,
  pending,
  entrepots,
  priorites,
  sessions,
  apercu,
  apercuChargement,
  utilisateurId,
  onEntrepotChange,
  onMotifChange,
  onCancel,
  onOuvrirSession,
  onSubmit,
}: {
  entrepotId: string;
  motif: string;
  error: string | null;
  pending: boolean;
  entrepots: EntrepotDto[];
  priorites: InventairePrioriteDto[];
  sessions: SessionInventaireDto[];
  apercu: StockSyntheseDto | undefined;
  apercuChargement: boolean;
  utilisateurId: string | undefined;
  onEntrepotChange: (id: string) => void;
  onMotifChange: (motif: string) => void;
  onCancel: () => void;
  onOuvrirSession: (id: string) => void;
  onSubmit: () => void;
}) {
  const entrepotsTries = useMemo(() => {
    return [...entrepots].sort((a, b) => {
      const pa = priorites.find((p) => p.entrepotId === a.id);
      const pb = priorites.find((p) => p.entrepotId === b.id);
      if (Boolean(pa?.aInventorier) !== Boolean(pb?.aInventorier)) {
        return pa?.aInventorier ? -1 : 1;
      }
      return a.code.localeCompare(b.code, 'fr');
    });
  }, [entrepots, priorites]);

  const entrepot = entrepots.find((e) => e.id === entrepotId);
  const priorite = priorites.find((p) => p.entrepotId === entrepotId);
  const enCours = sessions.find(
    (s) => s.entrepotId === entrepotId && s.statut === 'EN_COURS',
  );
  const statsEntrepot = apercu?.parEntrepot.find((e) => e.entrepotId === entrepotId);
  const sku = apercu?.kpis.skuDistincts ?? 0;
  const unites = statsEntrepot?.unites ?? apercu?.kpis.unitesTotales ?? 0;
  const ruptures = statsEntrepot?.ruptures ?? apercu?.kpis.ruptures ?? 0;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (enCours) {
          onOuvrirSession(enCours.id);
          return;
        }
        onSubmit();
      }}
    >
      <datalist id="motifs-inventaire">
        {MOTIFS_SUGGERES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {entrepots.length === 0 ? (
        <p role="alert">Aucun entrepôt dans votre périmètre.</p>
      ) : (
        <>
          <label htmlFor="inv-ent">Entrepôt</label>
          <select
            id="inv-ent"
            value={entrepotId}
            onChange={(e) => onEntrepotChange(e.target.value)}
            required
          >
            {entrepotsTries.map((e) => {
              const p = priorites.find((x) => x.entrepotId === e.id);
              const type = e.type === 'PRINCIPAL' ? 'Principal' : 'Secondaire';
              const flag = p?.aInventorier ? ' — à inventorier' : '';
              return (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.boutique?.nom ?? e.nom} ({type}){flag}
                </option>
              );
            })}
          </select>

          {entrepot && (
            <p className="lead" style={{ margin: 0 }}>
              {entrepot.nom} · {entrepot.boutique?.nom ?? '—'} ·{' '}
              {entrepot.type === 'PRINCIPAL' ? 'Principal' : 'Secondaire'}
              {entrepot.actif ? '' : ' · inactif'}
              <br />
              {libelleDernierInventaire(priorite)}
              {priorite?.aInventorier ? (
                <>
                  {' '}
                  <span className="badge badge-warning">Échéance dépassée</span>
                </>
              ) : priorite ? (
                <>
                  {' '}
                  <span className="badge badge-ok">Dans les délais</span>
                </>
              ) : null}
            </p>
          )}

          {enCours ? (
            <div className="produits-callout">
              <strong>Inventaire déjà en cours</strong>
              <p>
                Ouvert le {new Date(enCours.dateOuverture).toLocaleString('fr-FR')} par{' '}
                {enCours.initiateur.prenom} {enCours.initiateur.nom}
                {enCours.motif ? ` · ${enCours.motif}` : ''}. Un seul inventaire
                EN_COURS est autorisé par entrepôt.
              </p>
            </div>
          ) : apercuChargement ? (
            <LoadingState label="Aperçu du snapshot..." />
          ) : (
            <dl className="inventaire-preview">
              <div className="inventaire-preview-card">
                <dt>Références figées</dt>
                <dd>
                  {sku}
                  <small>produits actifs de l’entrepôt</small>
                </dd>
              </div>
              <div className="inventaire-preview-card">
                <dt>Unités théoriques</dt>
                <dd>
                  {unites}
                  <small>quantités actuelles, snapshot</small>
                </dd>
              </div>
              <div className="inventaire-preview-card">
                <dt>Ruptures</dt>
                <dd>
                  {ruptures}
                  <small>emplacements à 0 avant comptage</small>
                </dd>
              </div>
            </dl>
          )}

          {sku === 0 && !enCours && !apercuChargement && entrepotId !== '' && (
            <p className="lead">
              Aucun produit actif dans cet entrepôt : la session s’ouvrira sans
              ligne à compter.
            </p>
          )}

          <label htmlFor="inv-motif">Motif (optionnel)</label>
          <input
            id="inv-motif"
            list="motifs-inventaire"
            value={motif}
            onChange={(e) => onMotifChange(e.target.value)}
            placeholder="Ex. inventaire périodique août"
            disabled={Boolean(enCours)}
          />

          <ol className="inventaire-workflow">
            <li>
              <strong>Figer</strong> — les quantités actuelles deviennent le
              théorique ; le stock n’est pas modifié.
            </li>
            <li>
              <strong>Compter</strong> — vous saisissez le réel, ligne par ligne.
            </li>
            <li>
              <strong>Valider par un tiers</strong> — un autre utilisateur habilité
              {utilisateurId ? ' (pas vous, initiateur)' : ''} applique les écarts
              en écritures d’ajustement.
            </li>
          </ol>
        </>
      )}

      {error && <p role="alert">{error}</p>}
      <div className="table-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        {enCours ? (
          <button type="submit" className="btn-primary">
            Reprendre le comptage
          </button>
        ) : (
          <button
            type="submit"
            className="btn-primary"
            disabled={pending || entrepots.length === 0 || !entrepotId}
          >
            {pending ? 'Ouverture…' : 'Figer le théorique et compter'}
          </button>
        )}
      </div>
    </form>
  );
}

export function InventairesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCompter = user !== null && ROLES_COMPTAGE.includes(user.role);

  const magasin = useFiltreMagasinSiege();
  const [modalOuvrir, setModalOuvrir] = useState(false);
  const [entrepotId, setEntrepotId] = useState('');
  const [motif, setMotif] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<'' | SessionInventaireDto['statut']>('');
  const [sortSessions, setSortSessions] = useState<SortState<ColonneSession> | null>(null);

  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const priorites = useQuery({
    queryKey: ['inventaires-priorites'],
    queryFn: () => apiFetch<InventairePrioriteDto[]>('/inventaires/priorites'),
    enabled: peutLire,
  });
  const sessions = useQuery({
    queryKey: ['inventaires'],
    queryFn: () => apiFetch<SessionInventaireDto[]>('/inventaires'),
    enabled: peutLire,
  });
  const apercuStock = useQuery({
    queryKey: ['stocks-synthese', entrepotId],
    queryFn: () =>
      apiFetch<StockSyntheseDto>(`/stocks/synthese?entrepotId=${entrepotId}`),
    enabled: peutLire && modalOuvrir && entrepotId !== '',
  });

  const entrepotsMagasin = useMemo(() => {
    const all = entrepots.data ?? [];
    if (!magasin.boutiqueId) return all;
    return all.filter((e) => e.boutiqueId === magasin.boutiqueId);
  }, [entrepots.data, magasin.boutiqueId]);

  function ouvrirModal(prefillEntrepot?: string) {
    const priorite =
      prefillEntrepot ||
      (priorites.data ?? []).find((p) => p.aInventorier)?.entrepotId;
    setEntrepotId(priorite ?? entrepotsMagasin[0]?.id ?? '');
    setMotif('');
    setFormErr(null);
    setModalOuvrir(true);
  }

  useEffect(() => {
    if (!peutCompter) return;
    if (searchParams.get('ouvrir') !== '1') return;
    if (!entrepots.data) return;
    const fromQuery = searchParams.get('entrepotId');
    ouvrirModal(fromQuery ?? undefined);
    const next = new URLSearchParams();
    const bid = searchParams.get('boutiqueId');
    if (bid) next.set('boutiqueId', bid);
    setSearchParams(next, { replace: true });
  }, [peutCompter, searchParams, entrepots.data]);

  const ouvrir = useMutation({
    mutationFn: () =>
      apiFetch<SessionInventaireDto>('/inventaires', {
        method: 'POST',
        body: JSON.stringify({
          entrepotId,
          ...(motif.trim() ? { motif: motif.trim() } : {}),
        }),
      }),
    onSuccess: (created) => {
      setModalOuvrir(false);
      setMotif('');
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['inventaires'] });
      void queryClient.invalidateQueries({ queryKey: ['inventaires-priorites'] });
      navigate(`/inventaires/${created.id}`);
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const sessionsFiltrees = useMemo(() => {
    const base = (sessions.data ?? [])
      .filter((s) => {
        if (filtreStatut && s.statut !== filtreStatut) return false;
        if (magasin.boutiqueId && s.entrepot.boutiqueId !== magasin.boutiqueId) {
          return false;
        }
        return true;
      })
      .map((s) => {
        const total = s.lignes.length;
        const comptees = s.lignes.filter((l) => l.quantiteComptee !== null).length;
        const ecarts = s.lignes.filter(
          (l) => l.quantiteComptee !== null && l.quantiteComptee !== l.quantiteTheorique,
        ).length;
        return { ...s, total, comptees, ecarts };
      });
    return sortRows(base, sortSessions, (s, key) => {
      switch (key) {
        case 'entrepot':
          return s.entrepot.code;
        case 'statut':
          return STATUT_LABEL[s.statut];
        case 'ouvert':
          return s.dateOuverture;
        case 'initiateur':
          return `${s.initiateur.prenom} ${s.initiateur.nom}`;
        case 'motif':
          return s.motif ?? '';
        case 'avancement':
          return s.total > 0 ? s.comptees / s.total : 0;
        case 'ecarts':
          return s.ecarts;
        default:
          return null;
      }
    });
  }, [sessions.data, filtreStatut, magasin.boutiqueId, sortSessions]);

  const kpisSessions = useMemo(() => {
    const all = sessions.data ?? [];
    const enCours = all.filter((s) => s.statut === 'EN_COURS').length;
    const valides = all.filter((s) => s.statut === 'VALIDE').length;
    const ecartsOuverts = all
      .filter((s) => s.statut === 'EN_COURS')
      .reduce(
        (n, s) =>
          n +
          s.lignes.filter(
            (l) => l.quantiteComptee !== null && l.quantiteComptee !== l.quantiteTheorique,
          ).length,
        0,
      );
    return { total: all.length, enCours, valides, ecartsOuverts };
  }, [sessions.data]);

  if (!peutLire) {
    return <p>Vous n’avez pas accès aux inventaires.</p>;
  }

  const aInventorier = (priorites.data ?? []).filter(
    (p) =>
      p.aInventorier &&
      (!magasin.boutiqueId ||
        p.boutiqueId === magasin.boutiqueId ||
        entrepotsMagasin.some((e) => e.id === p.entrepotId)),
  );

  return (
    <div className="stock-module">
      <PageHeader
        title="Inventaires physiques"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Comptage contradictoire — le stock ne bouge qu’après validation par un tiers',
          texteBoutique:
            'Comptage du magasin — le stock ne bouge qu’après validation par un tiers',
        })}
        actions={
          peutCompter ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => ouvrirModal()}
            >
              <ClipboardList size={15} /> Nouvel inventaire
            </button>
          ) : undefined
        }
      />

      <div className="kpi-grid dash-kpi-grid">
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">Sessions</div>
          <div className="kpi-value">{kpisSessions.total}</div>
          <div className="kpi-hint">toutes périodes</div>
        </article>
        <article
          className={
            kpisSessions.enCours > 0 ? 'kpi-card dash-kpi kpi-warning' : 'kpi-card dash-kpi'
          }
        >
          <div className="kpi-label">En cours</div>
          <div className="kpi-value">{kpisSessions.enCours}</div>
          <div className="kpi-hint">comptage non validé</div>
        </article>
        <article className="kpi-card dash-kpi">
          <div className="kpi-label">Validées</div>
          <div className="kpi-value">{kpisSessions.valides}</div>
          <div className="kpi-hint">écritures d’ajustement posées</div>
        </article>
        <article
          className={
            kpisSessions.ecartsOuverts > 0 ? 'kpi-card dash-kpi kpi-warning' : 'kpi-card dash-kpi'
          }
        >
          <div className="kpi-label">Écarts en cours</div>
          <div className="kpi-value">{kpisSessions.ecartsOuverts}</div>
          <div className="kpi-hint">lignes comptées ≠ théorique, non validées</div>
        </article>
        <article
          className={
            aInventorier.length > 0 ? 'kpi-card dash-kpi kpi-danger' : 'kpi-card dash-kpi'
          }
        >
          <div className="kpi-label">À inventorier</div>
          <div className="kpi-value">{aInventorier.length}</div>
          <div className="kpi-hint">échéance dépassée</div>
        </article>
      </div>

      {aInventorier.length > 0 && (
        <section className="dash-priorites" aria-label="Entrepôts à inventorier">
          <h2>À inventorier</h2>
          <div className="dash-priorites-grid">
            {aInventorier.map((p) => (
              <article key={p.entrepotId} className="dash-priorite dash-priorite-warning">
                <div>
                  <h3>
                    {p.code} · {p.nomBoutique}
                  </h3>
                  <p>
                    {p.dernierInventaireAt
                      ? `Dernier validé il y a ${p.joursDepuis} j (cible ${p.frequenceCibleJours} j).`
                      : `Jamais inventorié — cible ${p.frequenceCibleJours} jours.`}
                  </p>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="stock-link-btn"
                      onClick={() => navigate(`/stocks/entrepots/${p.entrepotId}`)}
                    >
                      Voir l’entrepôt
                    </button>
                    {peutCompter ? (
                      <button
                        type="button"
                        className="stock-link-btn"
                        onClick={() => ouvrirModal(p.entrepotId)}
                      >
                        Ouvrir un inventaire
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="toolbar stock-toolbar">
        <FiltreMagasinSiege id="inv-filtre-magasin" />
        <div>
          <label htmlFor="inv-filtre-statut">Statut</label>
          <select
            id="inv-filtre-statut"
            value={filtreStatut}
            onChange={(e) =>
              setFiltreStatut(e.target.value as '' | SessionInventaireDto['statut'])
            }
          >
            <option value="">Tous</option>
            <option value="EN_COURS">En cours</option>
            <option value="VALIDE">Validés</option>
            <option value="ANNULE">Annulés</option>
          </select>
        </div>
      </div>

      <ListPanel
        title="Sessions"
        toolbar={
          <span className="dash-panel-meta">
            {sessionsFiltrees.length} session(s) — cliquer une ligne pour le comptage
          </span>
        }
      >
        {sessions.isLoading && <LoadingState label="Chargement..." />}
        {sessions.isError && <p role="alert">Erreur de chargement.</p>}
        {sessions.data && sessionsFiltrees.length === 0 && (
          <EmptyState
            title="Aucun inventaire"
            description="Ouvrez un inventaire sur un entrepôt pour figer le théorique et compter."
          />
        )}
        {sessionsFiltrees.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortHeader
                    active={sortSessions?.key === 'entrepot'}
                    dir={sortSessions?.key === 'entrepot' ? sortSessions.dir : 'asc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'entrepot'))}
                  >
                    Entrepôt
                  </SortHeader>
                  <SortHeader
                    active={sortSessions?.key === 'statut'}
                    dir={sortSessions?.key === 'statut' ? sortSessions.dir : 'asc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'statut'))}
                  >
                    Statut
                  </SortHeader>
                  <SortHeader
                    active={sortSessions?.key === 'ouvert'}
                    dir={sortSessions?.key === 'ouvert' ? sortSessions.dir : 'desc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'ouvert'))}
                  >
                    Ouvert
                  </SortHeader>
                  <SortHeader
                    active={sortSessions?.key === 'initiateur'}
                    dir={sortSessions?.key === 'initiateur' ? sortSessions.dir : 'asc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'initiateur'))}
                  >
                    Initiateur
                  </SortHeader>
                  <SortHeader
                    active={sortSessions?.key === 'motif'}
                    dir={sortSessions?.key === 'motif' ? sortSessions.dir : 'asc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'motif'))}
                  >
                    Motif
                  </SortHeader>
                  <SortHeader
                    active={sortSessions?.key === 'avancement'}
                    dir={sortSessions?.key === 'avancement' ? sortSessions.dir : 'asc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'avancement'))}
                  >
                    Avancement
                  </SortHeader>
                  <SortHeader
                    active={sortSessions?.key === 'ecarts'}
                    dir={sortSessions?.key === 'ecarts' ? sortSessions.dir : 'desc'}
                    onClick={() => setSortSessions((s) => toggleSort(s, 'ecarts'))}
                  >
                    Écarts
                  </SortHeader>
                  <th aria-label="Info" />
                </tr>
              </thead>
              <tbody>
                {sessionsFiltrees.map((s) => (
                  <tr
                    key={s.id}
                    className="produit-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`Ouvrir l’inventaire ${s.entrepot.code}`}
                    onClick={() => navigate(`/inventaires/${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/inventaires/${s.id}`);
                      }
                    }}
                  >
                    <td>
                      <strong>
                        {s.entrepot.code} — {s.entrepot.boutique.nom}
                      </strong>
                      <div className="kpi-hint" style={{ margin: 0 }}>
                        {s.entrepot.nom}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          s.statut === 'VALIDE'
                            ? 'badge badge-ok'
                            : s.statut === 'ANNULE'
                              ? 'badge badge-neutral'
                              : 'badge badge-warning'
                        }
                      >
                        {STATUT_LABEL[s.statut]}
                      </span>
                    </td>
                    <td>{new Date(s.dateOuverture).toLocaleString('fr-FR')}</td>
                    <td>
                      {s.initiateur.prenom} {s.initiateur.nom}
                    </td>
                    <td>{s.motif ?? '—'}</td>
                    <td>
                      {s.comptees}/{s.total}
                    </td>
                    <td>{s.ecarts}</td>
                    <td>
                      <InfoTooltip
                        insight={insightInventaireAvancement(s.comptees, s.total, s.ecarts)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPanel>

      {peutCompter && (
        <Modal
          open={modalOuvrir}
          onClose={() => setModalOuvrir(false)}
          title="Ouvrir un inventaire"
          description="Le théorique est figé à l’ouverture. Le stock réel ne change qu’après validation par un autre utilisateur."
          size="lg"
        >
          <OuvrirInventaireForm
            entrepotId={entrepotId}
            motif={motif}
            error={formErr}
            pending={ouvrir.isPending}
            entrepots={entrepotsMagasin}
            priorites={priorites.data ?? []}
            sessions={sessions.data ?? []}
            apercu={apercuStock.data}
            apercuChargement={apercuStock.isFetching}
            utilisateurId={user?.userId}
            onEntrepotChange={setEntrepotId}
            onMotifChange={setMotif}
            onCancel={() => setModalOuvrir(false)}
            onOuvrirSession={(id) => {
              setModalOuvrir(false);
              navigate(`/inventaires/${id}`);
            }}
            onSubmit={() => ouvrir.mutate()}
          />
        </Modal>
      )}
    </div>
  );
}
