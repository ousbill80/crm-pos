import { formatTauxTva, montantTvaUnitaire, prixVitrine } from './prix';

describe('prix shop — vitrine vs commande', () => {
  it('affiche le TTC en vitrine même si prixAffiche est HT', () => {
    expect(
      prixVitrine({
        prixAffiche: 15000,
        prixUnitaireTtc: 17700,
      }),
    ).toBe(17700);
  });

  it('retombe sur prixAffiche si le TTC est absent', () => {
    expect(prixVitrine({ prixAffiche: 15000 })).toBe(15000);
  });
});

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
