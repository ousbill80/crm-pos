import { calculerRecommandationAchat } from './recommandation-achat.calculator';
import {
  calculerBesoinReappro,
  repartirBesoinReappro,
} from './recommandation-achat.context';

describe('calcul de recommandation achat', () => {
  it('explique le besoin depuis ventes, stock réel, réservations, transit, min/max et délai réel', () => {
    expect(
      calculerRecommandationAchat({
        ventesQuantite: 90,
        fenetreJours: 30,
        stockCourant: 20,
        stockReserve: 4,
        stockEnTransit: 5,
        stockMin: 10,
        stockMax: 50,
        delaiFournisseurJours: 7,
      }),
    ).toEqual({
      ventesMoyennesParJour: 3,
      demandePendantDelai: 21,
      stockDisponible: 16,
      stockProjeteALivraison: 0,
      quantiteRecommandee: 50,
      formule:
        'max(0, stockMax - max(0, stockCourant - stockReserve + stockEnTransit - ceil(ventesMoyennesParJour × delaiFournisseurJours)))',
      declencheur: 'STOCK_PROJETE_INFERIEUR_OU_EGAL_AU_MIN',
    });
  });

  it('ne recommande rien si le stock projeté reste au-dessus du minimum', () => {
    expect(
      calculerRecommandationAchat({
        ventesQuantite: 10,
        fenetreJours: 30,
        stockCourant: 100,
        stockReserve: 0,
        stockEnTransit: 0,
        stockMin: 10,
        stockMax: 50,
        delaiFournisseurJours: 5,
      }).quantiteRecommandee,
    ).toBe(0);
  });
});

describe('chemin de calcul réappro intelligent', () => {
  it('réutilise calculerRecommandationAchat puis répartit hub / achat', () => {
    const besoin = calculerBesoinReappro({
      ventesQuantite: 90,
      fenetreJours: 30,
      stockCourant: 20,
      stockReserve: 4,
      stockEnTransit: 5,
      stockMin: 10,
      stockMax: 50,
      delaiFournisseurJours: 7,
    });
    expect(besoin.besoin).toBe(50);
    expect(besoin.declencheur).toBe('STOCK_PROJETE_INFERIEUR_OU_EGAL_AU_MIN');
    expect(besoin.recommandation?.formule).toContain('stockMax');

    expect(repartirBesoinReappro(50, 20)).toEqual({
      quantiteTransfert: 20,
      quantiteAchat: 30,
      route: 'MIXTE',
    });
    expect(repartirBesoinReappro(15, 40)).toEqual({
      quantiteTransfert: 15,
      quantiteAchat: 0,
      route: 'TRANSFERER',
    });
  });

  it('sans délai observé ne invente pas de lead-time et calcule seulement le trou immédiat', () => {
    const besoin = calculerBesoinReappro({
      ventesQuantite: 90,
      fenetreJours: 30,
      stockCourant: 5,
      stockReserve: 0,
      stockEnTransit: 0,
      stockMin: 10,
      stockMax: 40,
      delaiFournisseurJours: null,
    });
    expect(besoin.recommandation).toBeNull();
    expect(besoin.besoin).toBe(35);
    expect(besoin.declencheur).toBe(
      'STOCK_PROJETE_INFERIEUR_OU_EGAL_AU_MIN_SANS_DELAI',
    );
  });
});
