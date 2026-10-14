import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Package,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PageHeader } from '../components/PageChrome';
import { LoadingState } from '../components/LoadingState';
import { InfoTooltip } from '../components/InfoTooltip';
import {
  insightSanteStock,
  insightValeurInventaire,
} from '../lib/insights/stocks';
import {
  agregerVentesPeriodes,
  syntheserMessageDg,
  type VenteQuotidienneWave,
} from '../lib/dashboard-wave';
import type { StockSyntheseDto } from '../lib/types';

// Fenêtre nécessaire pour comparer le mois civil en cours au même nombre de
// jours du mois précédent (cf. agregerVentesPeriodes) : au plus 31 + 31 jours.
const FENETRE_JOURS = 62;

function formatFcfa(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function Tendance({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span>Pas de comparaison disponible</span>;
  const hausse = deltaPct >= 0;
  return (
    <span className={hausse ? 'trend-up' : 'trend-down'}>
      {hausse ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(deltaPct).toFixed(0)} % vs période précédente
    </span>
  );
}

function useVentesWave() {
  return useQuery({
    queryKey: ['reporting', 'ventes-quotidiennes', FENETRE_JOURS],
    queryFn: () =>
      apiFetch<VenteQuotidienneWave[]>(`/reporting/ventes-quotidiennes?jours=${FENETRE_JOURS}`),
  });
}

function useStockSynthese() {
  return useQuery({
    queryKey: ['stocks', 'synthese', 'dg-simple'],
    queryFn: () => apiFetch<StockSyntheseDto>('/stocks/synthese'),
  });
}

export function DashboardDgSimple() {
  const ventes = useVentesWave();
  const stock = useStockSynthese();

  const isLoading = ventes.isLoading || stock.isLoading;
  const isError = ventes.isError || stock.isError;

  return (
    <div className="dash-wave">
      <PageHeader title="Vue d'ensemble" subtitle="Réseau entier — chiffres clés du jour" />

      {isLoading && <LoadingState label="Chargement…" />}
      {isError && <p role="alert">Erreur de chargement des indicateurs.</p>}

      {ventes.data && stock.data && (
        <DashboardDgSimpleContenu ventesSerie={ventes.data} stock={stock.data} />
      )}
    </div>
  );
}

function DashboardDgSimpleContenu({
  ventesSerie,
  stock,
}: {
  ventesSerie: VenteQuotidienneWave[];
  stock: StockSyntheseDto;
}) {
  const periodes = agregerVentesPeriodes(ventesSerie, new Date());
  const message = syntheserMessageDg(periodes, { sante: stock.sante, ruptures: stock.kpis.ruptures });

  return (
    <>
      <section className={`dash-sante dash-sante-${message.severity}`}>
        <div className="dash-sante-main">
          <span className="dash-sante-badge">
            {message.severity === 'critical'
              ? 'Attention'
              : message.severity === 'warning'
                ? 'Vigilance'
                : 'Tout va bien'}
          </span>
          <p>{message.message}</p>
        </div>
      </section>

      <div className="kpi-grid dash-kpi-grid">
        <Link to="/finance?tab=resultat" className="kpi-card dash-kpi dash-kpi-hero">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <ShoppingCart size={16} />
            </span>
          </div>
          <div className="kpi-label">Chiffre d&apos;affaires — ce mois</div>
          <div className="kpi-value">{formatFcfa(periodes.mois.montant)}</div>
          <div className="kpi-hint dash-kpi-trend">
            <span>{periodes.mois.nombreVentes} vente(s) ce mois · </span>
            <Tendance deltaPct={periodes.mois.deltaPct} />
          </div>
        </Link>

        <Link to="/finance?tab=resultat" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <ShoppingCart size={16} />
            </span>
          </div>
          <div className="kpi-label">Aujourd&apos;hui</div>
          <div className="kpi-value">{formatFcfa(periodes.jour.montant)}</div>
          <div className="kpi-hint dash-kpi-trend">
            <span>{periodes.jour.nombreVentes} vente(s) · </span>
            <Tendance deltaPct={periodes.jour.deltaPct} />
          </div>
        </Link>

        <Link to="/finance?tab=resultat" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <ShoppingCart size={16} />
            </span>
          </div>
          <div className="kpi-label">Cette semaine</div>
          <div className="kpi-value">{formatFcfa(periodes.semaine.montant)}</div>
          <div className="kpi-hint dash-kpi-trend">
            <span>{periodes.semaine.nombreVentes} vente(s) · </span>
            <Tendance deltaPct={periodes.semaine.deltaPct} />
          </div>
        </Link>

        <Link
          to="/stocks"
          className={
            stock.sante === 'CRITIQUE'
              ? 'kpi-card dash-kpi kpi-danger'
              : stock.sante === 'VIGILANCE'
                ? 'kpi-card dash-kpi kpi-warning'
                : 'kpi-card dash-kpi'
          }
        >
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <Package size={16} />
            </span>
            <InfoTooltip
              insight={insightSanteStock(stock.sante, stock.kpis.ruptures, stock.kpis.sousSeuil)}
            />
          </div>
          <div className="kpi-label">Niveau de stock</div>
          <div className="kpi-value">
            {stock.sante === 'OK'
              ? 'Au complet'
              : stock.sante === 'VIGILANCE'
                ? 'À surveiller'
                : 'Rupture'}
          </div>
          <div className="kpi-hint">
            {stock.kpis.ruptures} rupture(s) · {stock.kpis.sousSeuil} sous seuil
          </div>
        </Link>

        <Link to="/stocks" className="kpi-card dash-kpi">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon">
              <Wallet size={16} />
            </span>
            <InfoTooltip
              insight={insightValeurInventaire(
                stock.kpis.valeurStock,
                stock.kpis.unitesTotales,
                stock.kpis.skuDistincts,
              )}
            />
          </div>
          <div className="kpi-label">Valeur de la marchandise en stock</div>
          <div className="kpi-value">{formatFcfa(Number(stock.kpis.valeurStock))}</div>
          <div className="kpi-hint">{stock.kpis.unitesTotales} unité(s) en stock</div>
        </Link>
      </div>
    </>
  );
}
