import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronRight,
  ClipboardCheck,
  Download,
  Package,
  PackageX,
  Search,
  SlidersHorizontal,
  Timer,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RoleLibelle, profilOf } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  restreindreSyntheseAuMagasin,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  insightCouvertureJours,
  insightSanteStock,
  insightStockQuantite,
  insightSuggestionTransfert,
  insightValeurInventaire,
  insightValorisationVide,
} from '../lib/insights/stocks';
import type {
  EntrepotDto,
  InventairePrioriteDto,
  MouvementStockDto,
  ProduitDto,
  StatutStockLigne,
  StockSyntheseDto,
} from '../lib/types';

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

const ROLES_ECRITURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

const ROLES_AJUSTEMENT_LIBRE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
];

const TYPE_MOUVEMENT: Record<MouvementStockDto['type'], string> = {
  RECEPTION: 'Réception',
  VENTE: 'Vente',
  RETOUR: 'Retour',
  AJUSTEMENT: 'Ajustement',
  TRANSFERT_OUT: 'Transfert sortie',
  TRANSFERT_IN: 'Transfert entrée',
  SCRAP: 'Rebut',
};

const STATUT_LABEL: Record<StatutStockLigne, string> = {
  RUPTURE: 'Rupture',
  SOUS_SEUIL: 'Sous seuil',
  OK: 'OK',
};

const COULEURS_STATUT: Record<StatutStockLigne, string> = {
  RUPTURE: '#b42318',
  SOUS_SEUIL: '#b54708',
  OK: '#0f766e',
};

type VueNiveaux = 'liste' | 'matrice';
type FiltreStatut = 'TOUS' | StatutStockLigne;

function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return `${value} FCFA`;
  return `${n.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} FCFA`;
}

function messageErreur(err: unknown): string {
  if (!(err instanceof Error)) return 'Une erreur est survenue.';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(' ');
  } catch {
    /* corps non JSON */
  }
  return err.message;
}

function chartTooltipStyle(): Record<string, string> {
  return {
    background: '#fff',
    border: '1px solid #d8dee6',
    borderRadius: '8px',
    fontSize: '12.5px',
  };
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function exporterInventaireCsv(
  lignes: StockSyntheseDto['lignes'],
  entrepots: StockSyntheseDto['parEntrepot'],
  colonneStock: string,
) {
  const headers = [
    'Produit',
    'Référence',
    'Catégorie',
    'Actif',
    'Statut',
    'Seuil',
    colonneStock,
    'Prévu',
    'Valeur CMP',
    'Couverture jours',
    ...entrepots.map((e) => `${e.code} (${e.nomBoutique})`),
  ];
  const rows = lignes.map((l) => [
    csvCell(l.designation),
    csvCell(l.reference),
    csvCell(l.categorie),
    l.actif ? 'oui' : 'non',
    l.statut,
    l.seuilReappro ?? '',
    l.stockReseau,
    l.stockPrevu ?? '',
    l.valeur,
    l.couvertureJours ?? '',
    ...entrepots.map((e) => qtyAt(l, e.entrepotId)?.quantite ?? ''),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventaire-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function qtyAt(
  ligne: StockSyntheseDto['lignes'][number],
  entrepotId: string,
): { quantite: number; statut: StatutStockLigne } | null {
  return ligne.parEntrepot.find((c) => c.entrepotId === entrepotId) ?? null;
}

export function StocksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutEcrire = user !== null && ROLES_ECRITURE.includes(user.role);
  const peutAjusterLibre =
    user !== null && ROLES_AJUSTEMENT_LIBRE.includes(user.role);
  const magasin = useFiltreMagasinSiege();
  const libelleStockColonne =
    magasin.boutiqueId ||
    (user &&
      profilOf(user.role).perimetre !== 'RESEAU' &&
      profilOf(user.role).perimetre !== 'SYSTEME')
      ? 'Stock'
      : 'Réseau';

  const [filtreEntrepot, setFiltreEntrepot] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('TOUS');
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [voirInactifs, setVoirInactifs] = useState(false);
  const [couvertureFaible, setCouvertureFaible] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<VueNiveaux>('liste');
  const [filtreTypeMvt, setFiltreTypeMvt] = useState('');
  const [modalAjuster, setModalAjuster] = useState(false);
  const [modalTransferer, setModalTransferer] = useState(false);

  const entrepots = useQuery({
    queryKey: ['entrepots'],
    queryFn: () => apiFetch<EntrepotDto[]>('/entrepots'),
    enabled: peutLire,
  });
  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled: peutLire,
  });
  const synthese = useQuery({
    queryKey: ['stocks-synthese', filtreEntrepot],
    queryFn: () =>
      apiFetch<StockSyntheseDto>(
        filtreEntrepot
          ? `/stocks/synthese?entrepotId=${filtreEntrepot}`
          : '/stocks/synthese',
      ),
    enabled: peutLire,
  });
  const mouvements = useQuery({
    queryKey: ['stocks-mouvements', filtreEntrepot],
    queryFn: () =>
      apiFetch<MouvementStockDto[]>(
        filtreEntrepot
          ? `/stocks/mouvements?entrepotId=${filtreEntrepot}`
          : '/stocks/mouvements',
      ),
    enabled: peutLire,
  });
  const prioritesInventaire = useQuery({
    queryKey: ['inventaires-priorites'],
    queryFn: () => apiFetch<InventairePrioriteDto[]>('/inventaires/priorites'),
    enabled: peutLire,
  });

  const entrepotOptions = useMemo(() => {
    const all = entrepots.data ?? [];
    if (!magasin.boutiqueId) return all;
    return all.filter((e) => e.boutiqueId === magasin.boutiqueId);
  }, [entrepots.data, magasin.boutiqueId]);

  useEffect(() => {
    if (!magasin.boutiqueId || !filtreEntrepot) return;
    if (!entrepotOptions.some((e) => e.id === filtreEntrepot)) {
      setFiltreEntrepot('');
    }
  }, [magasin.boutiqueId, filtreEntrepot, entrepotOptions]);

  const syntheseAffichee = useMemo(() => {
    const raw = synthese.data;
    if (!raw) return undefined;
    if (!magasin.boutiqueId || filtreEntrepot) return raw;
    return restreindreSyntheseAuMagasin(raw, magasin.boutiqueId);
  }, [synthese.data, magasin.boutiqueId, filtreEntrepot]);

  const entrepotCols = syntheseAffichee?.parEntrepot ?? [];

  const [ajProduit, setAjProduit] = useState('');
  const [ajEntrepot, setAjEntrepot] = useState('');
  const [ajQty, setAjQty] = useState('');
  const [ajRef, setAjRef] = useState('');
  const [ajErr, setAjErr] = useState<string | null>(null);

  const [trProduit, setTrProduit] = useState('');
  const [trSource, setTrSource] = useState('');
  const [trDest, setTrDest] = useState('');
  const [trQty, setTrQty] = useState('');
  const [trRecherche, setTrRecherche] = useState('');
  const [trErr, setTrErr] = useState<string | null>(null);

  function invaliderStocks() {
    void queryClient.invalidateQueries({ queryKey: ['stocks'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks-synthese'] });
    void queryClient.invalidateQueries({ queryKey: ['stocks-mouvements'] });
    void queryClient.invalidateQueries({ queryKey: ['produits'] });
  }

  const ajuster = useMutation({
    mutationFn: () =>
      apiFetch('/stocks/ajustements', {
        method: 'POST',
        body: JSON.stringify({
          produitId: ajProduit,
          entrepotId: ajEntrepot,
          quantiteComptee: Number(ajQty),
          ...(ajRef.trim() ? { reference: ajRef.trim() } : {}),
        }),
      }),
    onSuccess: () => {
      setAjErr(null);
      setAjQty('');
      setAjRef('');
      setModalAjuster(false);
      invaliderStocks();
    },
    onError: (err) => setAjErr(messageErreur(err)),
  });

  const transferer = useMutation({
    mutationFn: () =>
      apiFetch('/stocks/transferts', {
        method: 'POST',
        body: JSON.stringify({
          produitId: trProduit,
          entrepotSourceId: trSource,
          entrepotDestId: trDest,
          quantite: Number(trQty),
        }),
      }),
    onSuccess: () => {
      setTrErr(null);
      setTrQty('');
      setModalTransferer(false);
      invaliderStocks();
    },
    onError: (err) => setTrErr(messageErreur(err)),
  });

  const lignesFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (syntheseAffichee?.lignes ?? []).filter((ligne) => {
      if (!voirInactifs && !ligne.actif) return false;
      if (filtreStatut !== 'TOUS' && ligne.statut !== filtreStatut) return false;
      if (filtreCategorie && ligne.categorie !== filtreCategorie) return false;
      if (q) {
        const hay = `${ligne.designation} ${ligne.reference ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (couvertureFaible) {
        const faible =
          ligne.couvertureJours !== null && ligne.couvertureJours < 14;
        if (!faible) return false;
      }
      return true;
    });
  }, [
    syntheseAffichee?.lignes,
    filtreStatut,
    filtreCategorie,
    recherche,
    voirInactifs,
    couvertureFaible,
  ]);

  const mouvementsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const idsMagasin = magasin.boutiqueId
      ? new Set(entrepotOptions.map((e) => e.id))
      : null;
    return (mouvements.data ?? []).filter((m) => {
      if (idsMagasin && m.entrepotId && !idsMagasin.has(m.entrepotId)) return false;
      if (filtreTypeMvt && m.type !== filtreTypeMvt) return false;
      if (!q) return true;
      const designation =
        m.produit?.designation ??
        produits.data?.find((p) => p.id === m.produitId)?.designation ??
        '';
      return designation.toLowerCase().includes(q);
    });
  }, [
    mouvements.data,
    filtreTypeMvt,
    recherche,
    produits.data,
    magasin.boutiqueId,
    entrepotOptions,
  ]);

  const statutChart = useMemo(() => {
    const data = syntheseAffichee;
    if (!data) return [];
    const ok = Math.max(
      0,
      data.lignes.reduce((n, l) => n + l.parEntrepot.length, 0) -
        data.kpis.ruptures -
        data.kpis.sousSeuil,
    );
    return [
      { key: 'RUPTURE' as const, label: 'Ruptures', value: data.kpis.ruptures },
      { key: 'SOUS_SEUIL' as const, label: 'Sous seuil', value: data.kpis.sousSeuil },
      { key: 'OK' as const, label: 'OK', value: ok },
    ].filter((d) => d.value > 0);
  }, [syntheseAffichee]);

  const qtyActuelleAjustement = useMemo(() => {
    const ligne = synthese.data?.lignes.find((l) => l.produitId === ajProduit);
    if (!ligne || !ajEntrepot) return null;
    return qtyAt(ligne, ajEntrepot)?.quantite ?? 0;
  }, [synthese.data, ajProduit, ajEntrepot]);

  const qtySourceTransfert = useMemo(() => {
    const ligne = synthese.data?.lignes.find((l) => l.produitId === trProduit);
    if (!ligne || !trSource) return null;
    return qtyAt(ligne, trSource)?.quantite ?? 0;
  }, [synthese.data, trProduit, trSource]);

  const qtyDestTransfert = useMemo(() => {
    const ligne = synthese.data?.lignes.find((l) => l.produitId === trProduit);
    if (!ligne || !trDest) return null;
    return qtyAt(ligne, trDest)?.quantite ?? 0;
  }, [synthese.data, trProduit, trDest]);

  const produitsSelect = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of produits.data ?? []) {
      byId.set(p.id, p.designation);
    }
    for (const l of synthese.data?.lignes ?? []) {
      byId.set(l.produitId, l.designation);
    }
    return Array.from(byId, ([id, designation]) => ({ id, designation })).sort(
      (a, b) => a.designation.localeCompare(b.designation, 'fr'),
    );
  }, [produits.data, synthese.data?.lignes]);

  const entrepotsSelect = useMemo(() => {
    if (entrepotOptions.length) {
      return entrepotOptions.map((e) => ({
        id: e.id,
        label: `${e.code} — ${e.boutique?.nom ?? e.nom}`,
      }));
    }
    return entrepotCols.map((e) => ({
      id: e.entrepotId,
      label: `${e.code} — ${e.nomBoutique}`,
    }));
  }, [entrepotOptions, entrepotCols]);

  function ouvrirAjuster(produitId?: string, entrepotId?: string) {
    setAjProduit(produitId || synthese.data?.lignes[0]?.produitId || produits.data?.[0]?.id || '');
    setAjEntrepot(entrepotId || entrepotCols[0]?.entrepotId || entrepotOptions[0]?.id || '');
    setAjQty('');
    setAjRef('');
    setAjErr(null);
    setModalAjuster(true);
  }

  function ouvrirTransfert(prefill?: {
    produitId: string;
    sourceId: string;
    destId: string;
    quantite: number;
  }) {
    setTrProduit(prefill?.produitId || synthese.data?.lignes[0]?.produitId || produits.data?.[0]?.id || '');
    setTrSource(prefill?.sourceId || entrepotCols[0]?.entrepotId || entrepotOptions[0]?.id || '');
    setTrDest(
      prefill?.destId ||
        entrepotCols[1]?.entrepotId ||
        entrepotOptions[1]?.id ||
        entrepotCols[0]?.entrepotId ||
        '',
    );
    setTrQty(prefill ? String(prefill.quantite) : '');
    setTrRecherche('');
    setTrErr(null);
    setModalTransferer(true);
  }

  const categoriesStock = useMemo(() => {
    const set = new Set<string>();
    for (const l of syntheseAffichee?.lignes ?? []) {
      if (l.categorie) set.add(l.categorie);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [syntheseAffichee?.lignes]);

  const valeurNulle = (syntheseAffichee?.parEntrepot ?? []).every(
    (e) => Number(e.valeur) === 0,
  );
  const totalEmplacements = statutChart.reduce((n, s) => n + s.value, 0);

  function allerNiveaux() {
    window.setTimeout(() => {
      document.getElementById('stock-niveaux')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }

  function toggleStatut(s: FiltreStatut) {
    setFiltreStatut((prev) => (prev === s ? 'TOUS' : s));
    setCouvertureFaible(false);
    allerNiveaux();
  }

  if (!peutLire) {
    return <p>Vous n’avez pas accès aux stocks.</p>;
  }

  const data = syntheseAffichee;
  const sante = data?.sante ?? 'OK';
  const prioritesMagasin = (prioritesInventaire.data ?? []).filter(
    (p) =>
      !magasin.boutiqueId ||
      p.boutiqueId === magasin.boutiqueId ||
      entrepotOptions.some((e) => e.id === p.entrepotId),
  );

  return (
    <div className="stock-module">
      <PageHeader
        title="Stocks"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau: 'Niveaux par entrepôt, valorisation CMP, couverture et transferts',
          texteBoutique: 'Stock du magasin — niveaux par entrepôt local',
        })}
        actions={
          <>
            {data ? (
              <button
                type="button"
                onClick={() =>
                  exporterInventaireCsv(
                    lignesFiltrees,
                    data.parEntrepot,
                    libelleStockColonne,
                  )
                }
              >
                <Download size={15} /> Export CSV
              </button>
            ) : null}
            {peutAjusterLibre ? (
              <button type="button" onClick={() => ouvrirAjuster()}>
                <ClipboardCheck size={15} /> Ajuster
              </button>
            ) : null}
            <Link to="/inventaires" className="stock-row-link">
              Inventaire physique
            </Link>
            {peutEcrire ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => ouvrirTransfert()}
              >
                <ArrowLeftRight size={15} /> Transférer
              </button>
            ) : null}
          </>
        }
      />

      {synthese.isLoading && <LoadingState label="Chargement de l’inventaire..." />}
      {synthese.isError && <p role="alert">Erreur de chargement de l’inventaire.</p>}

      {(prioritesMagasin).some((p) => p.aInventorier) && (
        <section className="dash-sante dash-sante-warning">
          <div className="dash-sante-main">
            <span className="dash-sante-badge">Inventaire en retard</span>
            <p>
              {prioritesMagasin.filter((p) => p.aInventorier).length}{' '}
              entrepôt(s) sans inventaire validé depuis 30 jours.
            </p>
          </div>
          <div className="dash-sante-meta">
            <Link to="/inventaires">Ouvrir un inventaire</Link>
          </div>
        </section>
      )}

      {data && (
        <>
          <section className={`dash-sante dash-sante-${sante === 'CRITIQUE' ? 'critical' : sante === 'VIGILANCE' ? 'warning' : 'ok'}`}>
            <div className="dash-sante-main">
              <span className="dash-sante-badge">
                {sante === 'CRITIQUE'
                  ? 'Critique'
                  : sante === 'VIGILANCE'
                    ? 'Vigilance'
                    : 'Sain'}
              </span>
              <p>
                {data.kpis.ruptures} rupture(s) · {data.kpis.sousSeuil} sous
                seuil · {data.kpis.skuDistincts} référence(s)
                <InfoTooltip
                  insight={insightSanteStock(
                    data.sante,
                    data.kpis.ruptures,
                    data.kpis.sousSeuil,
                  )}
                />
              </p>
            </div>
            <div className="dash-sante-meta">
              <span>
                Actualisé {new Date(data.genereAt).toLocaleTimeString('fr-FR')}
              </span>
            </div>
          </section>

          {data.suggestionsTransfert.length > 0 && (
            <section className="dash-priorites" aria-label="Suggestions de transfert">
              <h2>À traiter — transferts internes suggérés</h2>
              <div className="dash-priorites-grid">
                {data.suggestionsTransfert.slice(0, 4).map((s) => (
                  <article
                    key={`${s.produitId}-${s.entrepotDestId}`}
                    className={`dash-priorite dash-priorite-${s.destStatut === 'RUPTURE' ? 'critical' : 'warning'}`}
                  >
                    <div className="dash-priorite-icon">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h3>
                        {s.designation}{' '}
                        <InfoTooltip
                          insight={insightSuggestionTransfert(
                            s.designation,
                            s.quantiteSuggeree,
                            s.sourceCode,
                            s.destCode,
                            s.destStatut,
                          )}
                        />
                      </h3>
                      <p>{s.motif}</p>
                      {peutEcrire ? (
                        <button
                          type="button"
                          className="stock-link-btn"
                          onClick={() =>
                            ouvrirTransfert({
                              produitId: s.produitId,
                              sourceId: s.entrepotSourceId,
                              destId: s.entrepotDestId,
                              quantite: s.quantiteSuggeree,
                            })
                          }
                        >
                          Transférer {s.quantiteSuggeree} · {s.sourceCode} → {s.destCode}
                        </button>
                      ) : (
                        <span className="kpi-hint">
                          {s.sourceCode} → {s.destCode} · {s.quantiteSuggeree} unité(s)
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {(data.suggestionsReappro?.length ?? 0) > 0 && (
            <section className="dash-priorites" aria-label="Réapprovisionnements">
              <h2>Réception fournisseur — pas de surplus interne</h2>
              <div className="dash-priorites-grid">
                {data.suggestionsReappro.slice(0, 4).map((s) => (
                  <article
                    key={s.produitId}
                    className="dash-priorite dash-priorite-warning"
                  >
                    <div className="dash-priorite-icon">
                      <Truck size={16} />
                    </div>
                    <div>
                      <h3>
                        {s.designation}
                        {s.reference ? (
                          <small> · {s.reference}</small>
                        ) : null}
                      </h3>
                      <p>{s.motif}</p>
                      <Link to="/fournisseurs">
                        Réception · {s.deficit} unité(s)
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="kpi-grid dash-kpi-grid">
            <article
              className="kpi-card dash-kpi"
              role="button"
              tabIndex={0}
              onClick={() => {
                setFiltreEntrepot('');
                document.getElementById('stock-charts')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  document.getElementById('stock-charts')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }
              }}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Package size={16} />
                </span>
                <InfoTooltip
                  insight={
                    Number(data.kpis.valeurStock) === 0
                      ? insightValorisationVide(
                          data.kpis.unitesTotales,
                          data.kpis.skuDistincts,
                        )
                      : insightValeurInventaire(
                          data.kpis.valeurStock,
                          data.kpis.unitesTotales,
                          data.kpis.skuDistincts,
                        )
                  }
                />
              </div>
              <div className="kpi-label">Valeur au CMP</div>
              <div className="kpi-value">{formatFcfa(data.kpis.valeurStock)}</div>
              <div className="kpi-hint">
                {data.kpis.unitesTotales} unité(s) · {data.kpis.skuDistincts} SKU
              </div>
            </article>

            <article
              className={
                data.kpis.ruptures > 0
                  ? 'kpi-card dash-kpi kpi-danger'
                  : 'kpi-card dash-kpi'
              }
              role="button"
              tabIndex={0}
              onClick={() => toggleStatut('RUPTURE')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') toggleStatut('RUPTURE');
              }}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <PackageX size={16} />
                </span>
              </div>
              <div className="kpi-label">Ruptures</div>
              <div className="kpi-value">{data.kpis.ruptures}</div>
              <div className="kpi-hint">
                {filtreStatut === 'RUPTURE' ? 'Filtre actif — cliquer pour retirer' : 'Emplacements à 0'}
              </div>
            </article>

            <article
              className={
                data.kpis.sousSeuil > 0
                  ? 'kpi-card dash-kpi kpi-warning'
                  : 'kpi-card dash-kpi'
              }
              role="button"
              tabIndex={0}
              onClick={() => toggleStatut('SOUS_SEUIL')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') toggleStatut('SOUS_SEUIL');
              }}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <AlertTriangle size={16} />
                </span>
              </div>
              <div className="kpi-label">Sous le seuil</div>
              <div className="kpi-value">{data.kpis.sousSeuil}</div>
              <div className="kpi-hint">
                {filtreStatut === 'SOUS_SEUIL'
                  ? 'Filtre actif — cliquer pour retirer'
                  : 'Réappro à planifier'}
              </div>
            </article>

            <article
              className="kpi-card dash-kpi"
              role="button"
              tabIndex={0}
              onClick={() => {
                setCouvertureFaible((v) => !v);
                setFiltreStatut('TOUS');
                allerNiveaux();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setCouvertureFaible((v) => !v);
                  setFiltreStatut('TOUS');
                  allerNiveaux();
                }
              }}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Timer size={16} />
                </span>
                <InfoTooltip
                  insight={insightCouvertureJours(
                    data.kpis.couvertureJoursMediane,
                    data.fenetreVentesJours,
                  )}
                />
              </div>
              <div className="kpi-label">Couverture médiane</div>
              <div className="kpi-value">
                {data.kpis.couvertureJoursMediane === null
                  ? '—'
                  : `${data.kpis.couvertureJoursMediane} j`}
              </div>
              <div className="kpi-hint">
                {couvertureFaible
                  ? 'Filtre < 14 j actif'
                  : `Cadence ventes ${data.fenetreVentesJours} j`}
              </div>
            </article>

            <article
              className="kpi-card dash-kpi"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (data.parEntrepot.length === 1) {
                  navigate(`/stocks/entrepots/${data.parEntrepot[0].entrepotId}`);
                } else {
                  document.getElementById('stock-charts')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && data.parEntrepot[0]) {
                  navigate(`/stocks/entrepots/${data.parEntrepot[0].entrepotId}`);
                }
              }}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Warehouse size={16} />
                </span>
              </div>
              <div className="kpi-label">Entrepôts</div>
              <div className="kpi-value">{data.parEntrepot.length}</div>
              <div className="kpi-hint">Ouvrir la fiche entrepôt</div>
            </article>
          </div>

          <div className="dash-layout stock-charts" id="stock-charts">
            <section className="panel">
              <div className="dash-panel-head">
                <h2>{valeurNulle ? 'Unités par entrepôt' : 'Valeur par entrepôt'}</h2>
                <span className="dash-panel-meta">
                  {valeurNulle ? 'CMP à 0 — quantités' : 'CMP × quantité'}
                </span>
              </div>
              {valeurNulle && (
                <p className="lead">
                  Valorisation nulle : le CMP n’est pas encore initialisé (réception
                  fournisseur). Les unités restent visibles.
                  <InfoTooltip
                    insight={insightValorisationVide(
                      data.kpis.unitesTotales,
                      data.kpis.skuDistincts,
                    )}
                  />
                </p>
              )}
              {data.parEntrepot.length === 0 ? (
                <p className="lead">Aucun entrepôt dans le périmètre.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={data.parEntrepot.map((e) => ({
                      id: e.entrepotId,
                      name: e.code,
                      boutique: e.nomBoutique,
                      valeur: Number(e.valeur),
                      unites: e.unites,
                    }))}
                    margin={{ left: 8, right: 8, top: 8 }}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      width={56}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${Math.round(v / 1000)} k` : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle()}
                      formatter={(value, _name, item) => {
                        const payload = item?.payload as {
                          unites?: number;
                          valeur?: number;
                        };
                        return [
                          valeurNulle
                            ? `${Number(value ?? 0)} u.`
                            : formatFcfa(Number(value ?? 0)),
                          valeurNulle
                            ? 'Unités'
                            : `Valeur · ${payload?.unites ?? 0} u.`,
                        ];
                      }}
                      labelFormatter={(label, payload) =>
                        `${label} · ${payload?.[0]?.payload?.boutique ?? ''}`
                      }
                    />
                    <Bar
                      dataKey={valeurNulle ? 'unites' : 'valeur'}
                      fill="#0f766e"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(d) => {
                        const id = (d as { id?: string }).id;
                        if (id) navigate(`/stocks/entrepots/${id}`);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="panel">
              <div className="dash-panel-head">
                <h2>Répartition des emplacements</h2>
                <span className="dash-panel-meta">{totalEmplacements} emplacement(s)</span>
              </div>
              {statutChart.length === 0 ? (
                <p className="lead">Aucun emplacement de stock.</p>
              ) : (
                <div className="stock-donut">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={statutChart}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={48}
                        outerRadius={74}
                        paddingAngle={2}
                        onClick={(d) => {
                          const key = (d as { key?: StatutStockLigne }).key;
                          if (key) toggleStatut(key);
                        }}
                        cursor="pointer"
                      >
                        {statutChart.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={COULEURS_STATUT[entry.key]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle()}
                        formatter={(value, name) => [
                          `${Number(value ?? 0)} · ${
                            totalEmplacements
                              ? Math.round((Number(value ?? 0) / totalEmplacements) * 100)
                              : 0
                          } %`,
                          String(name),
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="stock-legend">
                    {statutChart.map((s) => (
                      <li key={s.key}>
                        <button
                          type="button"
                          className={
                            filtreStatut === s.key
                              ? 'stock-legend-btn actif'
                              : 'stock-legend-btn'
                          }
                          onClick={() => toggleStatut(s.key)}
                        >
                          <span
                            className="dash-seg-dot"
                            style={{ background: COULEURS_STATUT[s.key] }}
                          />
                          {s.label} · {s.value}
                          {totalEmplacements
                            ? ` (${Math.round((s.value / totalEmplacements) * 100)} %)`
                            : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="dash-panel-head">
                <h2>Entrepôts</h2>
                <span className="dash-panel-meta">Fiche détaillée</span>
              </div>
              {data.parEntrepot.length === 0 ? (
                <p className="lead">Aucun entrepôt dans le périmètre.</p>
              ) : (
                <ul className="dash-rank">
                  {[...data.parEntrepot]
                    .sort((a, b) => Number(b.valeur) - Number(a.valeur) || b.unites - a.unites)
                    .map((e, i) => {
                      const meta = entrepotOptions.find((x) => x.id === e.entrepotId);
                      return (
                        <li key={e.entrepotId}>
                          <button
                            type="button"
                            className="stock-entrepot-btn"
                            onClick={() => navigate(`/stocks/entrepots/${e.entrepotId}`)}
                          >
                            <div className="dash-rank-row">
                              <span className="dash-rank-pos">{i + 1}</span>
                              <span className="dash-rank-name">
                                {e.code}
                                <small>
                                  {' '}
                                  · {e.nomBoutique}
                                  {meta?.type === 'PRINCIPAL' ? ' · Principal' : ''}
                                </small>
                              </span>
                              <span className="money">{formatFcfa(e.valeur)}</span>
                              <ChevronRight size={16} />
                            </div>
                            <div className="kpi-hint" style={{ marginTop: 0 }}>
                              {e.unites} u. · {e.ruptures} rupture(s) · {e.sousSeuil}{' '}
                              sous seuil
                            </div>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <div className="toolbar stock-toolbar">
        <FiltreMagasinSiege id="stock-filtre-magasin" />
        <div className="stock-search">
          <label htmlFor="stock-q">Recherche</label>
          <div className="stock-search-field">
            <Search size={14} />
            <input
              id="stock-q"
              type="search"
              placeholder="Désignation ou référence"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="filtre-ent">Entrepôt</label>
          <select
            id="filtre-ent"
            value={filtreEntrepot}
            onChange={(e) => setFiltreEntrepot(e.target.value)}
          >
            <option value="">Tous</option>
            {entrepotOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.boutique?.nom ?? e.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtre-statut">Statut</label>
          <select
            id="filtre-statut"
            value={filtreStatut}
            onChange={(e) => {
              setFiltreStatut(e.target.value as FiltreStatut);
              setCouvertureFaible(false);
            }}
          >
            <option value="TOUS">Tous</option>
            <option value="RUPTURE">Ruptures</option>
            <option value="SOUS_SEUIL">Sous seuil</option>
            <option value="OK">OK</option>
          </select>
        </div>
        {categoriesStock.length > 0 && (
          <div>
            <label htmlFor="filtre-cat">Catégorie</label>
            <select
              id="filtre-cat"
              value={filtreCategorie}
              onChange={(e) => setFiltreCategorie(e.target.value)}
            >
              <option value="">Toutes</option>
              {categoriesStock.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="stock-toggle">
          <label htmlFor="voir-inactifs">
            <input
              id="voir-inactifs"
              type="checkbox"
              checked={voirInactifs}
              onChange={(e) => setVoirInactifs(e.target.checked)}
            />
            Inactifs
          </label>
        </div>
        <div>
          <span className="stock-vue-label">
            <SlidersHorizontal size={13} /> Vue
          </span>
          <div className="dash-presets" role="group" aria-label="Vue des niveaux">
            <button
              type="button"
              className={vue === 'liste' ? 'dash-preset actif' : 'dash-preset'}
              onClick={() => setVue('liste')}
            >
              Liste
            </button>
            <button
              type="button"
              className={vue === 'matrice' ? 'dash-preset actif' : 'dash-preset'}
              onClick={() => setVue('matrice')}
            >
              Matrice
            </button>
          </div>
        </div>
      </div>

      {data && (
        <div id="stock-niveaux">
        <ListPanel
          title="Niveaux de stock"
          toolbar={
            <span className="dash-panel-meta">
              {lignesFiltrees.length} référence(s) — cliquer une ligne pour ouvrir la fiche
            </span>
          }
        >
          {lignesFiltrees.length === 0 ? (
            <EmptyState
              title="Aucun stock"
              description="Aucune référence ne correspond à ces filtres."
            />
          ) : vue === 'liste' ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Statut</th>
                    <th>{libelleStockColonne}</th>
                    <th>Prévu</th>
                    <th>Seuil</th>
                    <th>Valeur</th>
                    <th>Ventes {data.fenetreVentesJours} j</th>
                    <th>Couverture</th>
                    {entrepotCols.map((e) => (
                      <th key={e.entrepotId} title={`${e.nom} — ${e.nomBoutique}`}>
                        {e.code}
                      </th>
                    ))}
                    {peutEcrire || peutAjusterLibre ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lignesFiltrees.map((ligne) => (
                    <tr
                      key={ligne.produitId}
                      className="produit-row"
                      tabIndex={0}
                      role="link"
                      aria-label={`Ouvrir ${ligne.designation}`}
                      onClick={() => navigate(`/produits/${ligne.produitId}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/produits/${ligne.produitId}`);
                        }
                      }}
                    >
                      <td>
                        <strong>{ligne.designation}</strong>
                        <div className="kpi-hint" style={{ margin: 0 }}>
                          {ligne.reference ?? 'Sans réf.'} · CMP{' '}
                          {formatFcfa(ligne.coutMoyenPondere)}
                        </div>
                        {!ligne.actif && (
                          <span className="badge badge-neutral">Inactif</span>
                        )}
                      </td>
                      <td>{ligne.categorie ?? '—'}</td>
                      <td>
                        <span
                          className={
                            ligne.statut === 'RUPTURE'
                              ? 'badge badge-critical'
                              : ligne.statut === 'SOUS_SEUIL'
                                ? 'badge badge-warning'
                                : 'badge badge-ok'
                          }
                        >
                          {STATUT_LABEL[ligne.statut]}
                        </span>
                      </td>
                      <td>
                        {ligne.stockReseau}
                        <InfoTooltip
                          insight={insightStockQuantite(
                            ligne.stockReseau,
                            ligne.seuilReappro,
                          )}
                        />
                      </td>
                      <td title="Physique − réservations POS + commandes confirmées">
                        {ligne.stockPrevu ?? ligne.stockReseau}
                      </td>
                      <td>{ligne.seuilReappro ?? '—'}</td>
                      <td className="money">{formatFcfa(ligne.valeur)}</td>
                      <td>{ligne.ventesUnites14j}</td>
                      <td>
                        {ligne.couvertureJours === null
                          ? '—'
                          : `${ligne.couvertureJours} j`}
                        <InfoTooltip
                          insight={insightCouvertureJours(
                            ligne.couvertureJours,
                            data.fenetreVentesJours,
                            ligne.ventesUnites14j,
                          )}
                        />
                      </td>
                      {entrepotCols.map((e) => {
                        const cell = qtyAt(ligne, e.entrepotId);
                        if (!cell) {
                          return (
                            <td key={e.entrepotId} className="stock-cell-empty">
                              —
                            </td>
                          );
                        }
                        return (
                          <td
                            key={e.entrepotId}
                            className={
                              cell.statut === 'RUPTURE'
                                ? 'stock-cell-rupture'
                                : cell.statut === 'SOUS_SEUIL'
                                  ? 'stock-cell-seuil'
                                  : undefined
                            }
                          >
                            {cell.quantite}
                          </td>
                        );
                      })}
                      {peutEcrire || peutAjusterLibre ? (
                        <td
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <div className="table-actions">
                            {peutAjusterLibre ? (
                              <button
                                type="button"
                                onClick={() =>
                                  ouvrirAjuster(
                                    ligne.produitId,
                                    entrepotCols[0]?.entrepotId,
                                  )
                                }
                              >
                                Ajuster
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                ouvrirTransfert({
                                  produitId: ligne.produitId,
                                  sourceId: entrepotCols[0]?.entrepotId ?? '',
                                  destId: entrepotCols[1]?.entrepotId ?? entrepotCols[0]?.entrepotId ?? '',
                                  quantite: 1,
                                })
                              }
                            >
                              Transférer
                            </button>
                            {(ligne.statut === 'RUPTURE' ||
                              ligne.statut === 'SOUS_SEUIL') &&
                            !(data.suggestionsTransfert ?? []).some(
                              (s) => s.produitId === ligne.produitId,
                            ) ? (
                              <Link to="/fournisseurs" className="stock-row-link">
                                Réception
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    {entrepotCols.map((e) => (
                      <th key={e.entrepotId}>
                        {e.code}
                        <div className="kpi-hint" style={{ margin: 0 }}>
                          {e.nomBoutique}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignesFiltrees.map((ligne) => (
                    <tr key={ligne.produitId}>
                      <td>
                        <Link className="link-button" to={`/produits/${ligne.produitId}`}>
                          <strong>{ligne.designation}</strong>
                        </Link>
                        {ligne.reference ? (
                          <div className="kpi-hint" style={{ margin: 0 }}>
                            {ligne.reference}
                          </div>
                        ) : null}
                        {!ligne.actif && (
                          <span className="badge badge-neutral">Inactif</span>
                        )}
                      </td>
                      {entrepotCols.map((e) => {
                        const cell = qtyAt(ligne, e.entrepotId);
                        if (!cell) {
                          return (
                            <td key={e.entrepotId} className="stock-cell-empty">
                              —
                            </td>
                          );
                        }
                        return (
                          <td
                            key={e.entrepotId}
                            className={
                              cell.statut === 'RUPTURE'
                                ? 'stock-cell-rupture'
                                : cell.statut === 'SOUS_SEUIL'
                                  ? 'stock-cell-seuil'
                                  : undefined
                            }
                          >
                            <button
                              type="button"
                              className="stock-cell-btn"
                              disabled={!peutAjusterLibre}
                              onClick={() =>
                                ouvrirAjuster(ligne.produitId, e.entrepotId)
                              }
                            >
                              {cell.quantite}
                            </button>
                            <InfoTooltip
                              insight={insightStockQuantite(
                                cell.quantite,
                                ligne.seuilReappro,
                              )}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ListPanel>
        </div>
      )}

      <ListPanel
        title="Journal des mouvements — cliquer une ligne pour le détail"
        toolbar={
          <div>
            <label htmlFor="filtre-mvt" className="sr-only">
              Type de mouvement
            </label>
            <select
              id="filtre-mvt"
              value={filtreTypeMvt}
              onChange={(e) => setFiltreTypeMvt(e.target.value)}
            >
              <option value="">Tous les types</option>
              {(Object.keys(TYPE_MOUVEMENT) as Array<MouvementStockDto['type']>).map(
                (t) => (
                  <option key={t} value={t}>
                    {TYPE_MOUVEMENT[t]}
                  </option>
                ),
              )}
            </select>
          </div>
        }
      >
        {mouvements.isLoading && <LoadingState label="Chargement des mouvements..." />}
        {mouvements.isError && (
          <p role="alert">Erreur de chargement des mouvements.</p>
        )}
        {mouvements.data && mouvementsFiltres.length === 0 && (
          <EmptyState
            title="Aucun mouvement"
            description="Aucun mouvement de stock pour ce filtre."
          />
        )}
        {mouvementsFiltres.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Produit</th>
                  <th>Entrepôt</th>
                  <th>Δ</th>
                  <th>Après</th>
                  <th>Par</th>
                  <th>Réf.</th>
                </tr>
              </thead>
              <tbody>
                {mouvementsFiltres.map((m) => (
                  <tr
                    key={m.id}
                    className="produit-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`Mouvement ${TYPE_MOUVEMENT[m.type]}`}
                    onClick={() => navigate(`/stocks/mouvements/${m.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/stocks/mouvements/${m.id}`);
                      }
                    }}
                  >
                    <td>{new Date(m.dateHeure).toLocaleString('fr-FR')}</td>
                    <td>
                      <span
                        className={
                          m.type === 'VENTE' || m.type === 'TRANSFERT_OUT'
                            ? 'badge badge-neutral'
                            : m.type === 'AJUSTEMENT'
                              ? 'badge badge-warning'
                              : 'badge badge-ok'
                        }
                      >
                        {TYPE_MOUVEMENT[m.type]}
                      </span>
                    </td>
                    <td>
                      {m.produit?.designation ??
                        produits.data?.find((p) => p.id === m.produitId)
                          ?.designation ??
                        m.produitId.slice(0, 8)}
                    </td>
                    <td>
                      {m.entrepot?.code ??
                        entrepotOptions.find((e) => e.id === m.entrepotId)?.code ??
                        '—'}
                    </td>
                    <td className={m.quantite < 0 ? 'stock-delta-neg' : 'stock-delta-pos'}>
                      {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                    </td>
                    <td>{m.stockApres}</td>
                    <td>
                      {m.utilisateur
                        ? `${m.utilisateur.prenom} ${m.utilisateur.nom}`
                        : '—'}
                    </td>
                    <td>{m.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPanel>

      {peutAjusterLibre && (
        <>
          <Modal
            open={modalAjuster}
            onClose={() => setModalAjuster(false)}
            title="Ajustement d’urgence (SI / Direction)"
          >
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                ajuster.mutate();
              }}
            >
              <label htmlFor="ajp">Produit</label>
              <select
                id="ajp"
                value={ajProduit}
                onChange={(e) => setAjProduit(e.target.value)}
                required
              >
                {produitsSelect.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.designation}
                  </option>
                ))}
              </select>
              <label htmlFor="aje">Entrepôt</label>
              <select
                id="aje"
                value={ajEntrepot}
                onChange={(e) => setAjEntrepot(e.target.value)}
                required
              >
                {entrepotsSelect.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
              {qtyActuelleAjustement !== null && (
                <p className="lead">
                  Quantité théorique actuelle : <strong>{qtyActuelleAjustement}</strong>
                  {ajQty !== '' && Number.isFinite(Number(ajQty))
                    ? ` → écart ${Number(ajQty) - qtyActuelleAjustement}`
                    : ''}
                </p>
              )}
              <label htmlFor="ajq">Quantité comptée</label>
              <input
                id="ajq"
                type="number"
                min="0"
                value={ajQty}
                onChange={(e) => setAjQty(e.target.value)}
                required
              />
              <label htmlFor="ajr">Motif / référence (optionnel)</label>
              <input
                id="ajr"
                type="text"
                value={ajRef}
                onChange={(e) => setAjRef(e.target.value)}
                placeholder="Ex. inventaire 20/08"
              />
              <button type="submit" className="btn-primary" disabled={ajuster.isPending}>
                {ajuster.isPending ? 'Ajustement…' : 'Enregistrer l’ajustement'}
              </button>
              {ajErr && <p role="alert">{ajErr}</p>}
            </form>
          </Modal>
        </>
      )}

      {peutEcrire && (
        <Modal
            open={modalTransferer}
            onClose={() => setModalTransferer(false)}
            title="Transférer entre entrepôts"
            description="Écriture immédiate TRANSFERT_OUT + TRANSFERT_IN. Pour un circuit journalisé (brouillon → prêt → fait), utiliser Opérations."
            size="lg"
          >
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const qty = Number(trQty);
                if (qtySourceTransfert !== null && qty > qtySourceTransfert) {
                  setTrErr(
                    `Stock insuffisant à la source (disponible : ${qtySourceTransfert}).`,
                  );
                  return;
                }
                transferer.mutate();
              }}
            >
              <label htmlFor="tr-rech">Rechercher un article</label>
              <input
                id="tr-rech"
                type="search"
                placeholder="Désignation ou SKU…"
                value={trRecherche}
                onChange={(e) => setTrRecherche(e.target.value)}
              />
              <label htmlFor="trp">Produit</label>
              <select
                id="trp"
                value={trProduit}
                onChange={(e) => setTrProduit(e.target.value)}
                required
              >
                {produitsSelect
                  .filter((p) => {
                    const q = trRecherche.trim().toLowerCase();
                    if (!q) return true;
                    return p.designation.toLowerCase().includes(q);
                  })
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.designation}
                    </option>
                  ))}
              </select>
              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="trs">Source</label>
                  <select
                    id="trs"
                    value={trSource}
                    onChange={(e) => setTrSource(e.target.value)}
                    required
                  >
                    {entrepotsSelect.map((e) => {
                      const ligne = synthese.data?.lignes.find((l) => l.produitId === trProduit);
                      const q = ligne ? qtyAt(ligne, e.id)?.quantite ?? 0 : null;
                      return (
                        <option key={e.id} value={e.id}>
                          {e.label}
                          {q !== null ? ` · ${q} u.` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {qtySourceTransfert !== null && (
                    <p className="lead">
                      Disponible : <strong>{qtySourceTransfert}</strong>
                    </p>
                  )}
                </div>
                <div className="form-field">
                  <label htmlFor="trd">Destination</label>
                  <select
                    id="trd"
                    value={trDest}
                    onChange={(e) => setTrDest(e.target.value)}
                    required
                  >
                    {entrepotsSelect.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                  {qtyDestTransfert !== null && (
                    <p className="lead">
                      Actuel : <strong>{qtyDestTransfert}</strong>
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const s = trSource;
                  setTrSource(trDest);
                  setTrDest(s);
                }}
              >
                <ArrowLeftRight size={14} /> Inverser source / destination
              </button>
              <label htmlFor="trq">Quantité</label>
              <input
                id="trq"
                type="number"
                min="1"
                max={qtySourceTransfert ?? undefined}
                value={trQty}
                onChange={(e) => setTrQty(e.target.value)}
                required
              />
              <div className="table-actions">
                {qtySourceTransfert !== null && qtySourceTransfert > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setTrQty(String(Math.max(1, Math.floor(qtySourceTransfert / 2))))}
                    >
                      Moitié ({Math.floor(qtySourceTransfert / 2)})
                    </button>
                    <button type="button" onClick={() => setTrQty(String(qtySourceTransfert))}>
                      Tout ({qtySourceTransfert})
                    </button>
                  </>
                )}
              </div>
              {trQty !== '' &&
                qtySourceTransfert !== null &&
                qtyDestTransfert !== null &&
                Number(trQty) > 0 && (
                  <p className="lead">
                    Après transfert : source {qtySourceTransfert} →{' '}
                    <strong>{qtySourceTransfert - Number(trQty)}</strong> · dest {qtyDestTransfert}{' '}
                    → <strong>{qtyDestTransfert + Number(trQty)}</strong>
                  </p>
                )}
              {Number(trQty) > 0 &&
                qtySourceTransfert !== null &&
                Number(trQty) > qtySourceTransfert && (
                  <p role="alert">Quantité supérieure au disponible.</p>
                )}
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  transferer.isPending ||
                  trSource === trDest ||
                  (qtySourceTransfert !== null && Number(trQty) > qtySourceTransfert)
                }
              >
                {transferer.isPending ? 'Transfert…' : 'Confirmer le transfert'}
              </button>
              {trSource === trDest && trSource !== '' && (
                <p role="alert">Source et destination identiques.</p>
              )}
              {trErr && <p role="alert">{trErr}</p>}
            </form>
          </Modal>
      )}
    </div>
  );
}
