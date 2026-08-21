import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Package, ShoppingBag } from 'lucide-react';
import { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { BonCommandeComposer, type LigneBonCommande } from '../components/BonCommandeComposer';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import { badgeCommande, fmtFcfa, STATUT_COMMANDE } from '../lib/achats-ui';
import {
  insightCommandesBrouillon,
  insightCommandesOuvertes,
  insightCommandesPartielles,
  insightCommandesReceptionnees,
} from '../lib/insights/fournisseurs';
import type {
  CommandeAchatDto,
  FournisseurDetailDto,
  FournisseurDto,
  ProduitDto,
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

const ROLES_COMMANDE: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.RESPONSABLE_BOUTIQUE,
];

type FiltreKpi = 'all' | 'brouillon' | 'ouvertes' | 'partielles' | 'receptionnees';

export function CommandesAchatsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const magasin = useFiltreMagasinSiege();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const peutLire = user !== null && ROLES_LECTURE.includes(user.role);
  const peutCommander = user !== null && ROLES_COMMANDE.includes(user.role);

  const fournisseurQuery = searchParams.get('fournisseurId') ?? '';
  const ouvrirQuery = searchParams.get('ouvrir') === '1';
  const filtreKpi = (searchParams.get('vue') as FiltreKpi | null) ?? 'all';
  const ouvertDepuisUrl = useRef(false);

  const [filtreStatut, setFiltreStatut] = useState<CommandeAchatDto['statut'] | ''>('');
  const [modalNouveau, setModalNouveau] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<LigneBonCommande[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const commandes = useQuery({
    queryKey: ['achats-commandes'],
    queryFn: () => apiFetch<CommandeAchatDto[]>('/achats/commandes'),
    enabled: peutLire,
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: () => apiFetch<FournisseurDto[]>('/fournisseurs'),
    enabled: peutCommander,
  });
  const produits = useQuery({
    queryKey: ['produits'],
    queryFn: () => apiFetch<ProduitDto[]>('/produits'),
    enabled: peutCommander,
  });
  const ficheFournisseur = useQuery({
    queryKey: ['fournisseurs', fournisseurId],
    queryFn: () => apiFetch<FournisseurDetailDto>(`/fournisseurs/${fournisseurId}`),
    enabled: peutCommander && modalNouveau && Boolean(fournisseurId),
  });

  const actifs = useMemo(
    () => (produits.data ?? []).filter((p) => p.actif),
    [produits.data],
  );
  const fournActifs = useMemo(
    () => (fournisseurs.data ?? []).filter((f) => f.actif),
    [fournisseurs.data],
  );
  const kpis = useMemo(() => {
    const rows = (commandes.data ?? []).filter(
      (c) =>
        (!fournisseurQuery || c.fournisseurId === fournisseurQuery) &&
        (!magasin.boutiqueId || c.boutiqueId === magasin.boutiqueId),
    );
    let brouillons = 0;
    let ouvertes = 0;
    let unitesOuvertes = 0;
    let partielles = 0;
    let receptionnees = 0;
    for (const c of rows) {
      const reste = Math.max(0, c.quantite - c.quantiteRecue);
      if (c.statut === 'BROUILLON') brouillons += 1;
      if (c.statut === 'CONFIRMEE') {
        ouvertes += 1;
        unitesOuvertes += reste;
      }
      if (c.statut === 'PARTIELLEMENT_RECEPTIONNEE') partielles += 1;
      if (c.statut === 'RECEPTIONNEE') receptionnees += 1;
    }
    return {
      brouillons,
      ouvertes,
      unitesOuvertes,
      partielles,
      receptionnees,
    };
  }, [commandes.data, fournisseurQuery, magasin.boutiqueId]);

  const liste = useMemo(
    () =>
      (commandes.data ?? []).filter((c) => {
        if (magasin.boutiqueId && c.boutiqueId !== magasin.boutiqueId) return false;
        if (fournisseurQuery && c.fournisseurId !== fournisseurQuery) return false;
        if (filtreStatut && c.statut !== filtreStatut) return false;
        if (filtreKpi === 'brouillon') return c.statut === 'BROUILLON';
        if (filtreKpi === 'ouvertes') return c.statut === 'CONFIRMEE';
        if (filtreKpi === 'partielles') return c.statut === 'PARTIELLEMENT_RECEPTIONNEE';
        if (filtreKpi === 'receptionnees') return c.statut === 'RECEPTIONNEE';
        return true;
      }),
    [commandes.data, filtreStatut, fournisseurQuery, filtreKpi, magasin.boutiqueId],
  );

  function setVue(vue: FiltreKpi) {
    const next = new URLSearchParams(searchParams);
    if (vue === 'all') next.delete('vue');
    else next.set('vue', vue);
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (fournisseurQuery) setFournisseurId(fournisseurQuery);
  }, [fournisseurQuery]);

  useEffect(() => {
    if (!ouvrirQuery || !peutCommander || ouvertDepuisUrl.current) return;
    if (!produits.isSuccess) return;
    if (fournisseurQuery) setFournisseurId(fournisseurQuery);
    setLignes([]);
    setNotes('');
    setFormErr(null);
    setModalNouveau(true);
    ouvertDepuisUrl.current = true;
  }, [ouvrirQuery, peutCommander, fournisseurQuery, produits.isSuccess]);

  const creer = useMutation({
    mutationFn: () =>
      apiFetch<CommandeAchatDto>('/achats/commandes', {
        method: 'POST',
        body: JSON.stringify({
          fournisseurId,
          notes: notes.trim() || undefined,
          lignes: lignes
            .filter((l) => l.produitId && Number(l.quantite) > 0 && Number(l.prixUnitaire) > 0)
            .map((l) => ({
              produitId: l.produitId,
              quantite: Number(l.quantite),
              prixUnitaire: Number(l.prixUnitaire),
            })),
        }),
      }),
    onSuccess: (c) => {
      setModalNouveau(false);
      setFormErr(null);
      void queryClient.invalidateQueries({ queryKey: ['achats-commandes'] });
      void queryClient.invalidateQueries({ queryKey: ['fournisseurs-synthese'] });
      navigate(`/achats/commandes/${c.id}`);
    },
    onError: (e) => setFormErr(messageDepuisApi(e, 'Création refusée.')),
  });

  if (!peutLire) return <p>Vous n’avez pas accès aux commandes d’achat.</p>;

  const insightBrouillon = insightCommandesBrouillon(kpis.brouillons);
  const insightOuvertes = insightCommandesOuvertes(kpis.ouvertes, kpis.unitesOuvertes);
  const insightPartielles = insightCommandesPartielles(kpis.partielles);
  const insightReceptionnees = insightCommandesReceptionnees(kpis.receptionnees);

  return (
    <div>
      <PageHeader
        title="Bons de commande"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Cycle Achats : brouillon → confirmée → réception (plafonnée à la quantité commandée) → clôture. Pas d’écriture de caisse.',
        })}
        actions={
          <div className="page-header-actions-row">
            <Link className="btn btn-secondary" to="/achats/factures">
              Factures
            </Link>
            {peutCommander ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setFournisseurId(fournisseurQuery || (fournActifs[0]?.id ?? ''));
                  setLignes([]);
                  setNotes('');
                  setFormErr(null);
                  setModalNouveau(true);
                }}
              >
                Nouvelle commande
              </button>
            ) : null}
          </div>
        }
      />

      {commandes.isLoading && <LoadingState label="Chargement des commandes..." />}
      {commandes.isError && <p role="alert">Erreur de chargement des commandes.</p>}

      {commandes.data && (
        <>
          <section className="kpi-grid dash-kpi-grid" aria-label="Pilotage commandes">
            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'brouillon' ? ' kpi-actif' : ''}`}
              onClick={() => setVue(filtreKpi === 'brouillon' ? 'all' : 'brouillon')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <FileText size={16} />
                </span>
                <InfoTooltip insight={insightBrouillon} />
              </div>
              <div className="kpi-label">Brouillons</div>
              <div className="kpi-value">{kpis.brouillons}</div>
              <div className="kpi-hint">À confirmer</div>
            </button>

            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'ouvertes' ? ' kpi-actif' : ''}${kpis.ouvertes > 0 ? ' kpi-warning' : ''}`}
              onClick={() => setVue(filtreKpi === 'ouvertes' ? 'all' : 'ouvertes')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <ShoppingBag size={16} />
                </span>
                <InfoTooltip insight={insightOuvertes} />
              </div>
              <div className="kpi-label">Ouvertes</div>
              <div className="kpi-value">{kpis.ouvertes}</div>
              <div className="kpi-hint">{kpis.unitesOuvertes} unité(s) à recevoir</div>
            </button>

            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'partielles' ? ' kpi-actif' : ''}${kpis.partielles > 0 ? ' kpi-warning' : ''}`}
              onClick={() => setVue(filtreKpi === 'partielles' ? 'all' : 'partielles')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Package size={16} />
                </span>
                <InfoTooltip insight={insightPartielles} />
              </div>
              <div className="kpi-label">Partielles</div>
              <div className="kpi-value">{kpis.partielles}</div>
              <div className="kpi-hint">Réception incomplète</div>
            </button>

            <button
              type="button"
              className={`kpi-card dash-kpi${filtreKpi === 'receptionnees' ? ' kpi-actif' : ''}`}
              onClick={() => setVue(filtreKpi === 'receptionnees' ? 'all' : 'receptionnees')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <CheckCircle2 size={16} />
                </span>
                <InfoTooltip insight={insightReceptionnees} />
              </div>
              <div className="kpi-label">Réceptionnées</div>
              <div className="kpi-value">{kpis.receptionnees}</div>
              <div className="kpi-hint">À clôturer</div>
            </button>
          </section>

          <div className="toolbar">
            <FiltreMagasinSiege id="bc-filtre-magasin" />
            <div>
              <label htmlFor="filtre-bc-statut">Statut</label>
              <select
                id="filtre-bc-statut"
                value={filtreStatut}
                onChange={(e) =>
                  setFiltreStatut(e.target.value as CommandeAchatDto['statut'] | '')
                }
              >
                <option value="">Tous</option>
                {(Object.keys(STATUT_COMMANDE) as CommandeAchatDto['statut'][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUT_COMMANDE[s]}
                  </option>
                ))}
              </select>
            </div>
            {filtreKpi !== 'all' && (
              <button type="button" className="btn btn-ghost" onClick={() => setVue('all')}>
                Effacer le filtre vue
              </button>
            )}
            <p className="lead">
              {liste.length} commande(s)
              {filtreKpi !== 'all' ? ` · filtre ${filtreKpi}` : ''}
              {filtreStatut ? ` · ${STATUT_COMMANDE[filtreStatut]}` : ''}
              {fournisseurQuery
                ? ` · ${
                    commandes.data?.find((c) => c.fournisseurId === fournisseurQuery)
                      ?.fournisseur.nom ?? 'ce fournisseur'
                  }`
                : ''}
            </p>
          </div>
          <ListPanel title="Commandes">
            {commandes.data.length === 0 ? (
              <EmptyState
                title="Aucune commande"
                description="Créez un bon de commande puis confirmez-le avant de réceptionner."
              />
            ) : liste.length === 0 ? (
              <EmptyState
                title="Aucun résultat"
                description="Aucune commande ne correspond à ce statut."
              />
            ) : (
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Fournisseur</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Réception</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((row) => (
                      <tr
                        key={row.id}
                        className="produit-row"
                        tabIndex={0}
                        role="link"
                        aria-label={`Ouvrir ${row.numero}`}
                        onClick={() => navigate(`/achats/commandes/${row.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/achats/commandes/${row.id}`);
                          }
                        }}
                      >
                        <td>
                          <strong>{row.numero}</strong>
                        </td>
                        <td>{row.fournisseur.nom}</td>
                        <td>
                          <span className={badgeCommande(row.statut)}>
                            {STATUT_COMMANDE[row.statut]}
                          </span>
                        </td>
                        <td>{new Date(row.dateCommande).toLocaleDateString('fr-FR')}</td>
                        <td className="money">{fmtFcfa(row.montant)}</td>
                        <td>
                          <div className="bc-list-recept">
                            <span>
                              {row.quantiteRecue}/{row.quantite}
                            </span>
                            <div className="inventaire-progress" aria-hidden>
                              <span
                                style={{
                                  width: `${
                                    row.quantite === 0
                                      ? 0
                                      : Math.min(
                                          100,
                                          Math.round(
                                            (row.quantiteRecue / row.quantite) * 100,
                                          ),
                                        )
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ListPanel>
        </>
      )}

      {peutCommander && (
        <Modal
          open={modalNouveau}
          onClose={() => setModalNouveau(false)}
          title="Nouveau bon de commande"
          size="doc"
        >
          <BonCommandeComposer
            fournisseurs={fournActifs}
            produits={actifs}
            statsFournisseur={ficheFournisseur.data?.produits ?? []}
            statsLoading={ficheFournisseur.isFetching}
            fournisseurId={fournisseurId}
            onFournisseurId={setFournisseurId}
            lignes={lignes}
            onLignes={setLignes}
            notes={notes}
            onNotes={setNotes}
            formErr={formErr}
            submitting={creer.isPending}
            onSubmit={() => creer.mutate()}
            onCancel={() => setModalNouveau(false)}
          />
        </Modal>
      )}
    </div>
  );
}
