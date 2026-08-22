import { describe, expect, it } from 'vitest';
import { quantiteRetournee, type RetourVenteDto } from './pos-retours';

function retour(overrides: Partial<RetourVenteDto> = {}): RetourVenteDto {
  return {
    id: 'r1',
    venteId: 'v1',
    ligneVenteId: 'l1',
    quantite: 1,
    montantRembourse: '1000',
    sessionCaisseId: 's1',
    utilisateurId: 'u1',
    dateHeure: new Date().toISOString(),
    ...overrides,
  };
}

describe('quantiteRetournee', () => {
  it('additionne la quantité de plusieurs retours pour une même ligne', () => {
    const retours = [
      retour({ id: 'r1', ligneVenteId: 'l1', quantite: 2 }),
      retour({ id: 'r2', ligneVenteId: 'l1', quantite: 1 }),
    ];
    expect(quantiteRetournee(retours, 'l1')).toBe(3);
  });

  it('retourne 0 pour une ligne sans retour', () => {
    expect(quantiteRetournee([], 'l1')).toBe(0);
    expect(
      quantiteRetournee([retour({ ligneVenteId: 'autre' })], 'l1'),
    ).toBe(0);
  });

  it('ignore les retours appartenant à d’autres lignes', () => {
    const retours = [
      retour({ id: 'r1', ligneVenteId: 'l1', quantite: 2 }),
      retour({ id: 'r2', ligneVenteId: 'l2', quantite: 5 }),
    ];
    expect(quantiteRetournee(retours, 'l1')).toBe(2);
    expect(quantiteRetournee(retours, 'l2')).toBe(5);
  });
});
