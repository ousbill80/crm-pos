import {
  transitionDevisAutorisee,
  transitionsDevisAutorisees,
} from './devis-transitions';

describe('devis-transitions (hors CDC, documentées)', () => {
  it('autorise le parcours nominal et les annulations', () => {
    expect(transitionsDevisAutorisees('BROUILLON')).toEqual([
      'ENVOYE',
      'ANNULE',
    ]);
    expect(transitionsDevisAutorisees('ENVOYE')).toEqual([
      'ACCEPTE',
      'REFUSE',
      'ANNULE',
    ]);
    expect(transitionsDevisAutorisees('ACCEPTE')).toEqual(['TRANSFORME']);
    expect(transitionsDevisAutorisees('REFUSE')).toEqual([]);
    expect(transitionsDevisAutorisees('ANNULE')).toEqual([]);
    expect(transitionsDevisAutorisees('TRANSFORME')).toEqual([]);
  });

  it('refuse les sauts interdits', () => {
    expect(transitionDevisAutorisee('BROUILLON', 'ACCEPTE')).toBe(false);
    expect(transitionDevisAutorisee('ENVOYE', 'TRANSFORME')).toBe(false);
    expect(transitionDevisAutorisee('ACCEPTE', 'ANNULE')).toBe(false);
    expect(transitionDevisAutorisee('REFUSE', 'ENVOYE')).toBe(false);
  });
});
