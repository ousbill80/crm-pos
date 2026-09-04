import { colorSwatch } from './productPresentation';

describe('colorSwatch', () => {
  it('résout une couleur exacte', () => {
    expect(colorSwatch('Noir')).toBe('#1a1c22');
  });

  it('résout « Teintes neutres » en pastille beige', () => {
    expect(colorSwatch('Teintes neutres')).toBe('#cbb8a0');
  });

  it('renvoie toujours une couleur, même inconnue', () => {
    expect(colorSwatch('édition limitée')).toMatch(/^hsl\(/);
  });
});
