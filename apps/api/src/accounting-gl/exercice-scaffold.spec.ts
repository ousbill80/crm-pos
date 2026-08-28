import { periodesMensuellesExercice } from './exercice-scaffold';

describe('periodesMensuellesExercice', () => {
  it('opens twelve UTC months covering the calendar year', () => {
    const months = periodesMensuellesExercice(2027);
    expect(months).toHaveLength(12);
    expect(months[0].code).toBe('2027-01');
    expect(months[0].dateDebut.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(months[11].code).toBe('2027-12');
    expect(months[11].dateFin.toISOString()).toBe('2027-12-31T23:59:59.999Z');
    expect(months[1].dateFin.toISOString()).toBe('2027-02-28T23:59:59.999Z');
  });
});
