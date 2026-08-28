import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PackageCheck, Search, ShieldCheck, Warehouse } from 'lucide-react';
import { p2pApi } from '../lib/p2p';
import { fmtDateHeure } from '../lib/achats-ui';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ListPanel, PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { hasP2pRole } from '../lib/p2p';

const LABELS = {
  QUANTITATIVE: 'En quarantaine',
  QUALITE_VALIDEE: 'Qualité validée',
  MISE_EN_STOCK: 'Mise en stock',
};

export function P2pReceiptsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const peutLire = hasP2pRole(user?.role, 'lectureAchats');
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const receptions = useQuery({
    queryKey: ['p2p-receptions'],
    queryFn: p2pApi.receptions,
    enabled: peutLire,
  });
  const liste = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (receptions.data ?? []).filter((r) =>
      (!statut || r.statut === statut) &&
      (!needle || `${r.numero} ${r.commande.numero} ${r.fournisseur.nom} ${r.referenceLivraison ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [q, receptions.data, statut]);

  if (!peutLire) return <p role="alert">Vous n’avez pas accès aux réceptions P2P.</p>;
  return (
    <div className="p2p-module">
      <PageHeader
        title="Réceptions & qualité"
        subtitle="Réception multi-ligne en quarantaine, contrôle indépendant, coûts rendus, putaway et retours fournisseur."
        actions={<><Link className="btn btn-secondary" to="/stocks">Stocks</Link><Link className="btn btn-secondary" to="/achats/commandes">Commandes</Link></>}
      />
      <nav className="p2p-subnav" aria-label="Réceptions"><Link to="/achats/receptions">File des réceptions</Link><Link to="/achats/commandes">Commandes à recevoir</Link></nav>
      {receptions.isLoading && <LoadingState label="Chargement des réceptions…" />}
      {receptions.isError && <p role="alert">Impossible de charger les réceptions.</p>}
      {receptions.data && (
        <>
          <section className="kpi-grid dash-kpi-grid">
            {[
              ['Quarantaine', 'QUANTITATIVE', PackageCheck],
              ['Qualité validée', 'QUALITE_VALIDEE', ShieldCheck],
              ['Mises en stock', 'MISE_EN_STOCK', Warehouse],
            ].map(([label, value, Icon]) => (
              <button key={String(value)} type="button" className={`kpi-card dash-kpi${statut === value ? ' kpi-actif' : ''}`} onClick={() => setStatut(statut === value ? '' : String(value))}>
                <div className="dash-kpi-top"><span className="dash-kpi-icon"><Icon size={16} /></span></div>
                <div className="kpi-label">{String(label)}</div>
                <div className="kpi-value">{receptions.data.filter((r) => r.statut === value).length}</div>
                <div className="kpi-hint">Séparation réception / qualité</div>
              </button>
            ))}
          </section>
          <div className="toolbar p2p-toolbar">
            <label className="p2p-search"><Search size={15} /><span className="sr-only">Rechercher</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Réception, BC, fournisseur…" /></label>
            <label>Statut<select value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous</option>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <ListPanel title={`Réceptions · ${liste.length}`}>
            {liste.length === 0 ? <EmptyState title="Aucune réception" description="Les réceptions quantitatives créées depuis une commande approuvée apparaîtront ici." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Réception</th><th>Commande</th><th>Fournisseur</th><th>Statut</th><th>Lignes</th><th>Quarantaine</th></tr></thead>
                <tbody>{liste.map((row) => (
                  <tr key={row.id} role="link" tabIndex={0} className="produit-row" onClick={() => navigate(`/achats/receptions/${row.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/achats/receptions/${row.id}`); }}>
                    <td><strong>{row.numero}</strong><small>{fmtDateHeure(row.dateReception)}{row.referenceLivraison ? ` · BL ${row.referenceLivraison}` : ''}</small></td>
                    <td>{row.commande.numero}</td><td>{row.fournisseur.nom}</td>
                    <td><span className={row.statut === 'MISE_EN_STOCK' ? 'badge badge-ok' : 'badge badge-warning'}>{LABELS[row.statut]}</span></td>
                    <td>{row.lignes.length} · {row.lignes.reduce((sum, l) => sum + l.quantiteRecue, 0)} unité(s)</td>
                    <td>{row.emplacementQuarantaine.code}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </ListPanel>
        </>
      )}
    </div>
  );
}
