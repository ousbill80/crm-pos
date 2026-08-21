import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Landmark,
  Monitor,
  Plus,
  Search,
  Store,
  Wallet,
} from 'lucide-react';
import { RoleLibelle, ROLES_CONFIG_TIROIRS, StatutTransaction, TypeCaisse } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import { insightSoldeCaisse, insightTypeCaisse } from '../lib/insights/caisses';
import type {
  BoutiqueDto,
  CaisseDto,
  MouvementCaisseDto,
  TransactionDto,
} from '../lib/types';

function useCaisses() {
  return useQuery({
    queryKey: ['caisses'],
    queryFn: () => apiFetch<CaisseDto[]>('/caisses'),
  });
}

function useBoutiques() {
  return useQuery({
    queryKey: ['boutiques'],
    queryFn: () => apiFetch<BoutiqueDto[]>('/boutiques'),
  });
}

function useSolde(caisseId: string | null) {
  return useQuery({
    queryKey: ['caisses', caisseId, 'solde'],
    queryFn: () =>
      apiFetch<{ caisseId: string; solde: string }>(
        `/caisses/${caisseId!}/solde`,
      ),
    enabled: caisseId !== null,
  });
}

function formatFcfa(value: string | number | undefined): string {
  if (value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function labelCaisse(c: CaisseDto): string {
  if (c.type === TypeCaisse.TIROIR) {
    return `${c.code ?? 'T??'} — ${c.libelle ?? 'Tiroir'}`;
  }
  if (c.type === TypeCaisse.MAGASIN) {
    return c.libelle ?? 'Caisse magasin';
  }
  return c.libelle ?? 'Caisse centrale';
}

function typeLabel(type: TypeCaisse | string): string {
  if (type === TypeCaisse.CENTRALE) return 'Centrale';
  if (type === TypeCaisse.MAGASIN) return 'Magasin';
  if (type === TypeCaisse.TIROIR) return 'Tiroir';
  return String(type);
}

function typeBadgeClass(type: TypeCaisse | string): string {
  if (type === TypeCaisse.CENTRALE) return 'badge badge-info';
  if (type === TypeCaisse.MAGASIN) return 'badge badge-ok';
  return 'badge badge-neutral';
}

function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type === TypeCaisse.CENTRALE) return <Landmark size={size} />;
  if (type === TypeCaisse.MAGASIN) return <Store size={size} />;
  return <Monitor size={size} />;
}

function SoldeValue({ caisseId }: { caisseId: string }) {
  const { data, isLoading, isError } = useSolde(caisseId);
  if (isLoading) return <span className="caisses-muted">Calcul…</span>;
  if (isError) return <span className="caisses-muted">Erreur</span>;
  return <span className="money">{formatFcfa(data?.solde)}</span>;
}

function MouvementsCaisse({
  caisseId,
  typeCaisse,
}: {
  caisseId: string;
  typeCaisse: string;
}) {
  const [filtreType, setFiltreType] = useState('');
  const [q, setQ] = useState('');
  const [ligneId, setLigneId] = useState<string | null>(null);

  const solde = useSolde(caisseId);
  const mouvements = useQuery({
    queryKey: ['caisses', caisseId, 'mouvements'],
    queryFn: () =>
      apiFetch<MouvementCaisseDto[]>(`/caisses/${caisseId}/mouvements`),
  });

  const enCours = useQuery({
    queryKey: ['transactions', { caisseId, horsValidee: true }],
    queryFn: () =>
      apiFetch<TransactionDto[]>(`/transactions?caisseId=${caisseId}`),
  });

  useEffect(() => {
    setLigneId(null);
    setFiltreType('');
    setQ('');
  }, [caisseId]);

  const rows = useMemo(() => {
    let list = mouvements.data ?? [];
    if (filtreType) list = list.filter((m) => m.type === filtreType);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((m) => {
        const hay =
          `${m.libelle} ${m.type} ${m.initiateur.login} ${m.montant}`.toLowerCase();
        return hay.includes(needle);
      });
    }
    return list;
  }, [mouvements.data, filtreType, q]);

  const totaux = useMemo(() => {
    const list = mouvements.data ?? [];
    let credits = 0;
    let debits = 0;
    for (const m of list) {
      credits += Number(m.credit);
      debits += Number(m.debit);
    }
    return { credits, debits, n: list.length };
  }, [mouvements.data]);

  const pipeline = useMemo(() => {
    return (enCours.data ?? []).filter(
      (t) => t.statut !== StatutTransaction.VALIDEE,
    );
  }, [enCours.data]);

  const detail = rows.find((m) => m.id === ligneId) ?? null;

  if (mouvements.isLoading) {
    return <LoadingState label="Chargement du grand livre..." />;
  }
  if (mouvements.isError) {
    return <p role="alert">Impossible de charger les mouvements.</p>;
  }

  const hintVide =
    typeCaisse === TypeCaisse.TIROIR
      ? 'Les ventes ESPECES et le transfert de clôture vers le magasin apparaîtront ici une fois VALIDÉS.'
      : typeCaisse === TypeCaisse.MAGASIN
        ? 'Les transferts reçus des tiroirs et les SORTIE_FONDS validées vers la centrale alimentent ce livre.'
        : 'Les contreparties des versements magasin validés (§6.4) alimentent le livre centrale.';

  return (
    <div className="caisses-ledger-view">
      <header className="caisses-ledger-head">
        <div>
          <h3>Grand livre</h3>
          <p>
            Écritures <strong>VALIDÉES</strong> uniquement — solde recalculé
            append-only, jamais stocké.
          </p>
        </div>
        <div className="caisses-ledger-head-solde">
          <span className="caisses-kpi-label">Solde actuel</span>
          <strong className="money">
            {solde.isLoading ? '…' : formatFcfa(solde.data?.solde)}
          </strong>
        </div>
      </header>

      <div className="caisses-ledger-kpis">
        <article>
          <span className="caisses-ledger-kpi-ico">
            <BookOpen size={15} />
          </span>
          <div>
            <div className="caisses-kpi-label">Écritures</div>
            <div className="caisses-kpi-value">{totaux.n}</div>
          </div>
        </article>
        <article>
          <span className="caisses-ledger-kpi-ico caisses-ledger-kpi-credit">
            +
          </span>
          <div>
            <div className="caisses-kpi-label">Crédits</div>
            <div className="caisses-kpi-value money caisses-credit">
              {formatFcfa(totaux.credits)}
            </div>
          </div>
        </article>
        <article>
          <span className="caisses-ledger-kpi-ico caisses-ledger-kpi-debit">
            −
          </span>
          <div>
            <div className="caisses-kpi-label">Débits</div>
            <div className="caisses-kpi-value money caisses-debit">
              {formatFcfa(totaux.debits)}
            </div>
          </div>
        </article>
        <article>
          <span className="caisses-ledger-kpi-ico">
            <ArrowRightLeft size={15} />
          </span>
          <div>
            <div className="caisses-kpi-label">En cours</div>
            <div className="caisses-kpi-value">{pipeline.length}</div>
          </div>
        </article>
      </div>

      <div className="caisses-ledger-toolbar">
        <div className="dash-presets" role="group" aria-label="Type d’écriture">
          {(
            [
              ['', 'Tous'],
              ['VENTE', 'Ventes'],
              ['TRANSFERT_INTERNE', 'Transferts'],
              ['SORTIE_FONDS', 'Sorties'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id || 'all'}
              type="button"
              className={filtreType === id ? 'dash-preset actif' : 'dash-preset'}
              onClick={() => setFiltreType(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="caisses-search caisses-ledger-search">
          <Search size={14} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Libellé, initiateur, montant…"
          />
        </label>
      </div>

      <div
        className={
          detail
            ? 'caisses-ledger-split caisses-ledger-split-open'
            : 'caisses-ledger-split'
        }
      >
        <div className="caisses-ledger-main">
          {rows.length === 0 ? (
            <div className="caisses-ledger-empty">
              <div className="caisses-ledger-empty-icon">
                <BookOpen size={28} />
              </div>
              <h4>Aucune écriture validée</h4>
              <p>{hintVide}</p>
              <div className="caisses-ledger-empty-actions">
                {typeCaisse === TypeCaisse.TIROIR ? (
                  <Link className="btn-primary" to="/pos">
                    <Monitor size={14} /> Ouvrir le POS
                  </Link>
                ) : null}
                {typeCaisse === TypeCaisse.MAGASIN ? (
                  <Link
                    className="btn-primary"
                    to={`/transactions?caisseId=${caisseId}`}
                  >
                    <ArrowRightLeft size={14} /> Versements
                  </Link>
                ) : null}
                <Link className="btn-secondary" to="/tresorerie">
                  Pilotage trésorerie
                </Link>
              </div>
            </div>
          ) : (
            <div className="caisses-ledger-scroll">
              <table className="caisses-ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Écriture</th>
                    <th>Débit</th>
                    <th>Crédit</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr
                      key={m.id}
                      className={
                        ligneId === m.id ? 'caisses-ledger-row-active' : undefined
                      }
                      onClick={() =>
                        setLigneId(m.id === ligneId ? null : m.id)
                      }
                    >
                      <td className="caisses-ledger-date">
                        <time dateTime={m.dateHeure}>
                          {new Date(m.dateHeure).toLocaleDateString('fr-FR')}
                        </time>
                        <span>
                          {new Date(m.dateHeure).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td>
                        <div className="caisses-ledger-ecriture">
                          <span
                            className={
                              m.sens === 'CREDIT'
                                ? 'caisses-ledger-dot credit'
                                : 'caisses-ledger-dot debit'
                            }
                            aria-hidden
                          />
                          <div>
                            <strong>{m.libelle}</strong>
                            <span className="caisses-ledger-meta">
                              <span className="badge badge-neutral">{m.type}</span>
                              {m.initiateur.prenom} {m.initiateur.nom}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="money caisses-debit">
                        {Number(m.debit) > 0 ? formatFcfa(m.debit) : '—'}
                      </td>
                      <td className="money caisses-credit">
                        {Number(m.credit) > 0 ? formatFcfa(m.credit) : '—'}
                      </td>
                      <td className="money caisses-ledger-solde">
                        {formatFcfa(m.soldeApres)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {detail && (
          <aside className="caisses-ledger-detail" aria-label="Détail écriture">
            <div className="caisses-ledger-detail-top">
              <h4>Détail écriture</h4>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setLigneId(null)}
              >
                Fermer
              </button>
            </div>
            <div
              className={
                detail.sens === 'CREDIT'
                  ? 'caisses-ledger-sens credit'
                  : 'caisses-ledger-sens debit'
              }
            >
              {detail.sens === 'CREDIT' ? 'Crédit' : 'Débit'} ·{' '}
              {formatFcfa(detail.montant)}
            </div>
            <dl className="caisses-dl">
              <div>
                <dt>Libellé</dt>
                <dd>{detail.libelle}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  <span className="badge badge-neutral">{detail.type}</span>
                </dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{new Date(detail.dateHeure).toLocaleString('fr-FR')}</dd>
              </div>
              <div>
                <dt>Initiateur</dt>
                <dd>
                  {detail.initiateur.prenom} {detail.initiateur.nom}
                  <div className="caisses-muted">{detail.initiateur.login}</div>
                </dd>
              </div>
              <div>
                <dt>Solde après</dt>
                <dd className="money">{formatFcfa(detail.soldeApres)}</dd>
              </div>
              <div>
                <dt>Référence</dt>
                <dd>
                  <code>{detail.id}</code>
                </dd>
              </div>
            </dl>
            <Link
              className="btn-secondary"
              to={`/transactions?caisseId=${caisseId}`}
            >
              Transactions de la caisse
            </Link>
          </aside>
        )}
      </div>

      <section className="caisses-ledger-pipeline">
        <div className="caisses-ledger-pipeline-head">
          <h4>Pipeline — hors grand livre</h4>
          <span className="caisses-muted">
            INITIÉE / EN_TRANSIT / RÉCEPTIONNÉE / LITIGE
          </span>
        </div>
        {enCours.isLoading && <LoadingState label="Chargement…" />}
        {!enCours.isLoading && pipeline.length === 0 && (
          <div className="caisses-ledger-pipeline-empty">
            Aucune transaction non validée sur cette caisse.
          </div>
        )}
        {pipeline.length > 0 && (
          <ul className="caisses-ledger-pipeline-list">
            {pipeline.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.type}</strong>
                  <span className="caisses-muted">
                    {new Date(t.dateHeure).toLocaleString('fr-FR')}
                  </span>
                </div>
                <span className="money">{formatFcfa(t.montant)}</span>
                <span
                  className={
                    t.statut === StatutTransaction.LITIGE
                      ? 'badge badge-critical'
                      : 'badge badge-warning'
                  }
                >
                  {t.statut}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GestionCaissesView({
  boutiques,
  caisses,
  peutConfigTiroirs,
  peutCreerMagasin,
  onSelectCaisse,
}: {
  boutiques: BoutiqueDto[];
  caisses: CaisseDto[];
  peutConfigTiroirs: boolean;
  peutCreerMagasin: boolean;
  onSelectCaisse: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [boutiqueFocus, setBoutiqueFocus] = useState(boutiques[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLibelle, setEditLibelle] = useState('');
  const [editOrdre, setEditOrdre] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const createTiroir = useMutation({
    mutationFn: () =>
      apiFetch<CaisseDto>('/caisses/tiroirs', {
        method: 'POST',
        body: JSON.stringify({
          boutiqueId: boutiqueFocus,
          code,
          libelle,
          ordreAffichage: tiroirsFocus.length,
        }),
      }),
    onSuccess: () => {
      setCode('');
      setLibelle('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: () =>
      setError('Échec création tiroir (magasin requis, code unique).'),
  });

  const createMagasin = useMutation({
    mutationFn: (boutiqueId: string) =>
      apiFetch<CaisseDto>('/caisses', {
        method: 'POST',
        body: JSON.stringify({
          type: TypeCaisse.MAGASIN,
          boutiqueId,
        }),
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: () => setError('Échec création caisse magasin.'),
  });

  const updateTiroir = useMutation({
    mutationFn: (payload: {
      id: string;
      libelle?: string;
      actif?: boolean;
      ordreAffichage?: number;
    }) =>
      apiFetch<CaisseDto>(`/caisses/tiroirs/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(payload.libelle !== undefined ? { libelle: payload.libelle } : {}),
          ...(payload.actif !== undefined ? { actif: payload.actif } : {}),
          ...(payload.ordreAffichage !== undefined
            ? { ordreAffichage: payload.ordreAffichage }
            : {}),
        }),
      }),
    onSuccess: () => {
      setEditId(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['caisses'] });
    },
    onError: () =>
      setError('Échec mise à jour (session ouverte ? droits DAF ?).'),
  });

  const magasinFocus = caisses.find(
    (c) =>
      c.boutiqueId === boutiqueFocus && c.type === TypeCaisse.MAGASIN,
  );
  const tiroirsFocus = caisses
    .filter(
      (c) =>
        c.boutiqueId === boutiqueFocus && c.type === TypeCaisse.TIROIR,
    )
    .sort((a, b) => (a.ordreAffichage ?? 0) - (b.ordreAffichage ?? 0));

  const manquants = boutiques.filter(
    (b) =>
      !caisses.some(
        (c) => c.boutiqueId === b.id && c.type === TypeCaisse.MAGASIN,
      ),
  );

  function onSubmitTiroir(e: FormEvent) {
    e.preventDefault();
    if (!magasinFocus) {
      setError('Créez d’abord la caisse magasin de cette boutique.');
      return;
    }
    createTiroir.mutate();
  }

  return (
    <div className="caisses-gestion">
      <section className="caisses-gestion-intro panel">
        <h2>Gestion du circuit</h2>
        <p className="lead">
          Une boutique = 1 caisse magasin (cash office) + N tiroirs POS.
          Les tiroirs versent au magasin ; le magasin verse à la centrale (§6.4).
        </p>
        {!peutConfigTiroirs && !peutCreerMagasin ? (
          <p className="lead">
            Lecture seule — création magasin : SI / Direction ; tiroirs : DAF,
            SI ou Direction.
          </p>
        ) : null}
      </section>

      {manquants.length > 0 && (
        <section className="dash-sante dash-sante-warning">
          <div className="dash-sante-main">
            <span className="dash-sante-badge">Magasin manquant</span>
            <p>
              {manquants.length} boutique(s) sans caisse magasin :{' '}
              {manquants.map((b) => b.nom).join(', ')}.
            </p>
          </div>
          {peutCreerMagasin ? (
            <div className="dash-sante-meta">
              {manquants.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="btn-secondary"
                  disabled={createMagasin.isPending}
                  onClick={() => createMagasin.mutate(b.id)}
                >
                  Créer magasin · {b.nom}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <div className="caisses-gestion-layout">
        <ListPanel title="Boutiques">
          <ul className="caisses-gestion-boutiques">
            {boutiques.map((b) => {
              const mag = caisses.find(
                (c) =>
                  c.boutiqueId === b.id && c.type === TypeCaisse.MAGASIN,
              );
              const nTiroirs = caisses.filter(
                (c) =>
                  c.boutiqueId === b.id && c.type === TypeCaisse.TIROIR,
              ).length;
              const actifs = caisses.filter(
                (c) =>
                  c.boutiqueId === b.id &&
                  c.type === TypeCaisse.TIROIR &&
                  c.actif !== false,
              ).length;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    className={
                      boutiqueFocus === b.id
                        ? 'caisses-gestion-boutique actif'
                        : 'caisses-gestion-boutique'
                    }
                    onClick={() => {
                      setBoutiqueFocus(b.id);
                      setError(null);
                    }}
                  >
                    <span className="caisses-gestion-boutique-nom">{b.nom}</span>
                    <span className="caisses-gestion-boutique-meta">
                      {mag ? (
                        <span className="badge badge-ok">Magasin</span>
                      ) : (
                        <span className="badge badge-warning">Sans magasin</span>
                      )}
                      <span className="caisses-muted">
                        {actifs}/{nTiroirs} tiroir(s) actif(s)
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ListPanel>

        <section className="panel caisses-gestion-detail">
          <header className="caisses-gestion-detail-head">
            <div>
              <h2>
                {boutiques.find((b) => b.id === boutiqueFocus)?.nom ??
                  'Boutique'}
              </h2>
              <p className="lead">
                {magasinFocus
                  ? `Cash office : ${labelCaisse(magasinFocus)}`
                  : 'Aucune caisse magasin — obligatoire avant les tiroirs.'}
              </p>
            </div>
            {magasinFocus ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => onSelectCaisse(magasinFocus.id)}
              >
                Voir le solde
              </button>
            ) : peutCreerMagasin ? (
              <button
                type="button"
                className="btn-primary"
                disabled={createMagasin.isPending}
                onClick={() => createMagasin.mutate(boutiqueFocus)}
              >
                <Store size={14} /> Créer caisse magasin
              </button>
            ) : null}
          </header>

          {error && <p role="alert">{error}</p>}

          <div className="caisses-gestion-section">
            <h3>Tiroirs POS</h3>
            {tiroirsFocus.length === 0 ? (
              <EmptyState
                title="Aucun tiroir"
                description={
                  magasinFocus
                    ? 'Ajoutez T01, T02… pour les postes de caisse.'
                    : 'Créez d’abord la caisse magasin.'
                }
              />
            ) : (
              <table className="caisses-gestion-table">
                <thead>
                  <tr>
                    <th>Ordre</th>
                    <th>Code</th>
                    <th>Libellé</th>
                    <th>Statut</th>
                    <th>Solde</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tiroirsFocus.map((t) => (
                    <tr
                      key={t.id}
                      className={t.actif === false ? 'caisses-row-off' : undefined}
                    >
                      <td>{t.ordreAffichage ?? 0}</td>
                      <td>
                        <code>{t.code}</code>
                      </td>
                      <td>
                        {editId === t.id ? (
                          <input
                            value={editLibelle}
                            onChange={(e) => setEditLibelle(e.target.value)}
                          />
                        ) : (
                          t.libelle
                        )}
                      </td>
                      <td>
                        {t.actif === false ? (
                          <span className="badge badge-warning">Inactif</span>
                        ) : (
                          <span className="badge badge-ok">Actif</span>
                        )}
                      </td>
                      <td>
                        <SoldeValue caisseId={t.id} />
                      </td>
                      <td className="caisses-gestion-actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => onSelectCaisse(t.id)}
                        >
                          Fiche
                        </button>
                        {peutConfigTiroirs && editId !== t.id ? (
                          <>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => {
                                setEditId(t.id);
                                setEditLibelle(t.libelle ?? '');
                                setEditOrdre(t.ordreAffichage ?? 0);
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                updateTiroir.mutate({
                                  id: t.id,
                                  actif: t.actif === false,
                                })
                              }
                            >
                              {t.actif === false ? 'Activer' : 'Désactiver'}
                            </button>
                          </>
                        ) : null}
                        {peutConfigTiroirs && editId === t.id ? (
                          <>
                            <label className="caisses-gestion-ordre">
                              Ordre
                              <input
                                type="number"
                                min={0}
                                value={editOrdre}
                                onChange={(e) =>
                                  setEditOrdre(Number(e.target.value))
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() =>
                                updateTiroir.mutate({
                                  id: t.id,
                                  libelle: editLibelle,
                                  ordreAffichage: editOrdre,
                                })
                              }
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => setEditId(null)}
                            >
                              Annuler
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {peutConfigTiroirs && magasinFocus ? (
              <form
                className="stack-form filters-row caisses-gestion-add"
                onSubmit={onSubmitTiroir}
              >
                <label>
                  Code
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="T01"
                    required
                    maxLength={8}
                  />
                </label>
                <label>
                  Libellé
                  <input
                    value={libelle}
                    onChange={(e) => setLibelle(e.target.value)}
                    placeholder="Tiroir caisse 1"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createTiroir.isPending}
                >
                  <Plus size={14} /> Ajouter un tiroir
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

type FiltreType = '' | TypeCaisse;

interface NoeudBoutique {
  boutiqueId: string | null;
  nom: string;
  magasins: CaisseDto[];
  tiroirs: CaisseDto[];
}

export function CaissesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const magasin = useFiltreMagasinSiege();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: caisses, isLoading, isError } = useCaisses();
  const { data: boutiques } = useBoutiques();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get('caisseId'),
  );
  const [filtreBoutique, setFiltreBoutique] = useState(
    () => searchParams.get('boutiqueId') ?? '',
  );
  const typeParam = searchParams.get('type');
  const [filtreType, setFiltreType] = useState<FiltreType>(
    typeParam === TypeCaisse.MAGASIN ||
      typeParam === TypeCaisse.TIROIR ||
      typeParam === TypeCaisse.CENTRALE
      ? typeParam
      : '',
  );
  const [q, setQ] = useState('');
  const [masquerInactifs, setMasquerInactifs] = useState(true);
  const [vue, setVue] = useState<'structure' | 'gestion' | 'livre'>(() => {
    const v = searchParams.get('vue');
    if (v === 'livre' || v === 'gestion' || v === 'structure') return v;
    return 'structure';
  });
  const [groupesOuverts, setGroupesOuverts] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    const vueParam = searchParams.get('vue');
    if (vueParam === 'livre' || vueParam === 'gestion' || vueParam === 'structure') {
      setVue(vueParam);
    }
    const caisseParam = searchParams.get('caisseId');
    if (caisseParam) setSelectedId(caisseParam);
    const boutiqueParam = searchParams.get('boutiqueId');
    if (boutiqueParam) setFiltreBoutique(boutiqueParam);
  }, [searchParams]);

  useEffect(() => {
    if (
      typeParam === TypeCaisse.MAGASIN ||
      typeParam === TypeCaisse.TIROIR ||
      typeParam === TypeCaisse.CENTRALE
    ) {
      setFiltreType(typeParam);
    }
  }, [typeParam]);

  const peutConfigTiroirs =
    user !== null && ROLES_CONFIG_TIROIRS.includes(user.role as RoleLibelle);
  const peutCreerMagasin =
    user !== null &&
    (user.role === RoleLibelle.RESPONSABLE_SI ||
      user.role === RoleLibelle.DIRECTION_GENERALE);

  function nomBoutique(boutiqueId: string | null) {
    if (!boutiqueId) return 'Réseau';
    return boutiques?.find((x) => x.id === boutiqueId)?.nom ?? 'Boutique';
  }

  function isGroupeOuvert(key: string): boolean {
    return groupesOuverts[key] !== false;
  }

  function toggleGroupe(key: string) {
    setGroupesOuverts((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  }

  const filtered = useMemo(() => {
    const list = caisses ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((c) => {
      if (filtreBoutique && c.boutiqueId !== filtreBoutique) {
        if (!(filtreBoutique === '__centrale' && c.type === TypeCaisse.CENTRALE)) {
          return false;
        }
      }
      if (filtreType && c.type !== filtreType) return false;
      if (masquerInactifs && c.actif === false) return false;
      if (!needle) return true;
      const hay = `${labelCaisse(c)} ${c.code ?? ''} ${c.libelle ?? ''} ${c.type}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [caisses, filtreBoutique, filtreType, masquerInactifs, q]);

  const centrale = useMemo(
    () => filtered.find((c) => c.type === TypeCaisse.CENTRALE) ?? null,
    [filtered],
  );

  const arbres = useMemo((): NoeudBoutique[] => {
    const byBoutique = new Map<string, NoeudBoutique>();

    // Pré-créer une entrée pour chaque boutique du périmètre (multi-magasins).
    for (const b of boutiques ?? []) {
      if (filtreBoutique && filtreBoutique !== b.id) continue;
      byBoutique.set(b.id, {
        boutiqueId: b.id,
        nom: b.nom,
        magasins: [],
        tiroirs: [],
      });
    }

    for (const c of filtered) {
      if (c.type === TypeCaisse.CENTRALE) continue;
      const key = c.boutiqueId ?? '_';
      if (!byBoutique.has(key)) {
        byBoutique.set(key, {
          boutiqueId: c.boutiqueId,
          nom: nomBoutique(c.boutiqueId),
          magasins: [],
          tiroirs: [],
        });
      }
      const node = byBoutique.get(key)!;
      if (c.type === TypeCaisse.MAGASIN) node.magasins.push(c);
      if (c.type === TypeCaisse.TIROIR) node.tiroirs.push(c);
    }

    for (const node of byBoutique.values()) {
      node.magasins.sort(
        (a, b) => (a.ordreAffichage ?? 0) - (b.ordreAffichage ?? 0),
      );
      node.tiroirs.sort(
        (a, b) => (a.ordreAffichage ?? 0) - (b.ordreAffichage ?? 0),
      );
    }

    return [...byBoutique.values()]
      .filter((n) => {
        if (filtreType === TypeCaisse.MAGASIN) return n.magasins.length > 0;
        if (filtreType === TypeCaisse.TIROIR) return n.tiroirs.length > 0;
        if (q.trim()) return n.magasins.length + n.tiroirs.length > 0;
        return true;
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, boutiques, filtreBoutique, filtreType, q]);

  const selected =
    (caisses ?? []).find((c) => c.id === selectedId) ??
    centrale ??
    arbres[0]?.magasins[0] ??
    arbres[0]?.tiroirs[0] ??
    null;

  const selectedSolde = useSolde(selected?.id ?? null);

  const counts = useMemo(() => {
    const all = caisses ?? [];
    return {
      totale: all.length,
      magasins: all.filter((c) => c.type === TypeCaisse.MAGASIN).length,
      tiroirs: all.filter((c) => c.type === TypeCaisse.TIROIR).length,
      inactifs: all.filter((c) => c.actif === false).length,
    };
  }, [caisses]);

  return (
    <div className="caisses-module">
      <PageHeader
        title="Caisses"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Circuit TIROIR → MAGASIN → CENTRALE — soldes recalculés depuis le grand livre',
          texteBoutique: 'Caisses du magasin — soldes recalculés depuis le grand livre',
        })}
        actions={
          <div className="page-header-actions">
            <div className="dash-presets" role="group" aria-label="Vue">
              <button
                type="button"
                className={vue === 'structure' ? 'dash-preset actif' : 'dash-preset'}
                onClick={() => {
                  setVue('structure');
                  setSearchParams((p) => {
                    const n = new URLSearchParams(p);
                    n.set('vue', 'structure');
                    return n;
                  });
                }}
              >
                Structure
              </button>
              <button
                type="button"
                className={vue === 'livre' ? 'dash-preset actif' : 'dash-preset'}
                onClick={() => {
                  setVue('livre');
                  setSearchParams((p) => {
                    const n = new URLSearchParams(p);
                    n.set('vue', 'livre');
                    if (selectedId) n.set('caisseId', selectedId);
                    return n;
                  });
                }}
              >
                <BookOpen size={13} /> Grand livre
              </button>
              <button
                type="button"
                className={vue === 'gestion' ? 'dash-preset actif' : 'dash-preset'}
                onClick={() => {
                  setVue('gestion');
                  setSearchParams((p) => {
                    const n = new URLSearchParams(p);
                    n.set('vue', 'gestion');
                    return n;
                  });
                }}
              >
                Gestion
              </button>
            </div>
            <Link className="btn-ghost" to="/transactions?enCours=1">
              <ArrowRightLeft size={14} /> Versements
            </Link>
            <Link className="btn-ghost" to="/tresorerie">
              <Wallet size={14} /> Trésorerie
            </Link>
            {peutConfigTiroirs || peutCreerMagasin ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setVue('gestion')}
              >
                <Plus size={14} /> Gérer
              </button>
            ) : null}
          </div>
        }
      />

      {isLoading && <LoadingState label="Chargement des caisses..." />}
      {isError && <p role="alert">Erreur lors du chargement des caisses.</p>}

      {caisses && boutiques && vue === 'gestion' && (
        <GestionCaissesView
          boutiques={boutiques}
          caisses={caisses}
          peutConfigTiroirs={peutConfigTiroirs}
          peutCreerMagasin={peutCreerMagasin}
          onSelectCaisse={(id) => {
            setSelectedId(id);
            setVue('structure');
          }}
        />
      )}

      {caisses && vue === 'livre' && selected && (
        <section className="caisses-livre-special panel" aria-label="Grand livre">
          <header className="caisses-livre-special-head">
            <div className="caisses-livre-special-title">
              <span className={`caisses-detail-avatar caisses-node-${selected.type.toLowerCase()}`}>
                <TypeIcon type={selected.type} size={20} />
              </span>
              <div>
                <h2>Grand livre · {labelCaisse(selected)}</h2>
                <p>
                  {selected.type === TypeCaisse.CENTRALE
                    ? 'Trésorerie réseau'
                    : nomBoutique(selected.boutiqueId)}
                  {' · '}
                  solde{' '}
                  <strong className="money">
                    {selectedSolde.isLoading
                      ? '…'
                      : formatFcfa(selectedSolde.data?.solde)}
                  </strong>
                </p>
              </div>
            </div>
            <div className="caisses-livre-special-filters">
              <label>
                Caisse
                <select
                  value={selected.id}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setSearchParams((p) => {
                      const n = new URLSearchParams(p);
                      n.set('vue', 'livre');
                      n.set('caisseId', e.target.value);
                      return n;
                    });
                  }}
                >
                  {(caisses ?? [])
                    .slice()
                    .sort((a, b) => {
                      const o = {
                        CENTRALE: 0,
                        MAGASIN: 1,
                        TIROIR: 2,
                      } as Record<string, number>;
                      return (o[a.type] ?? 9) - (o[b.type] ?? 9);
                    })
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {typeLabel(c.type)} · {labelCaisse(c)}
                        {c.boutiqueId
                          ? ` (${nomBoutique(c.boutiqueId)})`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Filtrer la liste
                <select
                  value={filtreType}
                  onChange={(e) => setFiltreType(e.target.value as FiltreType)}
                >
                  <option value="">Tous les types</option>
                  <option value={TypeCaisse.CENTRALE}>Centrale</option>
                  <option value={TypeCaisse.MAGASIN}>Magasin</option>
                  <option value={TypeCaisse.TIROIR}>Tiroir</option>
                </select>
              </label>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setVue('structure');
                  setSearchParams((p) => {
                    const n = new URLSearchParams(p);
                    n.set('vue', 'structure');
                    return n;
                  });
                }}
              >
                ← Structure
              </button>
            </div>
          </header>
          <div className="caisses-livre-special-body">
            <aside className="caisses-livre-rail">
              <div className="caisses-livre-rail-label">Périmètre</div>
              {(caisses ?? [])
                .filter((c) => !filtreType || c.type === filtreType)
                .filter((c) => !(masquerInactifs && c.actif === false))
                .sort((a, b) => {
                  const o = {
                    CENTRALE: 0,
                    MAGASIN: 1,
                    TIROIR: 2,
                  } as Record<string, number>;
                  return (o[a.type] ?? 9) - (o[b.type] ?? 9);
                })
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={
                      selected.id === c.id
                        ? 'caisses-livre-rail-item actif'
                        : 'caisses-livre-rail-item'
                    }
                    onClick={() => {
                      setSelectedId(c.id);
                      setSearchParams((p) => {
                        const n = new URLSearchParams(p);
                        n.set('vue', 'livre');
                        n.set('caisseId', c.id);
                        return n;
                      });
                    }}
                  >
                    <span className={typeBadgeClass(c.type)}>
                      {typeLabel(c.type)}
                    </span>
                    <span className="caisses-livre-rail-name">
                      {labelCaisse(c)}
                    </span>
                    <span className="caisses-livre-rail-solde">
                      <SoldeValue caisseId={c.id} />
                    </span>
                  </button>
                ))}
            </aside>
            <div className="caisses-livre-special-ledger">
              <MouvementsCaisse
                caisseId={selected.id}
                typeCaisse={selected.type}
              />
            </div>
          </div>
        </section>
      )}

      {caisses && vue === 'structure' && (
        <>
          <section className="caisses-kpis" aria-label="Synthèse caisses">
            <article className="caisses-kpi">
              <span className="caisses-kpi-icon">
                <Landmark size={16} />
              </span>
              <div>
                <div className="caisses-kpi-label">Centrale</div>
                <div className="caisses-kpi-value">
                  {caisses.some((c) => c.type === TypeCaisse.CENTRALE)
                    ? '1'
                    : '0'}
                </div>
              </div>
            </article>
            <article className="caisses-kpi">
              <span className="caisses-kpi-icon">
                <Store size={16} />
              </span>
              <div>
                <div className="caisses-kpi-label">Magasins</div>
                <div className="caisses-kpi-value">{counts.magasins}</div>
              </div>
            </article>
            <article className="caisses-kpi">
              <span className="caisses-kpi-icon">
                <Monitor size={16} />
              </span>
              <div>
                <div className="caisses-kpi-label">Tiroirs</div>
                <div className="caisses-kpi-value">{counts.tiroirs}</div>
              </div>
            </article>
            <article className="caisses-kpi">
              <span className="caisses-kpi-icon">
                <BookOpen size={16} />
              </span>
              <div>
                <div className="caisses-kpi-label">Périmètre</div>
                <div className="caisses-kpi-value">{counts.totale}</div>
                {counts.inactifs > 0 ? (
                  <div className="caisses-kpi-hint">{counts.inactifs} inactif(s)</div>
                ) : null}
              </div>
            </article>
          </section>

          <section className="caisses-structure-filters panel" aria-label="Filtres structure">
            <div className="caisses-structure-filters-head">
              <div>
                <h3>Structure du circuit</h3>
                <p>
                  Filtrez par boutique, type ou recherche — {filtered.length}{' '}
                  caisse(s) visible(s)
                </p>
              </div>
              <div className="caisses-structure-chips" role="group" aria-label="Type rapide">
                {(
                  [
                    ['', 'Tous'],
                    [TypeCaisse.CENTRALE, 'Centrale'],
                    [TypeCaisse.MAGASIN, 'Magasins'],
                    [TypeCaisse.TIROIR, 'Tiroirs'],
                  ] as const
                ).map(([val, lab]) => (
                  <button
                    key={lab}
                    type="button"
                    className={
                      filtreType === val
                        ? 'caisses-structure-chip actif'
                        : 'caisses-structure-chip'
                    }
                    onClick={() => setFiltreType(val)}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar caisses-toolbar">
              <label className="caisses-search">
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Rechercher code, libellé…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <label>
                Boutique
                <select
                  value={filtreBoutique}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFiltreBoutique(v);
                    if (magasin.visible) {
                      magasin.setBoutiqueId(v === '__centrale' ? '' : v);
                    }
                  }}
                >
                  <option value="">Toutes</option>
                  <option value="__centrale">Centrale (réseau)</option>
                  {(boutiques ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="caisses-check">
                <input
                  type="checkbox"
                  checked={masquerInactifs}
                  onChange={(e) => setMasquerInactifs(e.target.checked)}
                />
                Masquer inactifs
              </label>
              <div className="caisses-structure-expand">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const n of arbres) next[n.boutiqueId ?? n.nom] = true;
                    setGroupesOuverts(next);
                  }}
                >
                  Tout ouvrir
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const n of arbres) next[n.boutiqueId ?? n.nom] = false;
                    setGroupesOuverts(next);
                  }}
                >
                  Tout plier
                </button>
              </div>
            </div>
          </section>

          <div className="caisses-layout">
            <ListPanel
              title="Arborescence"
              toolbar={
                <span className="dash-panel-meta">
                  {filtered.length} caisse(s) · {arbres.length} boutique(s)
                </span>
              }
            >
              {!centrale && arbres.length === 0 ? (
                <EmptyState
                  title="Aucune caisse"
                  description="Aucune caisse ne correspond aux filtres."
                />
              ) : (
                <div className="caisses-tree" role="tree">
                  {centrale && (
                    <div className="caisses-tree-group">
                      <div className="caisses-tree-group-label">Réseau</div>
                      <button
                        type="button"
                        role="treeitem"
                        aria-selected={selected?.id === centrale.id}
                        className={
                          selected?.id === centrale.id
                            ? 'caisses-node caisses-node-active'
                            : 'caisses-node'
                        }
                        onClick={() => {
                          navigate(`/caisses/${centrale.id}`);
                        }}
                      >
                        <span className="caisses-node-icon caisses-node-centrale">
                          <TypeIcon type={centrale.type} />
                        </span>
                        <span className="caisses-node-body">
                          <span className="caisses-node-title">
                            {labelCaisse(centrale)}
                          </span>
                          <span className="caisses-node-meta">
                            <span className={typeBadgeClass(centrale.type)}>
                              {typeLabel(centrale.type)}
                            </span>
                          </span>
                        </span>
                        <span className="caisses-node-solde">
                          <SoldeValue caisseId={centrale.id} />
                        </span>
                      </button>
                    </div>
                  )}

                  {arbres.map((node) => {
                    const key = node.boutiqueId ?? node.nom;
                    const ouvert = isGroupeOuvert(key);
                    const nb =
                      node.magasins.length + node.tiroirs.length;
                    return (
                      <div key={key} className="caisses-tree-group">
                        <button
                          type="button"
                          className="caisses-tree-group-toggle"
                          onClick={() => toggleGroupe(key)}
                          aria-expanded={ouvert}
                        >
                          {ouvert ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          <span>{node.nom}</span>
                          <span className="caisses-tree-group-meta">
                            {node.magasins.length} magasin
                            {node.magasins.length > 1 ? 's' : ''} ·{' '}
                            {node.tiroirs.length} tiroir
                            {node.tiroirs.length > 1 ? 's' : ''}
                          </span>
                        </button>
                        {ouvert && (
                          <>
                            {node.magasins.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                role="treeitem"
                                aria-selected={selected?.id === m.id}
                                className={
                                  selected?.id === m.id
                                    ? 'caisses-node caisses-node-active'
                                    : 'caisses-node'
                                }
                                onClick={() => {
                                  navigate(`/caisses/${m.id}`);
                                }}
                              >
                                <span className="caisses-node-icon caisses-node-magasin">
                                  <TypeIcon type={m.type} />
                                </span>
                                <span className="caisses-node-body">
                                  <span className="caisses-node-title">
                                    {labelCaisse(m)}
                                  </span>
                                  <span className="caisses-node-meta">
                                    <span className={typeBadgeClass(m.type)}>
                                      {typeLabel(m.type)}
                                    </span>
                                    <span className="caisses-muted">
                                      Cash office
                                    </span>
                                  </span>
                                </span>
                                <span className="caisses-node-solde">
                                  <SoldeValue caisseId={m.id} />
                                </span>
                              </button>
                            ))}
                            {node.tiroirs.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                role="treeitem"
                                aria-selected={selected?.id === t.id}
                                className={[
                                  'caisses-node',
                                  'caisses-node-tiroir',
                                  selected?.id === t.id
                                    ? 'caisses-node-active'
                                    : '',
                                  t.actif === false ? 'caisses-row-off' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => {
                                  navigate(`/caisses/${t.id}`);
                                }}
                              >
                                <span className="caisses-node-rail" aria-hidden />
                                <span className="caisses-node-icon caisses-node-drawer">
                                  <TypeIcon type={t.type} />
                                </span>
                                <span className="caisses-node-body">
                                  <span className="caisses-node-title">
                                    {labelCaisse(t)}
                                  </span>
                                  <span className="caisses-node-meta">
                                    <span className={typeBadgeClass(t.type)}>
                                      {typeLabel(t.type)}
                                    </span>
                                    {t.actif === false ? (
                                      <span className="badge badge-warning">
                                        Inactif
                                      </span>
                                    ) : (
                                      <span className="caisses-muted">
                                        Poste POS
                                      </span>
                                    )}
                                  </span>
                                </span>
                                <span className="caisses-node-solde">
                                  <SoldeValue caisseId={t.id} />
                                </span>
                              </button>
                            ))}
                            {nb === 0 ? (
                              <p className="lead caisses-tree-empty">
                                Aucune caisse sur cette boutique — configurez un
                                magasin / des tiroirs.
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ListPanel>

            <section className="panel caisses-detail" aria-live="polite">
              {!selected ? (
                <EmptyState
                  title="Sélectionnez une caisse"
                  description="Choisissez la centrale, un magasin ou un tiroir pour voir le solde et le grand livre."
                />
              ) : (
                <>
                  <header className="caisses-detail-hero">
                    <span
                      className={`caisses-detail-avatar caisses-node-${selected.type.toLowerCase()}`}
                    >
                      <TypeIcon type={selected.type} size={22} />
                    </span>
                    <div className="caisses-detail-hero-main">
                      <div className="caisses-detail-chips">
                        <span className={typeBadgeClass(selected.type)}>
                          {typeLabel(selected.type)}
                        </span>
                        <InfoTooltip insight={insightTypeCaisse(selected.type)} />
                        {selected.actif === false ? (
                          <span className="badge badge-warning">Inactif</span>
                        ) : null}
                      </div>
                      <h2>{labelCaisse(selected)}</h2>
                      <p className="caisses-detail-sub">
                        {selected.type === TypeCaisse.CENTRALE
                          ? 'Trésorerie réseau'
                          : nomBoutique(selected.boutiqueId)}
                        {selected.code ? ` · ${selected.code}` : ''}
                      </p>
                    </div>
                    <div className="caisses-detail-solde">
                      <div className="caisses-kpi-label">
                        Solde{' '}
                        <InfoTooltip insight={insightSoldeCaisse(selected.type)} />
                      </div>
                      <div className="caisses-detail-solde-value money">
                        {selectedSolde.isLoading
                          ? '…'
                          : formatFcfa(selectedSolde.data?.solde)}
                      </div>
                      <div className="caisses-muted">Grand livre append-only</div>
                    </div>
                  </header>

                  <div className="caisses-detail-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected
                      className="actif"
                    >
                      Aperçu
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={false}
                      onClick={() => {
                        setVue('livre');
                        setSearchParams((p) => {
                          const n = new URLSearchParams(p);
                          n.set('vue', 'livre');
                          n.set('caisseId', selected.id);
                          return n;
                        });
                      }}
                    >
                      <BookOpen size={13} /> Grand livre
                    </button>
                  </div>

                  <div className="caisses-detail-panel">
                      <dl className="caisses-dl">
                        <div>
                          <dt>Rôle dans le circuit</dt>
                          <dd>
                            {selected.type === TypeCaisse.TIROIR &&
                              'Encaissement client (session POS). Transfert interne vers le magasin à la clôture.'}
                            {selected.type === TypeCaisse.MAGASIN &&
                              (() => {
                                const nbTiroirs =
                                  arbres.find(
                                    (n) => n.boutiqueId === selected.boutiqueId,
                                  )?.tiroirs.length ?? 0;
                                return `Cash office boutique — ${nbTiroirs} tiroir(s) rattaché(s). Reçoit les transferts internes ; initie les SORTIE_FONDS vers la centrale (§6.4).`;
                              })()}
                            {selected.type === TypeCaisse.CENTRALE &&
                              'Réception et validation des versements magasin — Caissier central / DAF uniquement.'}
                          </dd>
                        </div>
                        <div>
                          <dt>Identifiant</dt>
                          <dd>
                            <details>
                              <summary>Afficher l’UUID</summary>
                              <code>{selected.id}</code>
                            </details>
                          </dd>
                        </div>
                      </dl>

                      <div className="caisses-detail-actions">
                        <Link className="btn-primary" to={`/caisses/${selected.id}`}>
                          Ouvrir la fiche
                        </Link>
                        {selected.type === TypeCaisse.MAGASIN ? (
                          <Link
                            className="btn-primary"
                            to={`/transactions?caisseId=${selected.id}`}
                          >
                            <ArrowRightLeft size={14} /> Initier / suivre versements
                          </Link>
                        ) : null}
                        {selected.type === TypeCaisse.TIROIR ? (
                          <Link className="btn-primary" to="/pos">
                            <Monitor size={14} /> Ouvrir le POS
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setVue('livre');
                            setSearchParams((p) => {
                              const n = new URLSearchParams(p);
                              n.set('vue', 'livre');
                              n.set('caisseId', selected.id);
                              return n;
                            });
                          }}
                        >
                          <BookOpen size={14} /> Voir le grand livre
                        </button>
                        {peutConfigTiroirs && selected.type === TypeCaisse.TIROIR ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setVue('gestion')}
                          >
                            Gérer les tiroirs
                          </button>
                        ) : null}
                      </div>
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
