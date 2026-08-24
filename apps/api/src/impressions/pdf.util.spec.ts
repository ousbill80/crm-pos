import { fmtFcfaPdf, latiniserTextePdf } from './pdf.util';

describe('fmtFcfaPdf — séparateur de milliers Helvetica-safe', () => {
  it('écrit 2000 en « 2 000 FCFA » sans slash (U+202F → / en WinAnsi)', () => {
    const texte = fmtFcfaPdf(2000);
    expect(texte).toBe('2 000 FCFA');
    expect(texte).not.toMatch(/\//);
    expect(texte).not.toMatch(/[\u00a0\u202f]/);
  });

  it('conserve les milliers pour 2500 et 3000', () => {
    expect(fmtFcfaPdf(2500)).toBe('2 500 FCFA');
    expect(fmtFcfaPdf('3000.40')).toBe('3 000 FCFA');
  });

  it('latiniserTextePdf remplace l’espace fine par un espace ASCII', () => {
    expect(latiniserTextePdf('2\u202f000')).toBe('2 000');
  });
});
