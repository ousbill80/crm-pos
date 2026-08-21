import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Landmark, Wallet } from 'lucide-react';
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

type FiltreCategorie = 'tous' | 'interne' | 'centrale';

export function LitigesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useTresorerieRealtime(user !== null);
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
      apiFetch<TransactionDto[]>(`/transactions?statut=${StatutTransaction.LITIGE}`),
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
                className="litiges-node"
                onClick={() => navigate(`/transactions/${t.id}`)}
              >
                <span className="litiges-node-body">
                  <span className="litiges-node-title">
                    <span
                      className={
                        estLitigeInterne(t) ? 'badge badge-warning' : 'badge badge-critical'
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
                <span className="litiges-node-montant money">{formatFcfa(t.montant)}</span>
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
        subtitle="Internes (tiroir→magasin) · Centrale §6.4 — cliquez une ligne pour régulariser sur la fiche transaction"
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

          <ListPanel
            title="Litiges ouverts"
            toolbar={<span className="dash-panel-meta">{filtered.length} affiché(s)</span>}
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
        </>
      )}
    </div>
  );
}
