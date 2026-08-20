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

export function DashboardPage() {
  const { data, isLoading, isError, error } = useReportingDashboard();

  if (isLoading) {
    return <p>Chargement du tableau de bord...</p>;
  }

  if (isError) {
    return <p>Erreur reporting : {(error as Error).message}</p>;
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      <h1>Tableau de bord</h1>
      <p>
        Périmètre : <strong>{data.perimetre}</strong> — généré à{' '}
        {new Date(data.genereAt).toLocaleString()}
      </p>

      <section>
        <h2>Chiffre d&apos;affaires</h2>
        <p>Total : {data.chiffreAffaires.total} FCFA</p>
        <ul>
          {data.chiffreAffaires.parBoutique.map((b) => (
            <li key={b.boutiqueId}>
              {b.nomBoutique} : {b.montant} FCFA
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Versements</h2>
        <p>En retard (&gt; 24 h) : {data.versements.enRetard24h}</p>
        <ul>
          {data.versements.parStatut
            .filter((s) => s.nombre > 0)
            .map((s) => (
              <li key={s.statut}>
                {s.statut} — {s.nombre} / {s.montant} FCFA
              </li>
            ))}
        </ul>
      </section>

      <section>
        <h2>Écarts / litiges</h2>
        <p>
          {data.ecarts.nombreLitiges} litige(s) — écarts cumulés{' '}
          {data.ecarts.montantEcartsAbsolus} FCFA
        </p>
      </section>

      <section>
        <h2>Trésorerie</h2>
        <p>
          Soldes auxiliaires : {data.tresorerie.totalSoldesAuxiliaires} FCFA
        </p>
        <ul>
          {data.tresorerie.caisses.map((c) => (
            <li key={c.caisseId}>
              {c.type} ({c.caisseId.slice(0, 8)}…) : {c.solde} FCFA
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>CRM</h2>
        <p>{data.crm.nombreClients} client(s)</p>
        <ul>
          {data.crm.parSegment.map((s) => (
            <li key={s.segment}>
              {s.segment} : {s.nombre}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
