import { formatTauxTva, montantTvaUnitaire } from './prix';

describe('prix shop — détail TVA', () => {
  it('reprend le montant fourni par l’API', () => {
    expect(
      montantTvaUnitaire({
        prixUnitaireHt: 15000,
        prixUnitaireTtc: 17700,
        montantTva: 2700,
      }),
    ).toBe(2700);
  });

  it('calcule TVA = TTC − HT si le montant est absent', () => {
    expect(
      montantTvaUnitaire({
        prixUnitaireHt: 15000,
        prixUnitaireTtc: 17700,
      }),
    ).toBe(2700);
  });

  it('formate le taux', () => {
    expect(formatTauxTva(18)).toBe('18 %');
    expect(formatTauxTva(8.5)).toBe('8,5 %');
    expect(formatTauxTva(null)).toBeNull();
  });
});
