import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Landmark, Search, Wallet } from 'lucide-react';
import {
  RoleLibelle,
  ROLES_REGULARISATION_LITIGE,
  ROLES_REGULARISATION_LITIGE_INTERNE,
  StatutTransaction,
  TypeCaisse,
  TypeTransaction,
} from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  insightDroitLitige,
  insightEcartLitige,
  insightLitigeCategorie,
  insightLitigesTransactions,
} from '../lib/insights/transactions';
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

function labelTypeTx(type: string): string {
  if (type === TypeTransaction.VENTE) return 'Encaissement';
  if (type === TypeTransaction.SORTIE_FONDS) return 'Versement / sortie';
  if (type === TypeTransaction.TRANSFERT_INTERNE) return 'Transfert interne';
  return type;
}

function labelCaisseTx(t: TransactionDto): string {
  const c = t.caisse;
  if (!c) return 'Caisse';
  if (c.type === TypeCaisse.TIROIR) {
    return `${c.code ?? 'T??'} — ${c.libelle ?? 'Tiroir'}`;
  }
  if (c.type === TypeCaisse.MAGASIN) return c.libelle ?? 'Caisse magasin';
  return c.libelle ?? 'Caisse centrale';
}

function nomMagasinTx(t: TransactionDto): string {
  if (t.caisse?.boutique?.nom) return t.caisse.boutique.nom;
  if (t.caisse?.type === TypeCaisse.CENTRALE) return 'Réseau';
  return '—';
}

function quiRegularise(interne: boolean): string {
  return interne
    ? 'Responsable boutique / DAF'
    : 'Contrôle interne / DAF';
}

type FiltreCategorie = 'tous' | 'interne' | 'centrale';

export function LitigesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const magasin = useFiltreMagasinSiege();
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
    const rows = (litiges ?? []).filter(
      (t) =>
        !magasin.boutiqueId ||
        t.caisse?.boutiqueId === magasin.boutiqueId ||
        t.caisse?.boutique?.id === magasin.boutiqueId,
    );
    return {
      internes: rows.filter(estLitigeInterne),
      centrales: rows.filter((t) => !estLitigeInterne(t)),
    };
  }, [litiges, magasin.boutiqueId]);

  const filtered = useMemo(() => {
    let rows = [...internes, ...centrales];
    if (filtre === 'interne') rows = internes;
    if (filtre === 'centrale') rows = centrales;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((t) => {
      const hay = [
        estLitigeInterne(t) ? 'interne' : 'centrale',
        labelTypeTx(t.type),
        t.montant,
        nomMagasinTx(t),
        labelCaisseTx(t),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [internes, centrales, filtre, q]);

  const montantInterne = internes.reduce((s, t) => s + Number(t.montant), 0);
  const montantCentrale = centrales.reduce((s, t) => s + Number(t.montant), 0);
  const totalPerimetre = internes.length + centrales.length;
  const totalReseau = litiges?.length ?? 0;
  const filtreMasqueReseau = Boolean(magasin.boutiqueId) && totalReseau > totalPerimetre;

  const droitTexte =
    peutRegulariserInterne || peutRegulariserCentrale
      ? `Vous pouvez régulariser : ${[
          peutRegulariserInterne ? 'internes' : null,
          peutRegulariserCentrale ? 'centrale' : null,
        ]
          .filter(Boolean)
          .join(' / ')}`
      : 'Lecture seule';

  function renderGroup(
    title: string,
    rows: TransactionDto[],
    kind: 'interne' | 'centrale',
  ) {
    if (filtre !== 'tous' && filtre !== kind) return null;
    const visibles = rows.filter((t) => filtered.some((f) => f.id === t.id));
    return (
      <div className="litiges-tree-group">
        <div className="litiges-tree-group-label">
          {title}
          <span className="litiges-tree-count">{visibles.length}</span>
        </div>
        {visibles.length === 0 ? (
          <p className="lead litiges-tree-empty">Aucun litige dans cette catégorie.</p>
        ) : (
          visibles.map((t) => {
            const interne = estLitigeInterne(t);
            const peutAgir = interne ? peutRegulariserInterne : peutRegulariserCentrale;
            return (
              <div
                key={t.id}
                className="litiges-node"
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/transactions/${t.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/transactions/${t.id}`);
                  }
                }}
              >
                <span className="litiges-node-body">
                  <span className="litiges-node-title">
                    <span className={interne ? 'badge badge-warning' : 'badge badge-critical'}>
                      {interne ? 'Interne' : 'Centrale'}
                    </span>
                    {labelTypeTx(t.type)}
                    <InfoTooltip insight={insightEcartLitige(t, interne)} />
                    {peutAgir ? (
                      <span className="badge badge-ok">Vous pouvez régulariser</span>
                    ) : null}
                  </span>
                  <span className="litiges-node-meta">
                    {nomMagasinTx(t)} · {labelCaisseTx(t)}
                    {' · '}
                    {new Date(t.dateHeure).toLocaleString('fr-FR')}
                  </span>
                  <span className="litiges-node-qui">
                    Régularisation : {quiRegularise(interne)}
                  </span>
                </span>
                <span className="litiges-node-montant money">{formatFcfa(t.montant)}</span>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="litiges-module">
      <PageHeader
        title="Litiges"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Écarts bloqués jusqu’à régularisation. Cliquez une ligne → fiche transaction.',
          texteBoutique:
            'Écarts bloqués jusqu’à régularisation. Cliquez une ligne → fiche transaction.',
        })}
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
        <button
          type="button"
          className={`litiges-kpi${filtre === 'tous' ? ' is-actif' : ''}`}
          onClick={() => setFiltre('tous')}
        >
          <div className="litiges-kpi-label">
            Total ouverts <InfoTooltip insight={insightLitigesTransactions(totalPerimetre)} />
          </div>
          <div className="litiges-kpi-value">{totalPerimetre}</div>
          <div className="litiges-kpi-hint money">{formatFcfa(montantInterne + montantCentrale)}</div>
        </button>
        <button
          type="button"
          className={`litiges-kpi${filtre === 'interne' ? ' is-actif' : ''}`}
          onClick={() => setFiltre('interne')}
        >
          <div className="litiges-kpi-label">
            Internes · tiroir → magasin{' '}
            <InfoTooltip insight={insightLitigeCategorie('interne', internes.length, montantInterne)} />
          </div>
          <div className="litiges-kpi-value">{internes.length}</div>
          <div className="litiges-kpi-hint money">{formatFcfa(montantInterne)}</div>
        </button>
        <button
          type="button"
          className={`litiges-kpi${filtre === 'centrale' ? ' is-actif' : ''}`}
          onClick={() => setFiltre('centrale')}
        >
          <div className="litiges-kpi-label">
            Centrale §6.4{' '}
            <InfoTooltip insight={insightLitigeCategorie('centrale', centrales.length, montantCentrale)} />
          </div>
          <div className="litiges-kpi-value">{centrales.length}</div>
          <div className="litiges-kpi-hint money">{formatFcfa(montantCentrale)}</div>
        </button>
        <article className="litiges-kpi">
          <div className="litiges-kpi-label">
            Votre droit{' '}
            <InfoTooltip
              insight={insightDroitLitige(peutRegulariserInterne, peutRegulariserCentrale)}
            />
          </div>
          <div className="litiges-kpi-droit">{droitTexte}</div>
        </article>
      </section>

      {isLoading && <LoadingState label="Chargement des litiges..." />}
      {isError && <p role="alert">Erreur lors du chargement des litiges.</p>}

      {litiges && (
        <>
          <div className="litiges-bar">
            <FiltreMagasinSiege id="litiges-filtre-magasin" />
            <div className="dash-presets" role="group" aria-label="Catégorie">
              {(
                [
                  ['tous', 'Tous', totalPerimetre],
                  ['interne', 'Internes', internes.length],
                  ['centrale', 'Centrale', centrales.length],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  className={filtre === id ? 'dash-preset actif' : 'dash-preset'}
                  onClick={() => setFiltre(id)}
                >
                  {label} {n}
                </button>
              ))}
            </div>
            <label className="litiges-search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Magasin, type, montant…"
                aria-label="Rechercher un litige"
              />
            </label>
          </div>

          <ListPanel
            title="Litiges ouverts"
            toolbar={<span className="dash-panel-meta">{filtered.length} affiché(s)</span>}
          >
            {totalPerimetre === 0 ? (
              <div className="litiges-empty">
                {filtreMasqueReseau ? (
                  <p className="litiges-empty-warn" role="status">
                    {totalReseau} litige{totalReseau > 1 ? 's' : ''} sur le réseau, hors de ce
                    magasin. Élargissez le filtre pour les voir.
                  </p>
                ) : (
                  <p className="lead">Aucun écart bloqué sur ce périmètre.</p>
                )}
                <div className="litiges-empty-cards">
                  <article className="litiges-empty-card">
                    <h3>Internes</h3>
                    <p>
                      Écart à la clôture tiroir → magasin (transfert interne). Régularisation :
                      responsable boutique / DAF, sur la fiche transaction.
                    </p>
                  </article>
                  <article className="litiges-empty-card">
                    <h3>Centrale §6.4</h3>
                    <p>
                      Écart au rapprochement d’un versement magasin → centrale. Régularisation :
                      Contrôle interne / DAF, sur la fiche transaction.
                    </p>
                  </article>
                </div>
                <div className="litiges-empty-actions">
                  <Link className="btn-secondary" to="/tresorerie">
                    Trésorerie
                  </Link>
                  <Link className="btn-ghost" to="/transactions?enCours=1">
                    En cours
                  </Link>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="lead litiges-tree-empty" style={{ padding: '16px' }}>
                Aucun litige pour cette recherche ou ce filtre.
              </p>
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
