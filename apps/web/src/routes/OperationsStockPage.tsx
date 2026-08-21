import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ClipboardList,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Warehouse,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { fmtDateHeure } from '../lib/achats-ui';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import type {
  BonStockDto,
  EntrepotDto,
  ProduitDto,
  RegleReapproDto,
  StockQuantDto,
} from '../lib/types';

const ROLES_PILOTE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const TYPE_LABEL: Record<BonStockDto['type'], string> = {
  RECEPTION: 'Réception',
  LIVRAISON: 'Livraison',
  TRANSFERT_INTERNE: 'Transfert interne',
  REBUT: 'Rebut',
};

const STATUT_LABEL: Record<BonStockDto['statut'], string> = {
  BROUILLON: 'Brouillon',
  PRET: 'Prêt',
  FAIT: 'Fait',
  ANNULE: 'Annulé',
};

const STATUT_BADGE: Record<BonStockDto['statut'], string> = {
  BROUILLON: 'badge',
  PRET: 'badge badge-warning',
  FAIT: 'badge badge-ok',
  ANNULE: 'badge badge-neutral',
};

const USAGE_LABEL: Record<string, string> = {
  STOCK: 'Stock vendable',
  ENTREE: 'Quai / entrée',
  SORTIE: 'Sortie',
  PERTE: 'Pertes / rebut',
  FOURNISSEUR: 'Virtuel fournisseur',
  CLIENT: 'Virtuel client',
};

const USAGE_HINT: Record<string, string> = {
  STOCK: 'Emplacement POS — le stock vendable ne bouge qu’au statut Fait d’un bon.',
  ENTREE: 'Quai de réception : les achats arrivent ici avant d’être mis en stock.',
  SORTIE: 'Zone de préparation / expédition interne.',
  PERTE: 'Rebut et casse — n’entre pas dans le stock vendable.',
  FOURNISSEUR: 'Emplacement virtuel (consignation / transit fournisseur).',
  CLIENT: 'Emplacement virtuel (consignation client).',
};

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

export function OperationsStockPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const vue = location.pathname.includes('emplacements')
    ? 'emplacements'
    : location.pathname.includes('reappro')
      ? 'reappro'
      : 'operations';
  const role = user?.role as RoleLibelle | undefined;
  const peutPiloter = role ? ROLES_PILOTE.includes(role) : false;

  const magasin = useFiltreMagasinSiege();
  const [type, setType] = useState<BonStockDto['type']>('TRANSFERT_INTERNE');
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [produitId, setProduitId] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [quantiteOk, setQuantiteOk] = useState<number | ''>('');
  const [quantiteRebut, setQuantiteRebut] = useState<number | ''>('');
  const [numeroLot, setNumeroLot] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regleProduitId, setRegleProduitId] = useState('');
  const [regleEntrepotId, setRegleEntrepotId] = useState('');
  const [regleMin, setRegleMin] = useState(0);
  const [regleMax, setRegleMax] = useState(0);
  const [scan, setScan] = useState('');
  const [lancerResultat, setLancerResultat] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<BonStockDto['statut'] | ''>('');
  const [filtreType, setFiltreType] = useState<BonStockDto['type'] | ''>('');
  const [rechercheBon, setRechercheBon] = useState('');
  const [rechercheEmpl, setRechercheEmpl] = useState('');

  const bonsQ = useQuery({
    queryKey: ['stocks', 'bons'],
    queryFn: () => apiFetch<BonStockDto[]>('/stocks/bons'),
  });
  const emplQ = useQuery({
    queryKey: ['stocks', 'emplacements'],
    queryFn: () => apiFetch<EntrepotDto[]>('/stocks/emplacements'),
  });
  const produitsQ = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
  });
  const reapproQ = useQuery({
    queryKey: ['stocks', 'reappro'],
    queryFn: () => apiFetch<RegleReapproDto[]>('/stocks/reappro'),
    enabled: vue === 'reappro',
  });
  const quantsQ = useQuery({
    queryKey: ['stocks'],
    queryFn: () => apiFetch<StockQuantDto[]>('/stocks'),
    enabled: vue === 'reappro',
  });

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<BonStockDto>('/stocks/bons', {
        method: 'POST',
        body: JSON.stringify({
          type,
          entrepotSourceId: sourceId || undefined,
          entrepotDestId: destId || undefined,
          lignes: [
            {
              produitId,
              quantite,
              quantiteOk: quantiteOk === '' ? undefined : quantiteOk,
              quantiteRebut: quantiteRebut === '' ? undefined : quantiteRebut,
              numeroLot: numeroLot.trim() || undefined,
            },
          ],
        }),
      }),
    onSuccess: (bon) => {
      void qc.invalidateQueries({ queryKey: ['stocks'] });
      setFormOpen(false);
      setErreur(null);
      navigate(`/stocks/operations/${bon.id}`);
    },
    onError: (e) => setErreur(messageErreur(e)),
  });

  const upsertRegle = useMutation({
    mutationFn: () =>
      apiFetch('/stocks/reappro', {
        method: 'POST',
        body: JSON.stringify({
          produitId: regleProduitId,
          entrepotId: regleEntrepotId,
          min: regleMin,
          max: regleMax,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stocks', 'reappro'] }),
    onError: (e) => setErreur(messageErreur(e)),
  });

  const lancer = useMutation({
    mutationFn: () =>
      apiFetch<{
        bonsCrees: number;
        commandesCrees: number;
        propositions: Array<{ route: string; quantiteTransfert: number; quantiteAchat: number }>;
      }>('/stocks/reappro/lancer', { method: 'POST' }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['stocks'] });
      void qc.invalidateQueries({ queryKey: ['achats-commandes'] });
      setLancerResultat(
        `${res.bonsCrees} bon(s) de transfert · ${res.commandesCrees} commande(s) d’achat (route Transférer / Acheter). Rien n’est déplacé tant que les bons ne sont pas au statut Fait.`,
      );
    },
    onError: (e) => setErreur(messageErreur(e)),
  });

  const entrepots = useMemo(() => {
    const all = emplQ.data ?? [];
    if (!magasin.boutiqueId) return all;
    return all.filter((e) => e.boutiqueId === magasin.boutiqueId);
  }, [emplQ.data, magasin.boutiqueId]);
  const produits = produitsQ.data ?? [];
  const bons = useMemo(() => {
    const all = bonsQ.data ?? [];
    if (!magasin.boutiqueId) return all;
    return all.filter(
      (b) =>
        b.entrepotSource?.boutiqueId === magasin.boutiqueId ||
        b.entrepotDest?.boutiqueId === magasin.boutiqueId,
    );
  }, [bonsQ.data, magasin.boutiqueId]);

  const bonsFiltres = useMemo(() => {
    const q = rechercheBon.trim().toLowerCase();
    return bons.filter((b) => {
      if (filtreStatut && b.statut !== filtreStatut) return false;
      if (filtreType && b.type !== filtreType) return false;
      if (!q) return true;
      const hay = `${b.numero} ${TYPE_LABEL[b.type]} ${b.entrepotSource?.nom ?? ''} ${b.entrepotDest?.nom ?? ''} ${b.lignes.map((l) => l.designation).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bons, filtreStatut, filtreType, rechercheBon]);

  const kpisBons = useMemo(() => {
    return {
      brouillon: bons.filter((b) => b.statut === 'BROUILLON').length,
      pret: bons.filter((b) => b.statut === 'PRET').length,
      fait: bons.filter((b) => b.statut === 'FAIT').length,
      annule: bons.filter((b) => b.statut === 'ANNULE').length,
    };
  }, [bons]);

  const titre =
    vue === 'emplacements'
      ? 'Emplacements'
      : vue === 'reappro'
        ? 'Réapprovisionnement'
        : 'Opérations de stock';

  const onCreer = (e: FormEvent) => {
    e.preventDefault();
    creer.mutate();
  };

  const usages = useMemo(() => {
    const q = rechercheEmpl.trim().toLowerCase();
    const map = new Map<string, EntrepotDto[]>();
    for (const e of entrepots) {
      if (q) {
        const hay = `${e.code} ${e.nom} ${e.boutique?.nom ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const k = e.usage ?? 'STOCK';
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [entrepots, rechercheEmpl]);

  const kpisEmpl = useMemo(() => {
    const stock = entrepots.filter((e) => (e.usage ?? 'STOCK') === 'STOCK' && !e.virtuel);
    return {
      total: entrepots.length,
      stock: stock.length,
      reseau: entrepots.filter((e) => e.reseau).length,
      virtuels: entrepots.filter((e) => e.virtuel).length,
    };
  }, [entrepots]);

  const qtyParCle = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of quantsQ.data ?? []) {
      map.set(`${q.produitId}:${q.entrepotId}`, q.quantite);
    }
    return map;
  }, [quantsQ.data]);

  const reglesEnrichies = useMemo(() => {
    const ids = magasin.boutiqueId
      ? new Set(entrepots.map((e) => e.id))
      : null;
    return (reapproQ.data ?? [])
      .filter((r) => {
        if (!ids) return true;
        if (r.entrepot.boutiqueId) return r.entrepot.boutiqueId === magasin.boutiqueId;
        return ids.has(r.entrepotId);
      })
      .map((r) => {
      const stock = qtyParCle.get(`${r.produitId}:${r.entrepotId}`) ?? 0;
      const sousMin = stock < r.min;
      const besoin = sousMin ? Math.max(0, r.max - stock) : 0;
      return { ...r, stock, sousMin, besoin };
    });
  }, [reapproQ.data, qtyParCle, magasin.boutiqueId, entrepots]);

  const aRelancer = reglesEnrichies.filter((r) => r.sousMin);

  return (
    <div className="page-stack stock-module">
      <PageHeader
        title={titre}
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            vue === 'operations'
              ? 'Bons journalisés — le stock vendable ne bouge qu’au statut Fait (BROUILLON → PRÊT → FAIT). Répartition hub → boutiques depuis une commande groupe (Achats).'
              : vue === 'emplacements'
                ? 'Carte des emplacements : stock vendable, quais, pertes et virtuels fournisseur/client.'
                : 'Règles min/max par magasin. Le lanceur crée des bons Transférer et, si le central est à sec, des commandes Acheter.',
        })}
        actions={
          vue === 'operations' && peutPiloter ? (
            <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
              <ClipboardList size={15} /> Nouveau bon
            </button>
          ) : vue === 'reappro' && peutPiloter ? (
            <button
              type="button"
              className="btn-primary"
              disabled={lancer.isPending || aRelancer.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    `Lancer le réappro pour ${aRelancer.length} règle(s) sous le min ? Des bons de transfert (et éventuellement des commandes) seront créés en brouillon.`,
                  )
                ) {
                  lancer.mutate();
                }
              }}
            >
              <RefreshCw size={15} /> Lancer le réappro
            </button>
          ) : undefined
        }
      />
      {erreur ? <p className="form-error">{erreur}</p> : null}

      {vue === 'operations' ? (
        <>
          <div className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Brouillons</div>
              <div className="kpi-value">{kpisBons.brouillon}</div>
              <div className="kpi-hint">pas encore prêts</div>
            </article>
            <article className="kpi-card dash-kpi kpi-warning">
              <div className="kpi-label">Prêts</div>
              <div className="kpi-value">{kpisBons.pret}</div>
              <div className="kpi-hint">à valider pour bouger le stock</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Faits</div>
              <div className="kpi-value">{kpisBons.fait}</div>
              <div className="kpi-hint">écritures de stock posées</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Annulés</div>
              <div className="kpi-value">{kpisBons.annule}</div>
              <div className="kpi-hint">sans mouvement</div>
            </article>
          </div>

          <div className="toolbar stock-toolbar">
            <FiltreMagasinSiege id="ops-filtre-magasin" />
            <div>
              <label htmlFor="rech-bon">Rechercher</label>
              <div className="table-actions">
                <Search size={16} />
                <input
                  id="rech-bon"
                  type="search"
                  placeholder="N°, article, emplacement…"
                  value={rechercheBon}
                  onChange={(e) => setRechercheBon(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="filtre-type-bon">Type</label>
              <select
                id="filtre-type-bon"
                value={filtreType}
                onChange={(e) => setFiltreType(e.target.value as BonStockDto['type'] | '')}
              >
                <option value="">Tous</option>
                {(Object.keys(TYPE_LABEL) as BonStockDto['type'][]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filtre-statut-bon">Statut</label>
              <select
                id="filtre-statut-bon"
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value as BonStockDto['statut'] | '')}
              >
                <option value="">Tous</option>
                {(Object.keys(STATUT_LABEL) as BonStockDto['statut'][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {bonsQ.isLoading ? (
            <LoadingState label="Chargement des bons…" />
          ) : bons.length === 0 ? (
            <EmptyState
              title="Aucun bon"
              description="Créez un transfert interne, une réception quai ou un rebut. Le stock vendable ne change qu’après validation (Fait)."
              action={
                peutPiloter ? (
                  <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
                    Nouveau bon
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ListPanel title={`${bonsFiltres.length} bon(s)`}>
              {bonsFiltres.length === 0 ? (
                <p className="lead">Aucun bon pour ces filtres.</p>
              ) : (
                <div className="clients-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Source → dest.</th>
                        <th>Lignes</th>
                        <th>Créé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonsFiltres.map((b) => (
                        <tr
                          key={b.id}
                          className="produit-row"
                          tabIndex={0}
                          role="link"
                          onClick={() => navigate(`/stocks/operations/${b.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigate(`/stocks/operations/${b.id}`);
                            }
                          }}
                        >
                          <td>
                            <strong>{b.numero}</strong>
                          </td>
                          <td>{TYPE_LABEL[b.type]}</td>
                          <td>
                            <span className={STATUT_BADGE[b.statut]}>{STATUT_LABEL[b.statut]}</span>
                          </td>
                          <td>
                            {b.entrepotSource?.code ?? '—'} → {b.entrepotDest?.code ?? '—'}
                          </td>
                          <td>{b.lignes.length}</td>
                          <td>{fmtDateHeure(b.dateCreation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ListPanel>
          )}
        </>
      ) : null}

      {vue === 'emplacements' ? (
        emplQ.isLoading ? (
          <LoadingState label="Chargement des emplacements…" />
        ) : (
          <>
            <div className="kpi-grid dash-kpi-grid">
              <article className="kpi-card dash-kpi">
                <div className="dash-kpi-top">
                  <span className="dash-kpi-icon">
                    <Warehouse size={16} />
                  </span>
                </div>
                <div className="kpi-label">Emplacements</div>
                <div className="kpi-value">{kpisEmpl.total}</div>
                <div className="kpi-hint">actifs</div>
              </article>
              <article className="kpi-card dash-kpi">
                <div className="kpi-label">Stock vendable</div>
                <div className="kpi-value">{kpisEmpl.stock}</div>
                <div className="kpi-hint">usage STOCK, non virtuels</div>
              </article>
              <article className="kpi-card dash-kpi">
                <div className="kpi-label">Réseau / central</div>
                <div className="kpi-value">{kpisEmpl.reseau}</div>
                <div className="kpi-hint">WH central et quais</div>
              </article>
              <article className="kpi-card dash-kpi">
                <div className="kpi-label">Virtuels</div>
                <div className="kpi-value">{kpisEmpl.virtuels}</div>
                <div className="kpi-hint">fournisseur / client</div>
              </article>
            </div>
            <div className="toolbar">
              <FiltreMagasinSiege id="empl-filtre-magasin" />
              <div>
                <label htmlFor="rech-empl">Rechercher</label>
                <div className="table-actions">
                  <Search size={16} />
                  <input
                    id="rech-empl"
                    type="search"
                    placeholder="Code, nom, boutique…"
                    value={rechercheEmpl}
                    onChange={(e) => setRechercheEmpl(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {usages.length === 0 ? (
              <EmptyState
                title="Aucun emplacement"
                description="Les entrepôts se créent avec les boutiques (PRINCIPAL) et le WH central."
              />
            ) : (
              usages.map(([usage, list]) => (
                <ListPanel
                  key={usage}
                  title={`${USAGE_LABEL[usage] ?? usage} (${list.length})`}
                >
                  <p className="lead">{USAGE_HINT[usage]}</p>
                  <div className="clients-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Nom</th>
                          <th>Boutique</th>
                          <th>Réseau</th>
                          <th>Virtuel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((e) => (
                          <tr key={e.id} className="produit-row">
                            <td>
                              <Link to={`/stocks/entrepots/${e.id}`}>{e.code}</Link>
                            </td>
                            <td>{e.nom}</td>
                            <td>{e.boutique?.nom ?? e.boutiqueId}</td>
                            <td>{e.reseau ? 'Oui' : 'Non'}</td>
                            <td>{e.virtuel ? 'Oui' : 'Non'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ListPanel>
              ))
            )}
          </>
        )
      ) : null}

      {vue === 'reappro' ? (
        <>
          <div className="toolbar stock-toolbar">
            <FiltreMagasinSiege id="reappro-filtre-magasin" />
          </div>
          <div className="kpi-grid dash-kpi-grid">
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Règles</div>
              <div className="kpi-value">{reglesEnrichies.length}</div>
              <div className="kpi-hint">min/max par magasin</div>
            </article>
            <article
              className={
                aRelancer.length > 0 ? 'kpi-card dash-kpi kpi-warning' : 'kpi-card dash-kpi'
              }
            >
              <div className="kpi-label">Sous le min</div>
              <div className="kpi-value">{aRelancer.length}</div>
              <div className="kpi-hint">à transférer ou acheter</div>
            </article>
            <article className="kpi-card dash-kpi">
              <div className="kpi-label">Unités à combler</div>
              <div className="kpi-value">
                {aRelancer.reduce((n, r) => n + r.besoin, 0)}
              </div>
              <div className="kpi-hint">jusqu’au max</div>
            </article>
          </div>
          {peutPiloter ? (
            <ListPanel title="Nouvelle règle min/max">
              <form
                className="form-grid-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  upsertRegle.mutate();
                }}
              >
                <div className="form-field">
                  <label htmlFor="regle-produit">Produit</label>
                  <select
                    id="regle-produit"
                    value={regleProduitId}
                    onChange={(ev) => setRegleProduitId(ev.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {produits.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.designation}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="regle-entrepot">Entrepôt magasin</label>
                  <select
                    id="regle-entrepot"
                    value={regleEntrepotId}
                    onChange={(ev) => setRegleEntrepotId(ev.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {entrepots
                      .filter((e) => e.usage === 'STOCK' && !e.reseau)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nom} ({e.code})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="regle-min">Min</label>
                  <input
                    id="regle-min"
                    type="number"
                    min={0}
                    value={regleMin}
                    onChange={(ev) => setRegleMin(Number(ev.target.value))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="regle-max">Max</label>
                  <input
                    id="regle-max"
                    type="number"
                    min={0}
                    value={regleMax}
                    onChange={(ev) => setRegleMax(Number(ev.target.value))}
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={upsertRegle.isPending}>
                  Enregistrer la règle
                </button>
              </form>
            </ListPanel>
          ) : null}
          {lancerResultat ? <p className="lead">{lancerResultat}</p> : null}
          {reapproQ.isLoading ? (
            <LoadingState label="Chargement des règles…" />
          ) : reglesEnrichies.length === 0 ? (
            <EmptyState
              title="Aucune règle"
              description="Définissez un min/max par magasin. Le lanceur transfère depuis le central, ou crée une commande d’achat si le hub est insuffisant."
            />
          ) : (
            <ListPanel title="Règles et stock actuel">
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Entrepôt</th>
                      <th>Stock</th>
                      <th>Min</th>
                      <th>Max</th>
                      <th>Besoin</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reglesEnrichies.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/produits/${r.produitId}`}>{r.produit.designation}</Link>
                        </td>
                        <td>
                          {r.entrepot.nom} ({r.entrepot.code})
                        </td>
                        <td>
                          <strong>{r.stock}</strong>
                        </td>
                        <td>{r.min}</td>
                        <td>{r.max}</td>
                        <td>{r.besoin || '—'}</td>
                        <td>
                          {r.sousMin ? (
                            <span className="badge badge-warning">Sous min</span>
                          ) : (
                            <span className="badge badge-ok">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {aRelancer.length > 0 && peutPiloter ? (
                <p className="lead" style={{ marginTop: 12 }}>
                  {aRelancer.length} magasin(s) sous le min — le lanceur crée des bons (Transférer)
                  et éventuellement des commandes (Acheter).{' '}
                  <Link to="/stocks/operations">Voir les bons</Link>
                </p>
              ) : null}
            </ListPanel>
          )}
        </>
      ) : null}

      <Modal
        open={formOpen}
        title="Nouveau bon de stock"
        description="Brouillon uniquement — le stock ne bouge qu’après Mise en prêt puis Valider (Fait)."
        size="lg"
        onClose={() => setFormOpen(false)}
      >
        <form className="form-grid" onSubmit={onCreer}>
          <label>
            Type
            <select
              value={type}
              onChange={(ev) => setType(ev.target.value as BonStockDto['type'])}
            >
              <option value="TRANSFERT_INTERNE">Transfert interne</option>
              <option value="RECEPTION">Réception (quai)</option>
              <option value="REBUT">Rebut</option>
              <option value="LIVRAISON">Livraison</option>
            </select>
          </label>
          <label>
            Source
            <select value={sourceId} onChange={(ev) => setSourceId(ev.target.value)}>
              <option value="">—</option>
              {entrepots.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.code}){e.boutique ? ` — ${e.boutique.nom}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination
            <select value={destId} onChange={(ev) => setDestId(ev.target.value)}>
              <option value="">—</option>
              {entrepots.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.code}){e.boutique ? ` — ${e.boutique.nom}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Produit
            <input
              value={scan}
              onChange={(ev) => {
                const v = ev.target.value;
                setScan(v);
                const match = produits.find(
                  (p) =>
                    p.codeBarres === v.trim() ||
                    p.reference === v.trim() ||
                    p.id === v.trim(),
                );
                if (match) setProduitId(match.id);
              }}
              placeholder="Scanner code-barres ou choisir ci-dessous"
            />
            <select
              value={produitId}
              onChange={(ev) => setProduitId(ev.target.value)}
              required
            >
              <option value="">—</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.designation}
                  {p.codeBarres ? ` · ${p.codeBarres}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantité
            <input
              type="number"
              min={1}
              value={quantite}
              onChange={(ev) => setQuantite(Number(ev.target.value))}
              required
            />
          </label>
          {type === 'RECEPTION' ? (
            <>
              <label>
                OK (qualité)
                <input
                  type="number"
                  min={0}
                  value={quantiteOk}
                  onChange={(ev) =>
                    setQuantiteOk(ev.target.value === '' ? '' : Number(ev.target.value))
                  }
                />
              </label>
              <label>
                Rebut
                <input
                  type="number"
                  min={0}
                  value={quantiteRebut}
                  onChange={(ev) =>
                    setQuantiteRebut(ev.target.value === '' ? '' : Number(ev.target.value))
                  }
                />
              </label>
            </>
          ) : null}
          <label>
            N° de lot
            <input
              value={numeroLot}
              onChange={(ev) => setNumeroLot(ev.target.value)}
              placeholder="Optionnel"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={creer.isPending}>
            Créer le brouillon
          </button>
        </form>
      </Modal>
      {vue === 'operations' ? (
        <p className="lead">
          <ArrowLeftRight size={14} /> Transfert immédiat (une écriture) :{' '}
          <Link to="/stocks">page Stocks</Link>. Les bons ci-dessus restent le circuit journalisé.
        </p>
      ) : vue === 'emplacements' ? (
        <p className="lead">
          <MapPin size={14} /> <Package size={14} /> Cliquez un code pour ouvrir la fiche entrepôt.
        </p>
      ) : null}
    </div>
  );
}
