import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock,
  FilePlus2,
  FileText,
  Search,
} from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  badgeFacture,
  fmtDate,
  fmtFcfa,
  STATUT_FACTURE,
} from '../lib/achats-ui';
import {
  insightAFacturer,
  insightEncoursFournisseur,
  insightFacturesEnRetard,
  insightFacturesPayees,
} from '../lib/insights/fournisseurs';
import type { Insight } from '../lib/insights/types';
import type { FactureFournisseurDto, FournisseurDto, ReceptionAFacturerDto } from '../lib/types';

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

const ROLES_FACTURE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

type FiltreKpi = 'all' | 'a_payer' | 'retard' | 'payees' | 'brouillon';

function debutJour(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function estEnRetard(f: FactureFournisseurDto, aujourdhui: Date): boolean {
  if (!f.dateEcheance) return false;
  if (f.statut === 'PAYEE' || f.statut === 'ANNULEE' || f.statut === 'BROUILLON') {
    return false;
  }
  return new Date(f.dateEcheance) < aujourdhui && Number(f.resteAPayer) > 0;
}

function pctPaye(f: FactureFournisseurDto): number {
  const total = Number(f.montant);
  if (total <= 0) return f.statut === 'PAYEE' ? 100 : 0;
  return Math.min(100, Math.round((Number(f.montantPaye) / total) * 100));
}

export function FacturesFournisseurPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutFacturer = user !== null && ROLES_FACTURE.includes(user.role);

  const fournisseurQuery = searchParams.get('fournisseurId') ?? '';
  const ouvrirQuery = searchParams.get('ouvrir') === '1';
  const filtreKpi = (searchParams.get('vue') as FiltreKpi | null) ?? 'all';
  const ouvertDepuisUrl = useRef(false);

  const [filtreStatut, setFiltreStatut] = useState<FactureFournisseurDto['statut'] | ''>(
    '',
  );
  const [recherche, setRecherche] = useState('');
  const [modalNouveau, setModalNouveau] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [reference, setReference] = useState('');
  const [echeance, setEcheance] = useState('');
  const [selectionReceptions, setSelectionReceptions] = useState<string[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const factures = useQuery({
    queryKey: ['achats-factures'],
    queryFn: () => apiFetch<FactureFournisseurDto[]>('/achats/factures'),
    enabled: peutLire,
  });
  const aFacturer = useQuery({
    queryKey: ['achats-a-facturer', modalNouveau ? fournisseurId : 'all'],
    queryFn: () =>
      apiFetch<ReceptionAFacturerDto[]>(
        `/achats/factures/a-facturer${
          modalNouveau && fournisseurId ? `?fournisseurId=${fournisseurId}` : ''
        }`,
      ),
    enabled: peutLire && (peutFacturer || true) && (modalNouveau || peutFacturer || peutLire),
  });
  // Always load a-facturer count for KPI when user can see factures and is SI/DG/DAF
  const aFacturerReseau = useQuery({
    queryKey: ['achats-a-facturer', 'reseau'],
    queryFn: () => apiFetch<ReceptionAFacturerDto[]>('/achats/factures/a-facturer'),
    enabled: peutFacturer,
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: () => apiFetch<FournisseurDto[]>('/fournisseurs'),
    enabled: peutFacturer,
  });

  const aujourdhui = useMemo(() => debutJour(), []);

  const kpis = useMemo(() => {
    const rows = (factures.data ?? []).filter(
      (f) => !fournisseurQuery || f.fournisseurId === fournisseurQuery,
    );
    let encours = 0;
    let retardMontant = 0;
    let retardCount = 0;
    let payees = 0;
    let brouillons = 0;
    for (const f of rows) {
      if (f.statut === 'BROUILLON') brouillons += 1;
      if (f.statut === 'PAYEE') payees += 1;
      const reste = Number(f.resteAPayer);
      if (
        reste > 0 &&
        (f.statut === 'COMPTABILISEE' || f.statut === 'PARTIELLEMENT_PAYEE')
      ) {
        encours += reste;
      }
      if (estEnRetard(f, aujourdhui)) {
        retardCount += 1;
        retardMontant += reste;
      }
    }
    const receptionsAf = aFacturerReseau.data ?? [];
    const montantAf = receptionsAf.reduce((s, r) => s + Number(r.montant), 0);
    return {
      aFacturerCount: receptionsAf.length,
      aFacturerMontant: montantAf,
      encours,
      retardCount,
      retardMontant,
      payees,
      brouillons,
      total: rows.length,
    };
  }, [factures.data, fournisseurQuery, aFacturerReseau.data, aujourdhui]);

  const parFournisseur = useMemo(() => {
    const map = new Map<string, ReceptionAFacturerDto[]>();
    for (const r of aFacturer.data ?? []) {
      const liste = map.get(r.fournisseurId) ?? [];
      liste.push(r);
      map.set(r.fournisseurId, liste);
    }
    return map;
  }, [aFacturer.data]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (factures.data ?? [])
      .filter((f) => {
        if (fournisseurQuery && f.fournisseurId !== fournisseurQuery) return false;
        if (filtreStatut && f.statut !== filtreStatut) return false;
        if (filtreKpi === 'a_payer') {
          return (
            Number(f.resteAPayer) > 0 &&
            (f.statut === 'COMPTABILISEE' || f.statut === 'PARTIELLEMENT_PAYEE')
          );
        }
        if (filtreKpi === 'retard') return estEnRetard(f, aujourdhui);
        if (filtreKpi === 'payees') return f.statut === 'PAYEE';
        if (filtreKpi === 'brouillon') return f.statut === 'BROUILLON';
        return true;
      })
      .filter((f) => {
        if (!q) return true;
        return (
          f.numero.toLowerCase().includes(q) ||
          f.fournisseur.nom.toLowerCase().includes(q) ||
          (f.referenceFournisseur?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        // Retards first, then by date desc
        const ra = estEnRetard(a, aujourdhui) ? 0 : 1;
        const rb = estEnRetard(b, aujourdhui) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return new Date(b.dateFacture).getTime() - new Date(a.dateFacture).getTime();
      });
  }, [
    factures.data,
    filtreStatut,
    fournisseurQuery,
    filtreKpi,
    recherche,
    aujourdhui,
  ]);

  useEffect(() => {
    if (fournisseurQuery) setFournisseurId(fournisseurQuery);
  }, [fournisseurQuery]);

  useEffect(() => {
    if (!ouvrirQuery || !peutFacturer || ouvertDepuisUrl.current) return;
    if (!fournisseurs.isSuccess) return;
    setFournisseurId(fournisseurQuery || fournisseurs.data?.[0]?.id || '');
    setSelectionReceptions([]);
    setReference('');
    setEcheance('');
    setFormErr(null);
    setModalNouveau(true);
    ouvertDepuisUrl.current = true;
  }, [ouvrirQuery, peutFacturer, fournisseurQuery, fournisseurs.isSuccess, fournisseurs.data]);

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<FactureFournisseurDto>('/achats/factures', {
        method: 'POST',
        body: JSON.stringify({
          fournisseurId,
          referenceFournisseur: reference.trim() || undefined,
          dateEcheance: echeance || undefined,
          receptionIds: selectionReceptions,
        }),
      }),
    onSuccess: (f) => {
      setModalNouveau(false);
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['achats-factures'] });
      void queryClient.invalidateQueries({ queryKey: ['achats-a-facturer'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
      navigate(`/achats/factures/${f.id}`);
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Facture refusée.')),
  });

  function setVue(vue: FiltreKpi) {
    const next = new URLSearchParams(searchParams);
    if (vue === 'all') next.delete('vue');
    else next.set('vue', vue);
    setSearchParams(next, { replace: true });
  }

  function ouvrirFacture(id: string) {
    navigate(`/achats/factures/${id}`);
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ouvrirFacture(id);
    }
  }

  if (!peutLire) return <p>Vous n’avez pas accès aux factures fournisseur.</p>;

  const receptionsFourn = fournisseurId
    ? parFournisseur.get(fournisseurId) ?? []
    : aFacturer.data ?? [];

  const montantSelection = receptionsFourn
    .filter((r) => selectionReceptions.includes(r.id))
    .reduce((s, r) => s + Number(r.montant), 0);

  const insightAf: Insight = insightAFacturer(
    kpis.aFacturerCount,
    kpis.aFacturerMontant,
  );
  const insightEncours: Insight = insightEncoursFournisseur(kpis.encours);
  const insightRetard: Insight = insightFacturesEnRetard(
    kpis.retardCount,
    kpis.retardMontant,
  );
  const insightPayees: Insight = insightFacturesPayees(kpis.payees, kpis.total);

  return (
    <div className="factures-module">
      <PageHeader
        title="Factures fournisseur"
        subtitle="Pôle Achats — une réception ne se facture qu’une fois. Le paiement est un grand livre Achats (DAF / Caissier Central), distinct des caisses boutique."
        actions={
          <div className="page-header-actions-row">
            <Link className="btn btn-secondary" to="/achats/commandes">
              Commandes
            </Link>
            <Link className="btn btn-secondary" to="/fournisseurs">
              Fournisseurs
            </Link>
            {peutFacturer ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setFournisseurId(fournisseurQuery || fournisseurs.data?.[0]?.id || '');
                  setSelectionReceptions([]);
                  setReference('');
                  setEcheance('');
                  setFormErr(null);
                  setModalNouveau(true);
                }}
              >
                <FilePlus2 size={14} /> Nouvelle facture
              </button>
            ) : null}
          </div>
        }
      />

      {factures.isLoading && <LoadingState label="Chargement des factures..." />}
      {factures.isError && <p role="alert">Erreur de chargement des factures.</p>}

      {factures.data && (
        <>
          <section className="kpi-grid dash-kpi-grid" aria-label="Pilotage factures">
            {peutFacturer && (
              <button
                type="button"
                className={`kpi-card dash-kpi${kpis.aFacturerCount > 0 ? ' kpi-warning' : ''}`}
                onClick={() => {
                  setFournisseurId(fournisseurQuery || fournisseurs.data?.[0]?.id || '');
                  setSelectionReceptions([]);
                  setReference('');
                  setEcheance('');
                  setFormErr(null);
                  setModalNouveau(true);
                }}
              >
                <div className="dash-kpi-top">
                  <span className="dash-kpi-icon">
                    <FileText size={16} />
                  </span>
                  <InfoTooltip insight={insightAf} />
                </div>
                <div className="kpi-label">À facturer</div>
                <div className="kpi-value">{kpis.aFacturerCount}</div>
                <div className="kpi-hint">
                  {fmtFcfa(kpis.aFacturerMontant)} · réceptions ouvertes
                </div>
              </button>
            )}

            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'a_payer' ? ' kpi-actif' : ''}${kpis.encours > 0 ? ' kpi-warning' : ''}`}
              onClick={() => setVue(filtreKpi === 'a_payer' ? 'all' : 'a_payer')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Banknote size={16} />
                </span>
                <InfoTooltip insight={insightEncours} />
              </div>
              <div className="kpi-label">À payer</div>
              <div className="kpi-value">{fmtFcfa(kpis.encours)}</div>
              <div className="kpi-hint">Reste dû comptabilisé</div>
            </button>

            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'retard' ? ' kpi-actif' : ''}${kpis.retardCount > 0 ? ' kpi-danger' : ''}`}
              onClick={() => setVue(filtreKpi === 'retard' ? 'all' : 'retard')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <AlertTriangle size={16} />
                </span>
                <InfoTooltip insight={insightRetard} />
              </div>
              <div className="kpi-label">En retard</div>
              <div className="kpi-value">{kpis.retardCount}</div>
              <div className="kpi-hint">{fmtFcfa(kpis.retardMontant)} échues</div>
            </button>

            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'payees' ? ' kpi-actif' : ''}`}
              onClick={() => setVue(filtreKpi === 'payees' ? 'all' : 'payees')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <CheckCircle2 size={16} />
                </span>
                <InfoTooltip insight={insightPayees} />
              </div>
              <div className="kpi-label">Payées</div>
              <div className="kpi-value">{kpis.payees}</div>
              <div className="kpi-hint">
                {kpis.brouillons > 0 ? `${kpis.brouillons} brouillon(s)` : `${kpis.total} au total`}
              </div>
            </button>
          </section>

          <div className="toolbar factures-toolbar">
            <div className="factures-search">
              <Search size={14} />
              <input
                type="search"
                placeholder="N°, fournisseur, référence…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                aria-label="Rechercher une facture"
              />
            </div>
            <div>
              <label htmlFor="filtre-fa-statut">Statut</label>
              <select
                id="filtre-fa-statut"
                value={filtreStatut}
                onChange={(e) =>
                  setFiltreStatut(e.target.value as FactureFournisseurDto['statut'] | '')
                }
              >
                <option value="">Tous</option>
                {(Object.keys(STATUT_FACTURE) as FactureFournisseurDto['statut'][]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {STATUT_FACTURE[s]}
                    </option>
                  ),
                )}
              </select>
            </div>
            {filtreKpi !== 'all' && (
              <button type="button" className="btn btn-ghost" onClick={() => setVue('all')}>
                Effacer le filtre vue
              </button>
            )}
            <p className="lead factures-count">
              {liste.length} facture(s)
              {filtreKpi !== 'all' ? ` · filtre ${filtreKpi.replace('_', ' ')}` : ''}
              {filtreStatut ? ` · ${STATUT_FACTURE[filtreStatut]}` : ''}
            </p>
          </div>

          <ListPanel
            title="Factures"
            toolbar={
              <InfoTooltip
                insight={{
                  title: 'Circuit Achats',
                  interpretation:
                    'Brouillon → Comptabilisée → Paiement(s) DAF/Central. Le paiement n’écrit pas sur une caisse boutique (§ séparation des tâches).',
                  recommendation:
                    'Prioriser les lignes en retard (échéance dépassée) puis les soldes partiels.',
                  severity: 'info',
                }}
              />
            }
          >
            {factures.data.length === 0 ? (
              <EmptyState
                title="Aucune facture"
                description="Facturez des réceptions de stock déjà enregistrées."
                action={
                  peutFacturer ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setModalNouveau(true)}
                    >
                      Nouvelle facture
                    </button>
                  ) : undefined
                }
              />
            ) : liste.length === 0 ? (
              <EmptyState
                title="Aucun résultat"
                description="Aucune facture ne correspond à ces filtres."
              />
            ) : (
              <div className="clients-table-wrap">
                <table className="factures-table">
                  <thead>
                    <tr>
                      <th>Facture</th>
                      <th>Fournisseur</th>
                      <th>Statut</th>
                      <th>Échéance</th>
                      <th className="num">Montant</th>
                      <th className="num">Reste</th>
                      <th>Paiement</th>
                      <th aria-label="Ouvrir" />
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((row) => {
                      const retard = estEnRetard(row, aujourdhui);
                      const paye = pctPaye(row);
                      return (
                        <tr
                          key={row.id}
                          className={`produit-row${retard ? ' facture-row-retard' : ''}`}
                          tabIndex={0}
                          role="link"
                          aria-label={`Ouvrir ${row.numero}`}
                          onClick={() => ouvrirFacture(row.id)}
                          onKeyDown={(e) => onRowKey(e, row.id)}
                        >
                          <td>
                            <strong>{row.numero}</strong>
                            <div className="kpi-hint" style={{ margin: 0 }}>
                              {fmtDate(row.dateFacture)}
                              {row.referenceFournisseur
                                ? ` · n° ${row.referenceFournisseur}`
                                : ''}
                            </div>
                          </td>
                          <td>{row.fournisseur.nom}</td>
                          <td>
                            <span className={badgeFacture(row.statut)}>
                              {STATUT_FACTURE[row.statut]}
                            </span>
                          </td>
                          <td>
                            {row.dateEcheance ? (
                              <span className={retard ? 'facture-echeance-retard' : ''}>
                                {retard ? <Clock size={12} /> : null}{' '}
                                {fmtDate(row.dateEcheance)}
                                {retard ? ' · échue' : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="num money">{fmtFcfa(row.montant)}</td>
                          <td className="num money">
                            {Number(row.resteAPayer) > 0 ? (
                              <strong>{fmtFcfa(row.resteAPayer)}</strong>
                            ) : (
                              fmtFcfa(0)
                            )}
                          </td>
                          <td>
                            <div
                              className="facture-progress"
                              title={`${paye} % payé`}
                              aria-label={`${paye} pour cent payé`}
                            >
                              <div
                                className="facture-progress-bar"
                                style={{ width: `${paye}%` }}
                              />
                            </div>
                            <span className="kpi-hint">{paye} %</span>
                          </td>
                          <td className="produit-row-chevron">
                            <ChevronRight size={16} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ListPanel>
        </>
      )}

      {peutFacturer && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouvelle facture"
          size="lg"
        >
          <form
            className="facture-create-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              creer.mutate();
            }}
          >
            <p className="lead">
              Sélectionnez des réceptions non encore facturées. Le brouillon pourra être
              comptabilisé puis payé par le DAF / Caissier Central.
            </p>
            <div className="facture-create-grid">
              <div>
                <label htmlFor="ff-fourn">Fournisseur</label>
                <select
                  id="ff-fourn"
                  value={fournisseurId}
                  onChange={(e) => {
                    setFournisseurId(e.target.value);
                    setSelectionReceptions([]);
                  }}
                >
                  {(fournisseurs.data ?? []).map((fourn) => (
                    <option key={fourn.id} value={fourn.id}>
                      {fourn.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ff-ref">N° facture fournisseur</label>
                <input
                  id="ff-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Référence BL / facture"
                />
              </div>
              <div>
                <label htmlFor="ff-ech">Échéance (optionnel)</label>
                <input
                  id="ff-ech"
                  type="date"
                  value={echeance}
                  onChange={(e) => setEcheance(e.target.value)}
                />
              </div>
            </div>

            <div className="facture-create-head">
              <h3>Réceptions à facturer</h3>
              <span className="lead">
                {selectionReceptions.length} sélectionnée(s) · {fmtFcfa(montantSelection)}
              </span>
            </div>

            {aFacturer.isLoading ? (
              <LoadingState label="Chargement des réceptions…" />
            ) : receptionsFourn.length === 0 ? (
              <EmptyState
                title="Aucune réception à facturer"
                description="Enregistrez d’abord une réception stock pour ce fournisseur."
              />
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Tout sélectionner"
                          checked={
                            receptionsFourn.length > 0 &&
                            selectionReceptions.length === receptionsFourn.length
                          }
                          onChange={(e) => {
                            setSelectionReceptions(
                              e.target.checked ? receptionsFourn.map((r) => r.id) : [],
                            );
                          }}
                        />
                      </th>
                      <th>Date</th>
                      <th>Article</th>
                      <th className="num">Qté</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receptionsFourn.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectionReceptions.includes(r.id)}
                            onChange={(e) => {
                              setSelectionReceptions((prev) =>
                                e.target.checked
                                  ? [...prev, r.id]
                                  : prev.filter((id) => id !== r.id),
                              );
                            }}
                          />
                        </td>
                        <td>{fmtDate(r.dateReception)}</td>
                        <td>
                          {r.produit.designation}
                          {r.produit.reference ? (
                            <div className="kpi-hint" style={{ margin: 0 }}>
                              {r.produit.reference}
                            </div>
                          ) : null}
                        </td>
                        <td className="num">{r.quantite}</td>
                        <td className="num money">{fmtFcfa(r.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="table-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setModalNouveau(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={creer.isPending || selectionReceptions.length === 0}
              >
                Créer le brouillon · {fmtFcfa(montantSelection)}
              </button>
            </div>
            {formErr && <p role="alert">{formErr}</p>}
          </form>
        </Modal>
      )}
    </div>
  );
}
