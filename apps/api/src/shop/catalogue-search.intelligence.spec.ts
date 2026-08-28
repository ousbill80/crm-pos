import {
  detectMarqueInText,
  interpretCatalogueQuery,
  marqueSearchTerms,
} from './catalogue-search.intelligence';

describe('catalogue-search.intelligence', () => {
  it('détecte Mercedes et ses alias', () => {
    expect(detectMarqueInText('mercedes')).toBe('MERCEDES');
    expect(detectMarqueInText('Mercedes-Benz')).toBe('MERCEDES');
    expect(detectMarqueInText('AMG')).toBe('MERCEDES');
    expect(detectMarqueInText('vw')).toBe('VOLKSWAGEN');
    expect(detectMarqueInText('citroen')).toBe('CITROËN');
    expect(detectMarqueInText('land rover')).toBe('LAND ROVER');
  });

  it('interprète marque + pièce (tokens restants)', () => {
    const q = interpretCatalogueQuery({
      recherche: 'freins mercedes classe c',
    });
    expect(q.marque).toBe('MERCEDES');
    expect(q.tokens.map((t) => t.toLowerCase())).toEqual(
      expect.arrayContaining(['freins', 'classe']),
    );
    expect(q.tokens.some((t) => /mercedes/i.test(t))).toBe(false);
    expect(q.categorieImplied).toBe('Mécanique');
  });

  it('filtre marque explicite prioritaire', () => {
    const q = interpretCatalogueQuery({
      recherche: 'jante',
      marque: 'BMW',
    });
    expect(q.marque).toBe('BMW');
    expect(q.tokens).toEqual(['jante']);
    expect(q.categorieImplied).toBe('Jantes & Pneus');
  });

  it('expose les alias de recherche marque', () => {
    expect(marqueSearchTerms('VOLKSWAGEN')).toEqual(
      expect.arrayContaining(['volkswagen', 'vw']),
    );
  });
});
