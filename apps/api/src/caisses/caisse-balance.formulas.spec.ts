import { Prisma, TypeTransaction } from '@prisma/client';
import {
  libelleEcriture,
  sensEcriture,
  soldeDepuisAgregats,
  zero,
} from './caisse-balance.formulas';

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

describe('sensEcriture / libelleEcriture', () => {
  it('VENTE = crédit', () => {
    expect(
      sensEcriture({ type: TypeTransaction.VENTE, transactionSourceId: null }),
    ).toBe('CREDIT');
  });

  it('SORTIE_FONDS = débit', () => {
    expect(
      sensEcriture({
        type: TypeTransaction.SORTIE_FONDS,
        transactionSourceId: null,
      }),
    ).toBe('DEBIT');
  });

  it('TRANSFERT source = débit, miroir = crédit', () => {
    expect(
      sensEcriture({
        type: TypeTransaction.TRANSFERT_INTERNE,
        transactionSourceId: null,
      }),
    ).toBe('DEBIT');
    expect(
      sensEcriture({
        type: TypeTransaction.TRANSFERT_INTERNE,
        transactionSourceId: 'src-1',
      }),
    ).toBe('CREDIT');
  });

  it('libellés métier', () => {
    expect(
      libelleEcriture({
        type: TypeTransaction.TRANSFERT_INTERNE,
        transactionSourceId: null,
      }),
    ).toMatch(/sortant/i);
    expect(
      libelleEcriture({
        type: TypeTransaction.TRANSFERT_INTERNE,
        transactionSourceId: 'x',
      }),
    ).toMatch(/reçu/i);
  });
});
