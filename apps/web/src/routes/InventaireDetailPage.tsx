import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { SortHeader } from '../components/SortHeader';
import { sortRows, toggleSort, type SortState } from '../lib/table-sort';
import {
  insightInventaireAvancement,
  insightInventaireEcartsKpi,
  insightInventaireLigneEcart,
  insightInventaireRestant,
  insightInventaireValeurEcarts,
} from '../lib/insights/stocks';
import type { SessionInventaireDto } from '../lib/types';

type ColonneLigne = 'produit' | 'theorique' | 'compte' | 'ecart' | 'cmp';

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

const ROLES_VALIDATION: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

const STATUT_LABEL: Record<SessionInventaireDto['statut'], string> = {
  EN_COURS: 'En cours',
  VALIDE: 'Validé',
  ANNULE: 'Annulé',
};

function formatFcfa(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
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

export function InventaireDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCompter = user !== null && ROLES_COMPTAGE.includes(user.role);
  const peutValiderRole = user !== null && ROLES_VALIDATION.includes(user.role);

  const [filtreEcarts, setFiltreEcarts] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [comptageLocal, setComptageLocal] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [sortLignes, setSortLignes] = useState<SortState<ColonneLigne> | null>(null);

  const session = useQuery({
    queryKey: ['inventaires', sessionId],
    queryFn: () => apiFetch<SessionInventaireDto>(`/inventaires/${sessionId}`),
    enabled: peutLire && Boolean(sessionId),
  });

  function invalider() {
    void queryClient.invalidateQueries({ queryKey: ['inventaires'] });
    void queryClient.invalidateQueries({ queryKey: ['inventaires-priorites'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks-mouvements'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
  }

  const compter = useMutation({
    mutationFn: (payload: { produitId: string; quantiteComptee: number }) =>
      apiFetch<SessionInventaireDto>(`/inventaires/${sessionId}/lignes`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setFormErr(null);
      invalider();
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const reporter = useMutation({
    mutationFn: () =>
      apiFetch(`/inventaires/${sessionId}/reporter-theorique`, { method: 'POST' }),
    onSuccess: () => {
      setFormErr(null);
      invalider();
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const valider = useMutation({
    mutationFn: () =>
      apiFetch(`/inventaires/${sessionId}/valider`, { method: 'POST' }),
    onSuccess: () => {
      setFormErr(null);
      invalider();
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const annuler = useMutation({
    mutationFn: () =>
      apiFetch(`/inventaires/${sessionId}/annuler`, { method: 'POST' }),
    onSuccess: () => {
      invalider();
      navigate('/inventaires');
    },
    onError: (err) => setFormErr(messageErreur(err)),
  });

  const detail = session.data;
  const stats = useMemo(() => {
    const all = detail?.lignes ?? [];
    const comptees = all.filter((l) => l.quantiteComptee !== null).length;
    const ecarts = all.filter(
      (l) =>
        l.quantiteComptee !== null && l.quantiteComptee !== l.quantiteTheorique,
    );
    const unitesEcart = ecarts.reduce(
      (n, l) => n + Math.abs((l.quantiteComptee ?? 0) - l.quantiteTheorique),
      0,
    );
    const valeurEcarts = ecarts.reduce((n, l) => {
      const q = Math.abs((l.quantiteComptee ?? 0) - l.quantiteTheorique);
      return n + q * Number(l.produit.coutMoyenPondere);
    }, 0);
    return {
      total: all.length,
      comptees,
      ecarts: ecarts.length,
      unitesEcart,
      valeurEcarts,
    };
  }, [detail]);

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtrees = (detail?.lignes ?? []).filter((l) => {
      if (
        filtreEcarts &&
        (l.quantiteComptee === null || l.quantiteComptee === l.quantiteTheorique)
      ) {
        return false;
      }
      if (!q) return true;
      const hay = `${l.produit.designation} ${l.produit.reference ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
    return sortRows(filtrees, sortLignes, (l, key) => {
      switch (key) {
        case 'produit':
          return l.produit.designation;
        case 'theorique':
          return l.quantiteTheorique;
        case 'compte':
          return l.quantiteComptee;
        case 'ecart':
          return l.quantiteComptee === null
            ? null
            : l.quantiteComptee - l.quantiteTheorique;
        case 'cmp':
          return Number(l.produit.coutMoyenPondere);
        default:
          return null;
      }
    });
  }, [detail, filtreEcarts, recherche, sortLignes]);

  if (!sessionId) return <p role="alert">Inventaire introuvable.</p>;
  if (!user) return <LoadingState label="Chargement..." />;
  if (!peutLire) return <p>Vous n’avez pas accès aux inventaires.</p>;
  if (session.isLoading) return <LoadingState label="Chargement de la session..." />;
  if (session.isError || !detail) {
    return (
      <div className="client-workspace">
        <button type="button" className="btn-ghost" onClick={() => navigate('/inventaires')}>
          ← Inventaires
        </button>
        <p role="alert">Impossible de charger cette session.</p>
      </div>
    );
  }

  const peutValiderCetteSession =
    peutValiderRole &&
    detail.statut === 'EN_COURS' &&
    detail.initiateurId !== user.userId;
  const pct =
    stats.total === 0 ? 0 : Math.round((stats.comptees / stats.total) * 100);

  return (
    <div className="client-workspace">
      <div className="client-workspace-toolbar">
        <button type="button" className="btn-ghost" onClick={() => navigate('/inventaires')}>
          ← Inventaires
        </button>
        <div className="client-workspace-toolbar-actions">
          <Link
            to={`/stocks/entrepots/${detail.entrepotId}`}
            className="stock-row-link"
          >
            Fiche entrepôt
          </Link>
        </div>
      </div>

      <header className="client-workspace-hero">
        <div className="client-workspace-avatar" aria-hidden>
          {detail.entrepot.code.slice(0, 2).toUpperCase()}
        </div>
        <div className="client-workspace-hero-main">
          <h1>
            {detail.entrepot.code} — {detail.entrepot.boutique.nom}
          </h1>
          <p className="client-workspace-hero-sub">
            {detail.entrepot.nom}
            {detail.motif ? ` · ${detail.motif}` : ''}
          </p>
          <div className="client-workspace-chips">
            <span
              className={
                detail.statut === 'VALIDE'
                  ? 'badge badge-ok'
                  : detail.statut === 'ANNULE'
                    ? 'badge badge-neutral'
                    : 'badge badge-warning'
              }
            >
              {STATUT_LABEL[detail.statut]}
            </span>
            <span className="badge badge-neutral">
              {stats.comptees}/{stats.total} compté(s)
            </span>
          </div>
          <div className="client-workspace-meta">
            <span>
              <strong>Ouvert</strong>{' '}
              {new Date(detail.dateOuverture).toLocaleString('fr-FR')}
            </span>
            <span>
              <strong>Comptage</strong> {detail.initiateur.prenom}{' '}
              {detail.initiateur.nom}
            </span>
            {detail.validateur ? (
              <span>
                <strong>Validé par</strong> {detail.validateur.prenom}{' '}
                {detail.validateur.nom}
                {detail.dateValidation
                  ? ` · ${new Date(detail.dateValidation).toLocaleString('fr-FR')}`
                  : ''}
              </span>
            ) : detail.statut === 'EN_COURS' ? (
              <span>
                <strong>Validation</strong> en attente d’un tiers
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="client-kpi-grid">
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Avancement
            <InfoTooltip
              insight={insightInventaireAvancement(stats.comptees, stats.total, stats.ecarts)}
            />
          </div>
          <div className="client-kpi-value">{pct} %</div>
          <div className="client-kpi-hint">
            {stats.comptees} / {stats.total} lignes
          </div>
          <div className="inventaire-progress" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Écarts
            <InfoTooltip insight={insightInventaireEcartsKpi(stats.ecarts, stats.unitesEcart)} />
          </div>
          <div className="client-kpi-value">{stats.ecarts}</div>
          <div className="client-kpi-hint">{stats.unitesEcart} unité(s)</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Écart valorisé (CMP)
            <InfoTooltip
              insight={insightInventaireValeurEcarts(stats.valeurEcarts, stats.ecarts)}
            />
          </div>
          <div className="client-kpi-value client-kpi-value-sm money">
            {formatFcfa(stats.valeurEcarts)}
          </div>
          <div className="client-kpi-hint">indicatif — non écrit avant validation</div>
        </article>
        <article className="client-kpi-card">
          <div className="client-kpi-label">
            Restant à compter
            <InfoTooltip
              insight={insightInventaireRestant(stats.total - stats.comptees, stats.total)}
            />
          </div>
          <div className="client-kpi-value">{stats.total - stats.comptees}</div>
          <div className="client-kpi-hint">
            {stats.total === 0 ? 'session vide' : 'lignes sans saisie'}
          </div>
        </article>
      </div>

      {formErr && <p role="alert">{formErr}</p>}

      {detail.statut === 'EN_COURS' && (
        <div className="toolbar stock-toolbar">
          <div className="stock-search">
            <label htmlFor="inv-q">Recherche</label>
            <input
              id="inv-q"
              type="search"
              placeholder="Désignation ou référence"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <div className="stock-toggle">
            <label htmlFor="inv-ecarts">
              <input
                id="inv-ecarts"
                type="checkbox"
                checked={filtreEcarts}
                onChange={(e) => setFiltreEcarts(e.target.checked)}
              />
              Écarts seulement
            </label>
          </div>
          {peutCompter && (
            <>
              <button
                type="button"
                onClick={() => reporter.mutate()}
                disabled={reporter.isPending || stats.comptees === stats.total}
              >
                {reporter.isPending ? 'Report…' : 'Reporter le théorique restant'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Annuler cet inventaire ? Aucun stock ne sera modifié.',
                    )
                  ) {
                    annuler.mutate();
                  }
                }}
              >
                Annuler la session
              </button>
            </>
          )}
          {peutValiderCetteSession ? (
            <button
              type="button"
              className="btn-primary"
              disabled={valider.isPending || stats.comptees < stats.total}
              onClick={() => valider.mutate()}
            >
              <CheckCircle2 size={15} /> Valider et ajuster le stock
            </button>
          ) : (
            <p className="kpi-hint">
              <ShieldAlert size={13} /> Séparation des tâches : un autre
              utilisateur habilité (responsable, DAF, DG ou SI) valide — pas
              l’initiateur du comptage.
            </p>
          )}
        </div>
      )}

      {detail.statut !== 'EN_COURS' && (
        <div className="toolbar stock-toolbar">
          <div className="stock-search">
            <label htmlFor="inv-q">Recherche</label>
            <input
              id="inv-q"
              type="search"
              placeholder="Désignation ou référence"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <div className="stock-toggle">
            <label htmlFor="inv-ecarts">
              <input
                id="inv-ecarts"
                type="checkbox"
                checked={filtreEcarts}
                onChange={(e) => setFiltreEcarts(e.target.checked)}
              />
              Écarts seulement
            </label>
          </div>
        </div>
      )}

      {lignes.length === 0 ? (
        <p className="lead">Aucune ligne ne correspond à ce filtre.</p>
      ) : (
        <div className="clients-table-wrap">
          <table>
            <thead>
              <tr>
                <SortHeader active={sortLignes?.key === 'produit'} dir={sortLignes?.key === 'produit' ? sortLignes.dir : 'asc'} onClick={() => setSortLignes((s) => toggleSort(s, 'produit'))}>
                  Produit
                </SortHeader>
                <SortHeader active={sortLignes?.key === 'theorique'} dir={sortLignes?.key === 'theorique' ? sortLignes.dir : 'asc'} onClick={() => setSortLignes((s) => toggleSort(s, 'theorique'))} className="num">
                  Théorique
                </SortHeader>
                <SortHeader active={sortLignes?.key === 'compte'} dir={sortLignes?.key === 'compte' ? sortLignes.dir : 'asc'} onClick={() => setSortLignes((s) => toggleSort(s, 'compte'))} className="num">
                  Compté
                </SortHeader>
                <SortHeader active={sortLignes?.key === 'ecart'} dir={sortLignes?.key === 'ecart' ? sortLignes.dir : 'desc'} onClick={() => setSortLignes((s) => toggleSort(s, 'ecart'))} className="num">
                  Écart
                </SortHeader>
                <SortHeader active={sortLignes?.key === 'cmp'} dir={sortLignes?.key === 'cmp' ? sortLignes.dir : 'asc'} onClick={() => setSortLignes((s) => toggleSort(s, 'cmp'))} className="num">
                  CMP
                </SortHeader>
                <th aria-label="Info" />
                {detail.statut === 'EN_COURS' && peutCompter ? <th>Saisir</th> : null}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const ecart =
                  l.quantiteComptee === null
                    ? null
                    : l.quantiteComptee - l.quantiteTheorique;
                return (
                  <tr key={l.id}>
                    <td>
                      <Link className="link-button" to={`/produits/${l.produitId}`}>
                        <strong>{l.produit.designation}</strong>
                      </Link>
                      <div className="kpi-hint" style={{ margin: 0 }}>
                        {l.produit.reference ?? 'Sans réf.'}
                        {l.produit.seuilReappro !== null
                          ? ` · seuil ${l.produit.seuilReappro}`
                          : ''}
                        {!l.produit.actif ? ' · inactif' : ''}
                      </div>
                    </td>
                    <td>{l.quantiteTheorique}</td>
                    <td>
                      {l.quantiteComptee === null ? (
                        <span className="badge badge-warning">À compter</span>
                      ) : (
                        l.quantiteComptee
                      )}
                    </td>
                    <td
                      className={
                        ecart === null
                          ? undefined
                          : ecart < 0
                            ? 'stock-delta-neg'
                            : ecart > 0
                              ? 'stock-delta-pos'
                              : undefined
                      }
                    >
                      {ecart === null ? '—' : ecart > 0 ? `+${ecart}` : ecart}
                      {ecart !== null && ecart !== 0 && (
                        <AlertTriangle size={12} style={{ marginLeft: 4 }} />
                      )}
                    </td>
                    <td className="money">
                      {Number(l.produit.coutMoyenPondere).toLocaleString('fr-FR', {
                        maximumFractionDigits: 0,
                      })}{' '}
                      FCFA
                    </td>
                    <td>
                      <InfoTooltip
                        insight={insightInventaireLigneEcart(
                          l.quantiteTheorique,
                          l.quantiteComptee,
                          Number(l.produit.coutMoyenPondere),
                        )}
                      />
                    </td>
                    {detail.statut === 'EN_COURS' && peutCompter ? (
                      <td>
                        <form
                          className="stock-count-form"
                          onSubmit={(e: FormEvent) => {
                            e.preventDefault();
                            const raw =
                              comptageLocal[l.produitId] ??
                              String(l.quantiteComptee ?? l.quantiteTheorique);
                            compter.mutate({
                              produitId: l.produitId,
                              quantiteComptee: Number(raw),
                            });
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            value={
                              comptageLocal[l.produitId] ??
                              (l.quantiteComptee !== null
                                ? String(l.quantiteComptee)
                                : '')
                            }
                            onChange={(e) =>
                              setComptageLocal((prev) => ({
                                ...prev,
                                [l.produitId]: e.target.value,
                              }))
                            }
                            aria-label={`Quantité comptée ${l.produit.designation}`}
                          />
                          <button type="submit" disabled={compter.isPending}>
                            OK
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
