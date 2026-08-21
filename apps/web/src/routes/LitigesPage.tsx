import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Landmark,
  Scale,
  Wallet,
} from 'lucide-react';
import {
  RoleLibelle,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
  StatutTransaction,
  TypeTransaction,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import { insightStatutTransaction } from '../lib/insights/transactions';
import { useTresorerieRealtime } from '../lib/tresorerie-realtime';
import type { TransactionDto } from '../lib/types';

function estLitigeInterne(t: TransactionDto): boolean {
  return t.type === TypeTransaction.TRANSFERT_INTERNE;
}

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function RegulariserForm({
  transaction,
  onSuccess,
}: {
  transaction: TransactionDto;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const interne = estLitigeInterne(transaction);
  const [montantRetenu, setMontantRetenu] = useState(transaction.montant);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMontantRetenu(transaction.montant);
    setMotif('');
    setError(null);
  }, [transaction.id, transaction.montant]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/regulariser`, {
        method: 'PATCH',
        body: JSON.stringify({
          montantRetenu: Number(montantRetenu),
          motif,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onSuccess?.();
    },
    onError: () => setError('Échec de la régularisation.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="stack-form litiges-regulariser" onSubmit={handleSubmit}>
      <h3>Régularisation</h3>
      <p className="lead">
        {interne
          ? 'Litige interne tiroir → magasin (Resp. boutique / DAF).'
          : 'Litige §6.4 magasin → centrale (Contrôle interne / DAF).'}
      </p>
      <label htmlFor="montantRetenu">Montant retenu</label>
      <input
        id="montantRetenu"
        type="number"
        min="0"
        step="0.01"
        value={montantRetenu}
        onChange={(e) => setMontantRetenu(e.target.value)}
        required
      />
      <label htmlFor="motif">Motif (obligatoire)</label>
      <textarea
        id="motif"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        required
        minLength={1}
        rows={3}
        placeholder="Motif de régularisation…"
      />
      <button type="submit" className="btn-primary" disabled={mutation.isPending}>
        Régulariser → VALIDÉE
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

type FiltreCategorie = 'tous' | 'interne' | 'centrale';

export function LitigesPage() {
  const { user } = useAuth();
  useTresorerieRealtime(user !== null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<FiltreCategorie>('tous');
  const [q, setQ] = useState('');

  const peutRegulariserCentrale =
    user !== null && ROLES_REGULARISATION_LITIGE.includes(user.role);
  const peutRegulariserInterne =
    user !== null &&
    ROLES_REGULARISATION_LITIGE_INTERNE.includes(user.role as RoleLibelle);

  const { data: litiges, isLoading, isError } = useQuery({
    queryKey: ['transactions', { statut: StatutTransaction.LITIGE }],
    queryFn: () =>
      apiFetch<TransactionDto[]>(
        `/transactions?statut=${StatutTransaction.LITIGE}`,
      ),
  });

  const { internes, centrales } = useMemo(() => {
    const rows = litiges ?? [];
    return {
      internes: rows.filter(estLitigeInterne),
      centrales: rows.filter((t) => !estLitigeInterne(t)),
    };
  }, [litiges]);

  const filtered = useMemo(() => {
    let rows = litiges ?? [];
    if (filtre === 'interne') rows = internes;
    if (filtre === 'centrale') rows = centrales;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((t) => {
      const hay = `${t.type} ${t.montant} ${t.caisseId} ${t.id}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [litiges, internes, centrales, filtre, q]);

  const selected =
    filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (selected && selectedId !== selected.id) {
      setSelectedId(selected.id);
    }
    if (!selected && selectedId !== null) {
      setSelectedId(null);
    }
  }, [selected, selectedId]);

  const details = useQuery({
    queryKey: ['transactions', 'litige-detail', selected?.id],
    queryFn: () => apiFetch<TransactionDto>(`/transactions/${selected!.id}`),
    enabled: selected !== null,
  });

  const detail = details.data ?? selected;

  function peutAgir(t: TransactionDto): boolean {
    return estLitigeInterne(t) ? peutRegulariserInterne : peutRegulariserCentrale;
  }

  const montantInterne = internes.reduce((s, t) => s + Number(t.montant), 0);
  const montantCentrale = centrales.reduce((s, t) => s + Number(t.montant), 0);

  function renderGroup(title: string, rows: TransactionDto[], kind: 'interne' | 'centrale') {
    if (filtre !== 'tous' && filtre !== kind) return null;
    return (
      <div className="litiges-tree-group">
        <div className="litiges-tree-group-label">
          {title}
          <span className="litiges-tree-count">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="lead litiges-tree-empty">Aucun litige dans cette catégorie.</p>
        ) : (
          rows
            .filter((t) => filtered.some((f) => f.id === t.id))
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className={
                  selected?.id === t.id
                    ? 'litiges-node litiges-node-active'
                    : 'litiges-node'
                }
                onClick={() => setSelectedId(t.id)}
              >
                <span className="litiges-node-body">
                  <span className="litiges-node-title">
                    <span
                      className={
                        estLitigeInterne(t)
                          ? 'badge badge-warning'
                          : 'badge badge-critical'
                      }
                    >
                      {estLitigeInterne(t) ? 'INTERNE' : 'CENTRALE'}
                    </span>{' '}
                    {t.type}
                  </span>
                  <span className="litiges-node-meta">
                    {new Date(t.dateHeure).toLocaleString('fr-FR')}
                    {' · '}
                    <code>{t.caisseId.slice(0, 8)}…</code>
                  </span>
                </span>
                <span className="litiges-node-montant money">
                  {formatFcfa(t.montant)}
                </span>
              </button>
            ))
        )}
      </div>
    );
  }

  return (
    <div className="litiges-module">
      <PageHeader
        title="Litiges"
        subtitle="Internes (tiroir→magasin) · Centrale §6.4 — bloqués jusqu’à régularisation"
        actions={
          <nav className="circuit-nav" aria-label="Circuit trésorerie">
            <Link className="circuit-nav-item" to="/tresorerie">
              <Wallet size={14} /> Trésorerie
            </Link>
            <Link className="circuit-nav-item" to="/transactions?enCours=1">
              <ArrowRightLeft size={14} /> En cours
            </Link>
            <Link className="circuit-nav-item" to="/caisses">
              <Landmark size={14} /> Caisses
            </Link>
          </nav>
        }
      />

      <section className="litiges-kpis" aria-label="Synthèse litiges">
        <article className="litiges-kpi">
          <div className="litiges-kpi-label">Total ouverts</div>
          <div className="litiges-kpi-value">{(litiges ?? []).length}</div>
        </article>
        <article className="litiges-kpi">
          <div className="litiges-kpi-label">Internes</div>
          <div className="litiges-kpi-value">{internes.length}</div>
          <div className="litiges-kpi-hint money">{formatFcfa(montantInterne)}</div>
        </article>
        <article className="litiges-kpi">
          <div className="litiges-kpi-label">Centrale §6.4</div>
          <div className="litiges-kpi-value">{centrales.length}</div>
          <div className="litiges-kpi-hint money">{formatFcfa(montantCentrale)}</div>
        </article>
        <article className="litiges-kpi">
          <div className="litiges-kpi-label">Votre droit</div>
          <div className="litiges-kpi-hint">
            {peutRegulariserInterne || peutRegulariserCentrale
              ? [
                  peutRegulariserInterne ? 'Internes' : null,
                  peutRegulariserCentrale ? 'Centrale' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Lecture seule'}
          </div>
        </article>
      </section>

      {isLoading && <LoadingState label="Chargement des litiges..." />}
      {isError && <p role="alert">Erreur lors du chargement des litiges.</p>}

      {litiges && (
        <>
          <div className="toolbar litiges-toolbar">
            <div className="dash-presets" role="group" aria-label="Catégorie">
              {(
                [
                  ['tous', 'Tous'],
                  ['interne', 'Internes'],
                  ['centrale', 'Centrale'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filtre === id ? 'dash-preset actif' : 'dash-preset'}
                  onClick={() => setFiltre(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="litiges-search">
              Recherche
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type, montant, caisse…"
              />
            </label>
          </div>

          <div className="circuit-layout litiges-layout">
            <ListPanel
              title="Litiges ouverts"
              toolbar={
                <span className="dash-panel-meta">{filtered.length} affiché(s)</span>
              }
            >
              {(litiges ?? []).length === 0 ? (
                <EmptyState
                  title="Aucun litige"
                  description="Aucun écart bloqué sur votre périmètre. Le circuit §6.4 et les transferts internes sont sains."
                  action={
                    <Link className="btn-secondary" to="/tresorerie">
                      Retour trésorerie
                    </Link>
                  }
                />
              ) : (
                <div className="litiges-tree">
                  {renderGroup('Internes · tiroir → magasin', internes, 'interne')}
                  {renderGroup('Centrale · §6.4', centrales, 'centrale')}
                </div>
              )}
            </ListPanel>

            <section className="panel litiges-detail" aria-live="polite">
              {!selected || !detail ? (
                <EmptyState
                  title="Sélectionnez un litige"
                  description="Choisissez une ligne à gauche pour voir l’écart et régulariser si vous y êtes habilité."
                />
              ) : (
                <>
                  <header className="circuit-detail-hero litiges-detail-hero">
                    <span className="litiges-detail-avatar">
                      <Scale size={22} />
                    </span>
                    <div className="litiges-detail-main">
                      <div className="litiges-detail-chips">
                        <span
                          className={
                            estLitigeInterne(detail)
                              ? 'badge badge-warning'
                              : 'badge badge-critical'
                          }
                        >
                          {estLitigeInterne(detail) ? 'INTERNE' : 'CENTRALE'}
                        </span>
                        <span className="badge badge-critical">{detail.statut}</span>
                        <InfoTooltip
                          insight={insightStatutTransaction(detail.statut)}
                        />
                      </div>
                      <h2>{detail.type}</h2>
                      <p className="litiges-detail-sub">
                        {new Date(detail.dateHeure).toLocaleString('fr-FR')}
                        {' · caisse '}
                        <code>{detail.caisseId.slice(0, 8)}…</code>
                      </p>
                    </div>
                    <div className="litiges-detail-montant">
                      <div className="litiges-kpi-label">Déclaré</div>
                      <div className="litiges-detail-montant-value money">
                        {formatFcfa(detail.montant)}
                      </div>
                    </div>
                  </header>

                  <div className="litiges-detail-panel">
                    {details.isLoading && (
                      <LoadingState label="Chargement du détail..." />
                    )}
                    <dl className="litiges-dl">
                      <div>
                        <dt>Circuit</dt>
                        <dd>
                          {estLitigeInterne(detail)
                            ? 'Transfert interne tiroir → magasin (hors §6.4 centrale).'
                            : 'Versement magasin → centrale — rapprochement avec écart.'}
                        </dd>
                      </div>
                      {detail.bordereau?.reception && (
                        <>
                          <div>
                            <dt>Montant reçu</dt>
                            <dd className="money">
                              {formatFcfa(detail.bordereau.reception.montantRecu)}
                            </dd>
                          </div>
                          <div>
                            <dt>Écart</dt>
                            <dd className="money">
                              {formatFcfa(detail.bordereau.reception.ecart)}
                            </dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>Identifiant</dt>
                        <dd>
                          <code>{detail.id}</code>
                        </dd>
                      </div>
                    </dl>

                    <div className="litiges-detail-actions">
                      <Link
                        className="btn-ghost"
                        to={`/transactions?caisseId=${detail.caisseId}`}
                      >
                        Voir transactions caisse
                      </Link>
                      <Link className="btn-ghost" to="/tresorerie">
                        Pilotage trésorerie
                      </Link>
                    </div>

                    {peutAgir(detail) ? (
                      <RegulariserForm
                        transaction={detail}
                        onSuccess={() => setSelectedId(null)}
                      />
                    ) : (
                      <p className="lead litiges-readonly">
                        Lecture seule — régularisation réservée à{' '}
                        {estLitigeInterne(detail)
                          ? 'Responsable boutique / DAF'
                          : 'Contrôle interne / DAF'}
                        .
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
