import { describe, expect, it } from 'vitest';
import {
  agregerVentesPeriodes,
  syntheserMessageDg,
  type VenteQuotidienneWave,
} from './dashboard-wave';

function serieConstante(dateDebut: Date, jours: number, total: number, nombre: number): VenteQuotidienneWave[] {
  const serie: VenteQuotidienneWave[] = [];
  for (let i = 0; i < jours; i++) {
    const d = new Date(dateDebut);
    d.setDate(d.getDate() + i);
    serie.push({ date: d.toISOString().slice(0, 10), total: String(total), nombre });
  }
  return serie;
}

describe('agregerVentesPeriodes', () => {
  it('isole le CA et le nombre de ventes du jour, vs hier', () => {
    const aujourdHui = new Date('2026-03-15T00:00:00.000Z');
    const debut = new Date('2026-01-14T00:00:00.000Z'); // 62 jours avant
    const serie = serieConstante(debut, 62, 1000, 2);
    // Jour J : 5000 FCFA / 3 ventes ; hier : 1000 FCFA / 2 ventes (valeur par défaut de la série).
    const idx = serie.findIndex((j) => j.date === '2026-03-15');
    serie[idx] = { date: '2026-03-15', total: '5000', nombre: 3 };

    const periodes = agregerVentesPeriodes(serie, aujourdHui);

    expect(periodes.jour.montant).toBe(5000);
    expect(periodes.jour.nombreVentes).toBe(3);
    expect(periodes.jour.deltaPct).toBe(400); // (5000-1000)/1000 * 100
  });

  it('agrège la semaine glissante (7 derniers jours) vs les 7 jours précédents', () => {
    const aujourdHui = new Date('2026-03-15T00:00:00.000Z');
    const debut = new Date('2026-01-14T00:00:00.000Z');
    const serie = serieConstante(debut, 62, 1000, 1);

    const periodes = agregerVentesPeriodes(serie, aujourdHui);

    // 7 jours à 1000 = 7000, identique à la semaine précédente → delta 0.
    expect(periodes.semaine.montant).toBe(7000);
    expect(periodes.semaine.nombreVentes).toBe(7);
    expect(periodes.semaine.deltaPct).toBe(0);
  });

  it('compare le mois civil en cours au même nombre de jours du mois précédent', () => {
    const aujourdHui = new Date('2026-03-05T00:00:00.000Z'); // 5 jours écoulés en mars
    const debut = new Date('2026-01-01T00:00:00.000Z');
    const serie = serieConstante(debut, 90, 100, 1);
    // Les 5 premiers jours de mars valent 10x plus que la normale.
    for (const j of serie) {
      if (j.date.startsWith('2026-03')) {
        const jourMois = Number(j.date.slice(8, 10));
        if (jourMois <= 5) {
          j.total = '1000';
          j.nombre = 10;
        }
      }
    }

    const periodes = agregerVentesPeriodes(serie, aujourdHui);

    expect(periodes.mois.montant).toBe(5000); // 5 jours à 1000
    expect(periodes.mois.nombreVentes).toBe(50);
    // Même 5 jours en février valaient 100/jour = 500 → hausse de 900 %.
    expect(periodes.mois.deltaPct).toBe(900);
  });
});

describe('syntheserMessageDg', () => {
  const periodesNeutres = {
    jour: { montant: 0, nombreVentes: 0, deltaPct: null },
    semaine: { montant: 0, nombreVentes: 0, deltaPct: null },
    mois: { montant: 0, nombreVentes: 0, deltaPct: null },
  };

  it('priorise la rupture de stock même si les ventes progressent', () => {
    const resultat = syntheserMessageDg(
      { ...periodesNeutres, mois: { montant: 100, nombreVentes: 1, deltaPct: 50 } },
      { sante: 'CRITIQUE', ruptures: 3 },
    );
    expect(resultat.severity).toBe('critical');
    expect(resultat.message).toContain('3 article(s) en rupture');
  });

  it('signale une forte baisse mensuelle (>= 15 %) même si le stock est sain', () => {
    const resultat = syntheserMessageDg(
      { ...periodesNeutres, mois: { montant: 100, nombreVentes: 1, deltaPct: -20 } },
      { sante: 'OK', ruptures: 0 },
    );
    expect(resultat.severity).toBe('warning');
    expect(resultat.message).toContain('baisse de 20 %');
  });

  it('rassure quand les ventes progressent et le stock est sous contrôle', () => {
    const resultat = syntheserMessageDg(
      { ...periodesNeutres, mois: { montant: 100, nombreVentes: 1, deltaPct: 12 } },
      { sante: 'OK', ruptures: 0 },
    );
    expect(resultat.severity).toBe('ok');
    expect(resultat.message).toContain('progressent de 12 %');
  });
});
