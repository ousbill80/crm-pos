import { type MouseEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  PackageCheck,
  QrCode,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { apiFetch, messageDepuisApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, ListPanel } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import {
  FiltreMagasinSiege,
  libellePerimetrePage,
  useFiltreMagasinSiege,
} from '../components/FiltreMagasinSiege';
import {
  LABEL_FULFILLMENT,
  LABEL_REGLEMENT,
  LABEL_STATUT_CMD_WEB,
  ROLES_COMMANDES_WEB_ECRITURE,
  aEncaisserAuRetrait,
  badgeStatutCmdWeb,
  contactCommandeWeb,
  estClickCollect,
  fmtDateHeure,
  fmtFcfa,
  nbArticles,
  referenceCommandeWeb,
  type CommandeWebListItem,
} from '../lib/commandes-web-ui';

type VueKpi =
  | 'all'
  | 'click-collect'
  | 'livraison'
  | 'a-preparer'
  | 'pretes'
  | 'a-encaisser'
  | 'expedition'
  | 'paiement';

function setVueParam(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams, opts?: { replace?: boolean }) => void,
  vue: VueKpi,
) {
  const next = new URLSearchParams(searchParams);
  if (vue === 'all') next.delete('vue');
  else next.set('vue', vue);
  setSearchParams(next, { replace: true });
}

export default function CommandesWebPage() {
  const { user } = useAuth();
  const magasin = useFiltreMagasinSiege();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const vue = (searchParams.get('vue') as VueKpi | null) ?? 'all';
  const peutEcrire =
    user !== null && ROLES_COMMANDES_WEB_ECRITURE.includes(user.role);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['commandes-web'],
    queryFn: () => apiFetch<CommandeWebListItem[]>('/commandes-web'),
    refetchInterval: 15_000,
  });

  const statutMut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) =>
      apiFetch(`/commandes-web/${id}/statut`, {
        method: 'PATCH',
        body: JSON.stringify({ statut }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commandes-web'] });
    },
  });

  const rows = data ?? [];

  const kpis = useMemo(() => {
    const clickCollect = rows.filter(estClickCollect);
    const livraison = rows.filter((c) => !estClickCollect(c));
    return {
      clickCollect: clickCollect.filter(
        (c) => !['ANNULEE', 'REMBOURSEE', 'REMISE'].includes(c.statut),
      ).length,
      aPreparer: clickCollect.filter(
        (c) => c.statut === 'PREPARATION' || c.statut === 'PAYEE',
      ).length,
      pretes: clickCollect.filter((c) => c.statut === 'PRETE').length,
      aEncaisser: clickCollect.filter(aEncaisserAuRetrait).length,
      expedition: livraison.filter((c) => c.statut === 'EXPEDIEE').length,
      paiement: rows.filter((c) => c.statut === 'EN_ATTENTE_PAIEMENT').length,
    };
  }, [rows]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return rows.filter((c) => {
      if (magasin.boutiqueId && c.boutiqueRetraitId !== magasin.boutiqueId) {
        return false;
      }
      if (filtreStatut && c.statut !== filtreStatut) return false;
      if (vue === 'click-collect' && !estClickCollect(c)) return false;
      if (vue === 'livraison' && estClickCollect(c)) return false;
      if (vue === 'a-preparer') {
        if (!estClickCollect(c)) return false;
        if (c.statut !== 'PREPARATION' && c.statut !== 'PAYEE') return false;
      }
      if (vue === 'pretes' && c.statut !== 'PRETE') return false;
      if (vue === 'a-encaisser' && !aEncaisserAuRetrait(c)) return false;
      if (vue === 'expedition' && c.statut !== 'EXPEDIEE') return false;
      if (vue === 'paiement' && c.statut !== 'EN_ATTENTE_PAIEMENT') return false;
      if (q) {
        const contact = contactCommandeWeb(c);
        const hay = [
          c.id,
          contact.nom,
          contact.email,
          contact.telephone,
          c.boutiqueRetrait?.nom,
          c.suiviToken,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, magasin.boutiqueId, filtreStatut, vue, recherche]);

  function setVue(next: VueKpi) {
    setVueParam(searchParams, setSearchParams, vue === next ? 'all' : next);
  }

  function marquerPrete(e: MouseEvent, c: CommandeWebListItem) {
    e.preventDefault();
    e.stopPropagation();
    if (
      window.confirm(
        `Marquer la commande ${referenceCommandeWeb(c.id)} prête au retrait ? Le client sera notifié.`,
      )
    ) {
      statutMut.mutate({ id: c.id, statut: 'PRETE' });
    }
  }

  return (
    <div className="cmd-web-page">
      <PageHeader
        title="Commandes web"
        subtitle={libellePerimetrePage(user?.role, {
          boutiqueId: magasin.boutiqueId,
          nomMagasin: magasin.nomMagasin,
          texteReseau:
            'Click & collect : préparer → prête → remettre (scan QR) → vente POS. Livraison : préparer → expédier → livrer.',
          texteBoutique:
            'File click & collect de votre magasin — préparer, marquer prête, remettre au client.',
        })}
        actions={
          <div className="page-header-actions-row">
            <Link className="btn btn-primary" to="/ventes/commandes-web-scan">
              <QrCode size={16} /> Scanner QR retrait
            </Link>
            <Link className="btn btn-secondary" to="/ventes/parametres-shop">
              Paramètres shop
            </Link>
          </div>
        }
      />

      {isLoading && <LoadingState label="Chargement des commandes web…" />}
      {isError && (
        <p role="alert">Impossible de charger les commandes web.</p>
      )}

      {data && (
        <>
          <section className="kpi-grid dash-kpi-grid" aria-label="File click & collect">
            <button
              type="button"
              className={`kpi-card dash-kpi${vue === 'click-collect' ? ' kpi-actif' : ''}`}
              onClick={() => setVue('click-collect')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Store size={16} />
                </span>
              </div>
              <div className="kpi-label">Click & collect</div>
              <div className="kpi-value">{kpis.clickCollect}</div>
              <div className="kpi-hint">En cours magasin</div>
            </button>
            <button
              type="button"
              className={`kpi-card dash-kpi${vue === 'a-preparer' ? ' kpi-actif' : ''}${kpis.aPreparer > 0 ? ' kpi-warning' : ''}`}
              onClick={() => setVue('a-preparer')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <PackageCheck size={16} />
                </span>
              </div>
              <div className="kpi-label">À préparer</div>
              <div className="kpi-value">{kpis.aPreparer}</div>
              <div className="kpi-hint">Retrait boutique</div>
            </button>
            <button
              type="button"
              className={`kpi-card dash-kpi${vue === 'pretes' ? ' kpi-actif' : ''}${kpis.pretes > 0 ? ' kpi-warning' : ''}`}
              onClick={() => setVue('pretes')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <QrCode size={16} />
                </span>
              </div>
              <div className="kpi-label">Prêtes au retrait</div>
              <div className="kpi-value">{kpis.pretes}</div>
              <div className="kpi-hint">Client à accueillir</div>
            </button>
            <button
              type="button"
              className={`kpi-card dash-kpi${vue === 'a-encaisser' ? ' kpi-actif' : ''}${kpis.aEncaisser > 0 ? ' kpi-warning' : ''}`}
              onClick={() => setVue('a-encaisser')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Banknote size={16} />
                </span>
              </div>
              <div className="kpi-label">À encaisser</div>
              <div className="kpi-value">{kpis.aEncaisser}</div>
              <div className="kpi-hint">Paiement au retrait</div>
            </button>
            <button
              type="button"
              className={`kpi-card dash-kpi${vue === 'expedition' ? ' kpi-actif' : ''}`}
              onClick={() => setVue('expedition')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Truck size={16} />
                </span>
              </div>
              <div className="kpi-label">En livraison</div>
              <div className="kpi-value">{kpis.expedition}</div>
              <div className="kpi-hint">Expédiées</div>
            </button>
            <button
              type="button"
              className={`kpi-card dash-kpi${vue === 'paiement' ? ' kpi-actif' : ''}`}
              onClick={() => setVue('paiement')}
            >
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <Wallet size={16} />
                </span>
              </div>
              <div className="kpi-label">Attente paiement</div>
              <div className="kpi-value">{kpis.paiement}</div>
              <div className="kpi-hint">PSP en ligne</div>
            </button>
          </section>

          <div className="toolbar">
            <FiltreMagasinSiege id="cmd-web-magasin" />
            <div>
              <label htmlFor="cmd-web-search">Recherche</label>
              <input
                id="cmd-web-search"
                type="search"
                placeholder="Réf, client, e-mail, tél, magasin"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cmd-web-mode">Mode</label>
              <select
                id="cmd-web-mode"
                value={
                  vue === 'click-collect' || vue === 'livraison' ? vue : ''
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'click-collect' || v === 'livraison') {
                    setVueParam(searchParams, setSearchParams, v);
                  } else {
                    setVueParam(searchParams, setSearchParams, 'all');
                  }
                }}
              >
                <option value="">Tous</option>
                <option value="click-collect">Click & collect</option>
                <option value="livraison">Livraison</option>
              </select>
            </div>
            <div>
              <label htmlFor="cmd-web-statut">Statut</label>
              <select
                id="cmd-web-statut"
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
              >
                <option value="">Tous</option>
                {Object.entries(LABEL_STATUT_CMD_WEB).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {(vue !== 'all' || filtreStatut || recherche || magasin.boutiqueId) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setFiltreStatut('');
                  setRecherche('');
                  setVueParam(searchParams, setSearchParams, 'all');
                  if (magasin.boutiqueId) magasin.setBoutiqueId('');
                }}
              >
                Réinitialiser
              </button>
            )}
          </div>

          {statutMut.isError && (
            <p role="alert">
              {messageDepuisApi(statutMut.error, 'Transition refusée.')}
            </p>
          )}

          {liste.length === 0 ? (
            <EmptyState
              title="Aucune commande dans cette file"
              description="Changez les filtres, ou attendez une commande click & collect payée / en préparation."
            />
          ) : (
            <ListPanel
              title={`${liste.length} commande${liste.length > 1 ? 's' : ''}`}
            >
              <div className="clients-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Réf.</th>
                      <th>Client</th>
                      <th>Magasin / mode</th>
                      <th>Statut</th>
                      <th className="num">Articles</th>
                      <th className="num">Montant</th>
                      <th>Créée</th>
                      <th>Traitement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((c) => {
                      const contact = contactCommandeWeb(c);
                      const peutPrete =
                        peutEcrire && (c.transitions ?? []).includes('PRETE');
                      return (
                        <tr key={c.id}>
                          <td>
                            <Link to={`/ventes/commandes-web/${c.id}`}>
                              <strong>{referenceCommandeWeb(c.id)}</strong>
                            </Link>
                          </td>
                          <td>
                            <div>{contact.nom}</div>
                            <div className="muted">
                              {contact.telephone || contact.email || '—'}
                            </div>
                          </td>
                          <td>
                            <div>
                              {LABEL_FULFILLMENT[c.modeFulfillment] ??
                                c.modeFulfillment}
                            </div>
                            <div className="muted">
                              {c.boutiqueRetrait?.nom ??
                                LABEL_REGLEMENT[c.modeReglement] ??
                                c.modeReglement}
                            </div>
                          </td>
                          <td>
                            <span className={badgeStatutCmdWeb(c.statut)}>
                              {LABEL_STATUT_CMD_WEB[c.statut] ?? c.statut}
                            </span>
                            {aEncaisserAuRetrait(c) && (
                              <div className="muted">Espèces au retrait</div>
                            )}
                            {c.conversionVente && (
                              <div className="muted">Vente POS créée</div>
                            )}
                          </td>
                          <td className="num">{nbArticles(c)}</td>
                          <td className="num money">{fmtFcfa(c.montantTotal)}</td>
                          <td>{fmtDateHeure(c.createdAt)}</td>
                          <td>
                            <div className="table-actions">
                              {peutPrete && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={statutMut.isPending}
                                  onClick={(e) => marquerPrete(e, c)}
                                >
                                  Prête
                                </button>
                              )}
                              {c.statut === 'PRETE' && (
                                <Link
                                  className="btn btn-primary"
                                  to={`/ventes/commandes-web/${c.id}`}
                                >
                                  Remettre
                                </Link>
                              )}
                              {c.statut !== 'PRETE' && !peutPrete && (
                                <Link
                                  className="btn btn-ghost"
                                  to={`/ventes/commandes-web/${c.id}`}
                                >
                                  Ouvrir
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ListPanel>
          )}
        </>
      )}
    </div>
  );
}
