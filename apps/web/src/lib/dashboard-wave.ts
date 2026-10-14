import type { Severity } from './insights/types';

export interface VenteQuotidienneWave {
  date: string;
  total: string;
  nombre: number;
}

export interface PeriodeKpi {
  montant: number;
  nombreVentes: number;
  /** Variation vs la période équivalente précédente, null si rien à comparer. */
  deltaPct: number | null;
}

export interface VenteWavePeriodes {
  jour: PeriodeKpi;
  semaine: PeriodeKpi;
  mois: PeriodeKpi;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, delta: number): Date {
  const copie = new Date(d);
  copie.setDate(copie.getDate() + delta);
  return copie;
}

function deltaPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel > 0 ? 100 : null;
  return ((actuel - precedent) / precedent) * 100;
}

function sommerPlage(
  parJour: Map<string, { total: number; nombre: number }>,
  from: Date,
  to: Date,
): { montant: number; nombreVentes: number } {
  let montant = 0;
  let nombreVentes = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const entree = parJour.get(toDateKey(d));
    if (entree) {
      montant += entree.total;
      nombreVentes += entree.nombre;
    }
  }
  return { montant, nombreVentes };
}

/**
 * Agrège la série quotidienne (API /reporting/ventes-quotidiennes) en 3 KPI
 * "parlants" pour le DG : jour, semaine glissante (7j), mois civil en cours —
 * chacun comparé à la période équivalente précédente. La série doit couvrir
 * au moins 62 jours pour que la comparaison du mois civil soit possible.
 */
export function agregerVentesPeriodes(
  serie: VenteQuotidienneWave[],
  aujourdHui: Date,
): VenteWavePeriodes {
  const parJour = new Map<string, { total: number; nombre: number }>();
  for (const j of serie) {
    parJour.set(j.date, { total: Number(j.total), nombre: j.nombre });
  }

  const auj = new Date(aujourdHui);
  auj.setHours(0, 0, 0, 0);

  const jourActuel = sommerPlage(parJour, auj, auj);
  const jourPrecedent = sommerPlage(parJour, addDays(auj, -1), addDays(auj, -1));

  const semaineActuelle = sommerPlage(parJour, addDays(auj, -6), auj);
  const semainePrecedente = sommerPlage(parJour, addDays(auj, -13), addDays(auj, -7));

  const debutMois = new Date(auj.getFullYear(), auj.getMonth(), 1);
  const moisActuel = sommerPlage(parJour, debutMois, auj);

  const nJoursEcoules = auj.getDate();
  const debutMoisPrecedent = new Date(auj.getFullYear(), auj.getMonth() - 1, 1);
  const finMoisPrecedent = addDays(debutMoisPrecedent, nJoursEcoules - 1);
  const moisPrecedent = sommerPlage(parJour, debutMoisPrecedent, finMoisPrecedent);

  return {
    jour: {
      montant: jourActuel.montant,
      nombreVentes: jourActuel.nombreVentes,
      deltaPct: deltaPct(jourActuel.montant, jourPrecedent.montant),
    },
    semaine: {
      montant: semaineActuelle.montant,
      nombreVentes: semaineActuelle.nombreVentes,
      deltaPct: deltaPct(semaineActuelle.montant, semainePrecedente.montant),
    },
    mois: {
      montant: moisActuel.montant,
      nombreVentes: moisActuel.nombreVentes,
      deltaPct: deltaPct(moisActuel.montant, moisPrecedent.montant),
    },
  };
}

export interface MessageDg {
  severity: Severity;
  message: string;
}

/**
 * Synthèse en une phrase simple pour le DG : priorité à la rupture de stock
 * (bloque les ventes), sinon à une tendance de CA mensuel en forte baisse,
 * sinon message rassurant. Pas de nouveau seuil métier : "forte baisse" = le
 * même seuil de vigilance (15 %) que celui déjà utilisé pour la marge dans
 * lib/insights/dashboard.ts.
 */
export function syntheserMessageDg(
  periodes: VenteWavePeriodes,
  stock: { sante: 'OK' | 'VIGILANCE' | 'CRITIQUE'; ruptures: number },
): MessageDg {
  if (stock.sante === 'CRITIQUE') {
    return {
      severity: 'critical',
      message: `${stock.ruptures} article(s) en rupture de stock — ces ventes sont bloquées tant que le stock n'est pas reconstitué.`,
    };
  }
  if (periodes.mois.deltaPct !== null && periodes.mois.deltaPct <= -15) {
    return {
      severity: 'warning',
      message: `Les ventes du mois sont en baisse de ${Math.abs(periodes.mois.deltaPct).toFixed(0)} % par rapport au mois dernier.`,
    };
  }
  if (stock.sante === 'VIGILANCE') {
    return {
      severity: 'warning',
      message: 'Certains articles approchent la rupture de stock — un réapprovisionnement est à prévoir.',
    };
  }
  if (periodes.mois.deltaPct !== null && periodes.mois.deltaPct > 0) {
    return {
      severity: 'ok',
      message: `Les ventes progressent de ${periodes.mois.deltaPct.toFixed(0)} % ce mois et le stock est sous contrôle.`,
    };
  }
  return {
    severity: 'ok',
    message: 'Les ventes sont stables et le stock est sous contrôle.',
  };
}
