import {
  transitionFactureClientAutorisee,
  transitionsFactureClientAutorisees,
} from './facture-client-transitions';

describe('facture-client-transitions (hors CDC, documentées)', () => {
  it('autorise le parcours brouillon → émise | annulée', () => {
    expect(transitionsFactureClientAutorisees('BROUILLON')).toEqual([
      'EMISE',
      'ANNULEE',
    ]);
    expect(transitionsFactureClientAutorisees('EMISE')).toEqual([]);
    expect(transitionsFactureClientAutorisees('ANNULEE')).toEqual([]);
  });

  it('refuse les sauts interdits (émission irréversible, pas de réouverture)', () => {
    expect(transitionFactureClientAutorisee('EMISE', 'ANNULEE')).toBe(false);
    expect(transitionFactureClientAutorisee('EMISE', 'BROUILLON')).toBe(false);
    expect(transitionFactureClientAutorisee('ANNULEE', 'BROUILLON')).toBe(
      false,
    );
    expect(transitionFactureClientAutorisee('ANNULEE', 'EMISE')).toBe(false);
    expect(transitionFactureClientAutorisee('BROUILLON', 'BROUILLON')).toBe(
      false,
    );
  });
});
