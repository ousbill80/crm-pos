import { slugifyProduitDesignation } from './produit-slug.util';

describe('slugifyProduitDesignation', () => {
  it('normalise accents et espaces', () => {
    expect(slugifyProduitDesignation('Antibrouillard LED H11 blanc')).toBe(
      'antibrouillard-led-h11-blanc',
    );
    expect(slugifyProduitDesignation('Housse cuir PU 5 places — noir')).toBe(
      'housse-cuir-pu-5-places-noir',
    );
  });

  it('retourne une chaîne vide si rien de slugifiable', () => {
    expect(slugifyProduitDesignation('   ')).toBe('');
  });
});
