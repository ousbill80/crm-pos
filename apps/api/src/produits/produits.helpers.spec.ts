import { Prisma } from '@prisma/client';
import {
  enrichirProduit,
  quantitePourSortirAlerte,
  statutStockOf,
} from './produits.helpers';

describe('produits.helpers — indicateurs catalogue §6.3.2', () => {
  it('classe RUPTURE dès que le stock réseau est à 0, même avec un seuil', () => {
    expect(statutStockOf({ stock: 0, seuilReappro: 5 })).toBe('RUPTURE');
    expect(statutStockOf({ stock: 0, seuilReappro: null })).toBe('RUPTURE');
  });

  it('classe SOUS_SEUIL uniquement si stock > 0 et stock <= seuil', () => {
    expect(statutStockOf({ stock: 5, seuilReappro: 5 })).toBe('SOUS_SEUIL');
    expect(statutStockOf({ stock: 3, seuilReappro: 5 })).toBe('SOUS_SEUIL');
    expect(statutStockOf({ stock: 6, seuilReappro: 5 })).toBe('OK');
    expect(statutStockOf({ stock: 10, seuilReappro: null })).toBe('OK');
  });

  it("calcule l'écart minimum pour sortir de l'alerte STOCK_BAS (stock > seuil)", () => {
    expect(quantitePourSortirAlerte({ stock: 3, seuilReappro: 5 })).toBe(3);
    expect(quantitePourSortirAlerte({ stock: 5, seuilReappro: 5 })).toBe(1);
    expect(quantitePourSortirAlerte({ stock: 6, seuilReappro: 5 })).toBe(0);
    expect(quantitePourSortirAlerte({ stock: 0, seuilReappro: null })).toBe(0);
  });

  it('expose la marge unitaire comme prix − CMP (même formule que la valorisation stock)', () => {
    const enrichi = enrichirProduit({
      id: 'p1',
      designation: 'Test',
      reference: 'T-1',
      categorie: 'Audio',
      description: null,
      imageUrl: null,
      actif: true,
      typeProduit: 'ARTICLE',
      prixUnitaire: new Prisma.Decimal('1000.00'),
      stock: 10,
      coutMoyenPondere: new Prisma.Decimal('400.00'),
      seuilReappro: 5,
      codeBarres: null,
      uniteMesure: 'UN',
      facteurUnite: new Prisma.Decimal(1),
      parentId: null,
      attributs: null,
      methodeCout: 'CMP',
      coutStandard: new Prisma.Decimal(0),
      strategieSortie: 'FIFO',
    });
    expect(enrichi.margeUnitaire).toBe('600.00');
    expect(enrichi.tauxMarge).toBe('60.0');
    expect(enrichi.valeurStock).toBe('4000.00');
    expect(enrichi.statutStock).toBe('OK');
  });
});
