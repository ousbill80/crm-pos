import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

// Dashboard Reporting §6.3.4 — source unique : GET /reporting/dashboard.
export interface ReportingDashboard {
  perimetre: 'RESEAU' | 'ZONE' | 'BOUTIQUE';
  genereAt: string;
  chiffreAffaires: {
    total: string;
    parBoutique: Array<{
      boutiqueId: string;
      nomBoutique: string;
      montant: string;
    }>;
  };
  versements: {
    parStatut: Array<{ statut: string; nombre: number; montant: string }>;
    enRetard24h: number;
  };
  ecarts: {
    nombreLitiges: number;
    montantEcartsAbsolus: string;
  };
  tresorerie: {
    totalSoldesAuxiliaires: string;
    caisses: Array<{
      caisseId: string;
      type: string;
      boutiqueId: string | null;
      solde: string;
    }>;
  };
  crm: {
    nombreClients: number;
    parSegment: Array<{ segment: string; nombre: number }>;
  };
}

function useReportingDashboard() {
  return useQuery({
    queryKey: ['reporting', 'dashboard'],
    queryFn: () => apiFetch<ReportingDashboard>('/reporting/dashboard'),
  });
}

function formatFcfa(value: string) {
  return `${value} FCFA`;
}

export function DashboardPage() {
  const { data, isLoading, isError, error } = useReportingDashboard();

  if (isLoading) {
    return <p>Chargement du tableau de bord...</p>;
  }

  if (isError) {
    return <p role="alert">Erreur reporting : {(error as Error).message}</p>;
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="lead">
            Périmètre <strong>{data.perimetre}</strong> · mis à jour{' '}
            {new Date(data.genereAt).toLocaleString()}
          </p>
        </div>
      </header>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Chiffre d&apos;affaires</div>
          <div className="kpi-value">{formatFcfa(data.chiffreAffaires.total)}</div>
          <div className="kpi-hint">
            {data.chiffreAffaires.parBoutique.length} boutique(s)
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Trésorerie auxiliaire</div>
          <div className="kpi-value">
            {formatFcfa(data.tresorerie.totalSoldesAuxiliaires)}
          </div>
          <div className="kpi-hint">{data.tresorerie.caisses.length} caisse(s)</div>
        </div>
        <div
          className={
            data.versements.enRetard24h > 0 ? 'kpi-card kpi-warning' : 'kpi-card'
          }
        >
          <div className="kpi-label">Versements en retard</div>
          <div className="kpi-value">{data.versements.enRetard24h}</div>
          <div className="kpi-hint">&gt; 24 h non transmis</div>
        </div>
        <div
          className={
            data.ecarts.nombreLitiges > 0 ? 'kpi-card kpi-danger' : 'kpi-card'
          }
        >
          <div className="kpi-label">Litiges / écarts</div>
          <div className="kpi-value">{data.ecarts.nombreLitiges}</div>
          <div className="kpi-hint">
            {formatFcfa(data.ecarts.montantEcartsAbsolus)} cumulés
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Clients CRM</div>
          <div className="kpi-value">{data.crm.nombreClients}</div>
          <div className="kpi-hint">fichier consolidé réseau</div>
        </div>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>CA par boutique</h2>
          {data.chiffreAffaires.parBoutique.length === 0 ? (
            <p className="lead">Aucune vente sur la période.</p>
          ) : (
            <ul>
              {data.chiffreAffaires.parBoutique.map((b) => (
                <li key={b.boutiqueId}>
                  <span>{b.nomBoutique}</span>
                  <span className="money">{formatFcfa(b.montant)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Versements par statut</h2>
          <ul>
            {data.versements.parStatut
              .filter((s) => s.nombre > 0)
              .map((s) => (
                <li key={s.statut}>
                  <span>
                    {s.statut} · {s.nombre}
                  </span>
                  <span className="money">{formatFcfa(s.montant)}</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Soldes de caisse</h2>
          <ul>
            {data.tresorerie.caisses.map((c) => (
              <li key={c.caisseId}>
                <span>
                  {c.type}{' '}
                  <small style={{ color: 'var(--text-muted)' }}>
                    {c.caisseId.slice(0, 8)}
                  </small>
                </span>
                <span className="money">{formatFcfa(c.solde)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Segments clients</h2>
          <ul>
            {data.crm.parSegment.map((s) => (
              <li key={s.segment}>
                <span>{s.segment}</span>
                <span className="money">{s.nombre}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
