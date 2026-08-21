import { Prisma } from '@prisma/client';
import { soldeDepuisAgregats, zero } from './caisse-balance.formulas';

describe('soldeDepuisAgregats (tiroirs / magasin / centrale)', () => {
  it('crédite VENTE et débit SORTIE_FONDS', () => {
    const s = soldeDepuisAgregats({
      ventes: new Prisma.Decimal(1000),
      sortiesFonds: new Prisma.Decimal(400),
      transfertsSortants: zero(),
      transfertsEntrants: zero(),
    });
    expect(s.toString()).toBe('600');
  });

  it('débite TRANSFERT_INTERNE sortant (tiroir → magasin)', () => {
    const s = soldeDepuisAgregats({
      ventes: new Prisma.Decimal(500),
      sortiesFonds: zero(),
      transfertsSortants: new Prisma.Decimal(500),
      transfertsEntrants: zero(),
    });
    expect(s.toString()).toBe('0');
  });

  it('crédite TRANSFERT_INTERNE entrant (miroir magasin)', () => {
    const s = soldeDepuisAgregats({
      ventes: zero(),
      sortiesFonds: zero(),
      transfertsSortants: zero(),
      transfertsEntrants: new Prisma.Decimal(500),
    });
    expect(s.toString()).toBe('500');
  });

  it('magasin : entrants − SORTIE_FONDS vers centrale', () => {
    const s = soldeDepuisAgregats({
      ventes: zero(),
      sortiesFonds: new Prisma.Decimal(300),
      transfertsSortants: zero(),
      transfertsEntrants: new Prisma.Decimal(800),
    });
    expect(s.toString()).toBe('500');
  });
});
